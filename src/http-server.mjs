import { createServer } from 'node:http';

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request, maxBodyBytes) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error(`Request body exceeds ${maxBodyBytes} bytes`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON request body');
    error.statusCode = 400;
    throw error;
  }
}

function validateUrls(value, maxUrls) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Missing or empty urls array');
  }
  if (value.length > maxUrls) {
    throw new Error(`Too many URLs; maximum is ${maxUrls}`);
  }
  if (value.some((url) => typeof url !== 'string' || url.trim() === '')) {
    throw new Error('Every URL must be a non-empty string');
  }
  return value.map((url) => url.trim());
}

export function createWebFetchServer({ config, fetchMany, statusProvider = () => ({}) }) {
  if (typeof fetchMany !== 'function') {
    throw new TypeError('fetchMany must be a function');
  }

  return createServer(async (request, response) => {
    try {
      if (request.method === 'GET') {
        sendJson(response, 200, {
          status: 'ok',
          batch_size: config.batchSize,
          max_chars: config.maxChars,
          max_urls: config.maxUrls,
          ...statusProvider(),
        });
        return;
      }

      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'Method not allowed' });
        return;
      }

      const authorization = request.headers.authorization || '';
      if (config.apiKey !== 'dummy' && authorization !== `Bearer ${config.apiKey}`) {
        sendJson(response, 401, { error: 'Unauthorized' });
        return;
      }

      const body = await readJsonBody(request, config.maxBodyBytes);
      const urls = validateUrls(body.urls, config.maxUrls);

      console.log(`Fetching ${urls.length} URL(s), batch_size=${config.batchSize}`);
      const startedAt = Date.now();
      const results = await fetchMany(urls);
      const success = results.filter((result) => result.page_content).length;
      console.log(
        `Completed ${urls.length} URL(s): ${success} succeeded, ${results.length - success} failed, ${Date.now() - startedAt} ms`,
      );

      sendJson(response, 200, results);
    } catch (error) {
      const statusCode = error.statusCode || (error.message?.startsWith('Too many URLs') || error.message?.startsWith('Missing') || error.message?.startsWith('Every URL') ? 400 : 500);
      if (statusCode >= 500) console.error('Request handler error:', error);
      sendJson(response, statusCode, { error: error.message || 'Internal server error' });
    }
  });
}
