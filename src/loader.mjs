import { addExtra } from 'playwright-extra';
import { chromium as playwrightChromium } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { assertAllowedUrl } from './url-policy.mjs';
import { createMetadata } from './metadata.mjs';
import { createPdfCache } from './pdf-cache.mjs';
import { extractPdfContent } from './pdf-extractor.mjs';
import { truncateContent } from './content.mjs';

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

function normalizeTarget(target) {
  return typeof target === 'string' ? { url: target, pages: null } : target;
}

export async function createWebLoader(config) {
  const chromium = addExtra(playwrightChromium);
  chromium.use(StealthPlugin());
  const pdfCache = createPdfCache({
    directory: config.pdfCacheDir,
    ttlSeconds: config.pdfCacheTtlSeconds,
  });

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

  async function downloadPdf(requestUrl) {
    const result = await fetchWithRedirects(
      requestUrl,
      { method: 'GET', headers: requestHeaders() },
      config.fetchTimeout,
    );
    const { response } = result;
    const contentType = response.headers.get('content-type') || '';
    const statusCode = response.status;

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await readResponseBuffer(response, config.maxPdfBytes);

    return {
      buffer,
      finalUrl: result.finalUrl,
      contentType: contentType || 'application/pdf',
      statusCode,
      etag: response.headers.get('etag') || '',
      lastModified: response.headers.get('last-modified') || '',
    };
  }

  async function fetchPdf(sourceUrl, requestUrl = sourceUrl, pages = null) {
    let cacheEntry = null;

    try {
      cacheEntry = await pdfCache.get(sourceUrl, () => downloadPdf(requestUrl));
      const extracted = await extractPdfContent({
        buffer: cacheEntry.buffer,
        pages,
        maxChars: config.maxChars,
      });

      return {
        page_content: extracted.text,
        content_length: extracted.contentLength,
        truncated: extracted.truncated,
        metadata: createMetadata({
          source: sourceUrl,
          finalUrl: cacheEntry.finalUrl,
          title: `PDF (${extracted.totalPages} pages)`,
          contentType: cacheEntry.contentType || 'application/pdf',
          statusCode: cacheEntry.statusCode,
          browserRendered: false,
          type: 'pdf',
          extra: {
            total_pages: extracted.totalPages,
            requested_pages: extracted.requestedPages,
            extracted_pages: extracted.extractedPages,
            extraction_mode: extracted.extractionMode,
            cache_hit: cacheEntry.cacheHit,
          },
        }),
      };
    } catch (error) {
      return {
        page_content: '',
        content_length: 0,
        truncated: false,
        metadata: createMetadata({
          source: sourceUrl,
          finalUrl: cacheEntry?.finalUrl || requestUrl,
          contentType: cacheEntry?.contentType || '',
          statusCode: cacheEntry?.statusCode ?? null,
          browserRendered: false,
          type: 'pdf',
          error: `PDF error: ${error.message}`,
          extra: {
            total_pages: Number.isInteger(error.totalPages) ? error.totalPages : null,
            requested_pages: error.requestedPages || pages,
            extracted_pages: error.extractedPages || [],
            extraction_mode: pages ? 'selected_pages' : 'full_document',
            cache_hit: cacheEntry?.cacheHit ?? false,
            ...(error.invalidPages ? { invalid_pages: error.invalidPages } : {}),
          },
        }),
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

  async function fetchPage(url, pages = null) {
    const context = await newContext();
    const page = await context.newPage();
    let downloadTriggered = false;
    let blockedNavigation = '';
    let finalUrl = url;
    let contentType = '';
    let statusCode = null;

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

      finalUrl = page.url() || response?.url() || url;
      statusCode = response?.status() ?? null;
      contentType = (await response?.headerValue('content-type')) || '';

      if (blockedNavigation) throw new Error(blockedNavigation);
      if (downloadTriggered) return fetchPdf(url, finalUrl, pages);

      if (contentType.toLowerCase().includes('application/pdf')) {
        return fetchPdf(url, finalUrl, pages);
      }

      await page
        .waitForSelector('article, main, [class*="article"], [class*="content"], #content', {
          timeout: config.waitTimeout,
        })
        .catch(() => {});

      const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
      const title = await page.title().catch(() => '');
      const content = truncateContent(text, config.maxChars);

      return {
        page_content: content.text,
        content_length: content.contentLength,
        truncated: content.truncated,
        metadata: createMetadata({
          source: url,
          finalUrl,
          title,
          contentType: contentType || 'text/html',
          statusCode,
          browserRendered: true,
          type: 'html',
        }),
      };
    } catch (error) {
      if (error.message.includes('Download is starting')) return fetchPdf(url, finalUrl, pages);
      const currentUrl = page.url();
      if (/^https?:\/\//i.test(currentUrl)) finalUrl = currentUrl;

      return {
        page_content: '',
        content_length: 0,
        truncated: false,
        metadata: createMetadata({
          source: url,
          finalUrl,
          contentType,
          statusCode,
          browserRendered: true,
          type: 'html',
          error: error.message,
        }),
      };
    } finally {
      await context.close();
    }
  }

  async function fetchUrl(rawTarget) {
    const target = normalizeTarget(rawTarget);
    const { url, pages = null } = target;

    try {
      await validateUrl(url);
      if (await isDownloadUrl(url)) return fetchPdf(url, url, pages);
      return fetchPage(url, pages);
    } catch (error) {
      return {
        page_content: '',
        content_length: 0,
        truncated: false,
        metadata: createMetadata({
          source: url,
          finalUrl: url,
          statusCode: null,
          contentType: '',
          browserRendered: false,
          error: error.message,
        }),
      };
    }
  }

  async function fetchMany(targets) {
    const results = [];
    for (let offset = 0; offset < targets.length; offset += config.batchSize) {
      const batch = targets.slice(offset, offset + config.batchSize);
      const batchResults = await Promise.all(batch.map((target) => fetchUrl(target)));
      results.push(...batchResults);
    }
    return results;
  }

  return {
    fetchOne: fetchUrl,
    fetchMany,
    status: () => ({
      browser: browserVersion,
      pdf_cache_dir: config.pdfCacheDir,
      pdf_cache_ttl_seconds: config.pdfCacheTtlSeconds,
    }),
    close: () => browser.close(),
  };
}
