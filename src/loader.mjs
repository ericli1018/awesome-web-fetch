import { createRequire } from 'node:module';
import { addExtra } from 'playwright-extra';
import { chromium as playwrightChromium } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { assertAllowedUrl } from './url-policy.mjs';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function responseLooksDownload(response, url) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const disposition = (response.headers.get('content-disposition') || '').toLowerCase();
  const pathname = new URL(url).pathname.toLowerCase();

  return (
    contentType.includes('application/pdf') ||
    contentType.includes('application/octet-stream') ||
    contentType.includes('application/msword') ||
    contentType.includes('officedocument') ||
    disposition.includes('attachment') ||
    pathname.endsWith('.pdf')
  );
}

async function readResponseBuffer(response, maxBytes) {
  const contentLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
  if (contentLength > maxBytes) {
    throw new Error(`Response is too large: ${contentLength} bytes, maximum is ${maxBytes}`);
  }

  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('Response exceeds configured maximum');
      throw new Error(`Response exceeds maximum size of ${maxBytes} bytes`);
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks, total);
}

export async function createWebLoader(config) {
  const chromium = addExtra(playwrightChromium);
  chromium.use(StealthPlugin());

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--disable-default-apps',
      '--window-size=1920,1080',
      `--lang=${config.locale}`,
    ],
  });

  browser.on('disconnected', () => {
    console.error('Chromium disconnected unexpectedly');
    process.exitCode = 1;
  });

  const browserVersion = browser.version();
  console.log(`Browser launched: ${browserVersion}`);

  async function validateUrl(value) {
    return assertAllowedUrl(value, config.allowPrivateNetwork);
  }

  async function fetchWithRedirects(input, init, timeout) {
    let current = await validateUrl(input);

    for (let redirectCount = 0; redirectCount <= config.maxRedirects; redirectCount += 1) {
      const response = await fetch(current, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeout),
      });

      if (!isRedirectStatus(response.status)) {
        return { response, finalUrl: current.href };
      }

      const location = response.headers.get('location');
      if (!location) return { response, finalUrl: current.href };
      if (redirectCount === config.maxRedirects) {
        throw new Error(`Too many redirects; maximum is ${config.maxRedirects}`);
      }

      current = await validateUrl(new URL(location, current).href);
    }

    throw new Error('Redirect handling failed');
  }

  function requestHeaders() {
    return {
      'Accept-Language': config.acceptLanguage,
      ...(config.userAgent ? { 'User-Agent': config.userAgent } : {}),
    };
  }

  async function isDownloadUrl(url) {
    if (new URL(url).pathname.toLowerCase().endsWith('.pdf')) return true;

    try {
      const { response, finalUrl } = await fetchWithRedirects(
        url,
        { method: 'HEAD', headers: requestHeaders() },
        config.headTimeout,
      );
      return responseLooksDownload(response, finalUrl);
    } catch {
      return false;
    }
  }

  async function fetchPdf(url) {
    try {
      const { response, finalUrl } = await fetchWithRedirects(
        url,
        { method: 'GET', headers: requestHeaders() },
        config.fetchTimeout,
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await readResponseBuffer(response, config.maxPdfBytes);
      const data = await pdfParse(buffer);

      return {
        page_content: (data.text || '').trim().slice(0, config.maxChars),
        metadata: {
          source: url,
          final_url: finalUrl,
          title: `PDF (${data.numpages || 0} pages)`,
          type: 'pdf',
        },
      };
    } catch (error) {
      return {
        page_content: '',
        metadata: { source: url, type: 'pdf', error: `PDF error: ${error.message}` },
      };
    }
  }

  async function newContext() {
    return browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: config.locale,
      timezoneId: config.timezone,
      ...(config.userAgent ? { userAgent: config.userAgent } : {}),
      extraHTTPHeaders: {
        'Accept-Language': config.acceptLanguage,
      },
      acceptDownloads: true,
    });
  }

  async function fetchPage(url) {
    const context = await newContext();
    const page = await context.newPage();
    let downloadTriggered = false;
    let blockedNavigation = '';

    await page.route('**/*', async (route) => {
      const request = route.request();
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        try {
          await validateUrl(request.url());
        } catch (error) {
          blockedNavigation = error.message;
          await route.abort('blockedbyclient');
          return;
        }
      }
      await route.continue();
    });

    page.on('download', async (download) => {
      downloadTriggered = true;
      await download.cancel().catch(() => {});
    });

    try {
      const response = await page.goto(url, {
        timeout: config.gotoTimeout,
        waitUntil: 'domcontentloaded',
      });

      if (blockedNavigation) throw new Error(blockedNavigation);
      if (downloadTriggered) return fetchPdf(url);

      const contentType = (await response?.headerValue('content-type')) || '';
      if (contentType.toLowerCase().includes('application/pdf')) {
        return fetchPdf(page.url() || url);
      }

      await page
        .waitForSelector('article, main, [class*="article"], [class*="content"], #content', {
          timeout: config.waitTimeout,
        })
        .catch(() => {});

      const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
      const title = await page.title().catch(() => '');

      return {
        page_content: (text || '').trim().slice(0, config.maxChars),
        metadata: {
          source: url,
          final_url: page.url() || url,
          title: title || '',
          type: 'html',
        },
      };
    } catch (error) {
      if (error.message.includes('Download is starting')) return fetchPdf(url);
      return {
        page_content: '',
        metadata: { source: url, type: 'html', error: error.message },
      };
    } finally {
      await context.close();
    }
  }

  async function fetchUrl(url) {
    try {
      await validateUrl(url);
      if (await isDownloadUrl(url)) return fetchPdf(url);
      return fetchPage(url);
    } catch (error) {
      return {
        page_content: '',
        metadata: { source: url, error: error.message },
      };
    }
  }

  async function fetchMany(urls) {
    const results = [];
    for (let offset = 0; offset < urls.length; offset += config.batchSize) {
      const batch = urls.slice(offset, offset + config.batchSize);
      const batchResults = await Promise.all(batch.map((url) => fetchUrl(url)));
      results.push(...batchResults);
    }
    return results;
  }

  return {
    fetchMany,
    status: () => ({ browser: browserVersion }),
    close: () => browser.close(),
  };
}
