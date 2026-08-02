import { createServer } from 'node:http';

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function sendEmpty(response, statusCode) {
  response.writeHead(statusCode, { 'cache-control': 'no-store' });
  response.end();
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

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizePages(value) {
  if (value === undefined || value === null) return null;
  const pages = Array.isArray(value) ? value : [value];
  if (pages.length === 0) throw badRequest('pages must not be empty');
  if (pages.some((page) => !Number.isInteger(page) || page <= 0)) {
    throw badRequest('Every page number must be a positive integer');
  }
  return [...new Set(pages)];
}

export function normalizeFetchTargets(value, maxUrls) {
  if (!Array.isArray(value) || value.length === 0) {
    throw badRequest('Missing or empty urls array');
  }
  if (value.length > maxUrls) {
    throw badRequest(`Too many URLs; maximum is ${maxUrls}`);
  }

  return value.map((entry) => {
    if (typeof entry === 'string') {
      if (entry.trim() === '') throw badRequest('Every URL must be a non-empty string');
      return { url: entry.trim(), pages: null };
    }

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw badRequest('Every URL must be a string or an object containing url and optional pages');
    }
    if (typeof entry.url !== 'string' || entry.url.trim() === '') {
      throw badRequest('Every URL object must contain a non-empty url string');
    }

    return {
      url: entry.url.trim(),
      pages: normalizePages(entry.pages),
    };
  });
}

function unauthorizedMcp(response) {
  sendJson(response, 401, {
    jsonrpc: '2.0',
    id: null,
    error: { code: -32001, message: 'Unauthorized' },
  }, { 'www-authenticate': 'Bearer' });
}

export function createWebFetchServer({
  config,
  fetchMany,
  statusProvider = () => ({}),
  mcpHandler,
}) {
  if (typeof fetchMany !== 'function') {
    throw new TypeError('fetchMany must be a function');
  }

  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const isMcpPath = requestUrl.pathname === config.mcpPath;
      const isMcpRequest = Boolean(config.mcpEnabled && isMcpPath);

      if (isMcpPath && !config.mcpEnabled) {
        sendJson(response, 404, { error: 'MCP is disabled' });
        return;
      }

      if (isMcpRequest) {
        if (request.method !== 'POST') {
          sendJson(response, 405, {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32600, message: 'Only POST is supported by this stateless MCP endpoint' },
          }, { allow: 'POST' });
          return;
        }

        const authorization = request.headers.authorization || '';
        if (config.mcpApiKey !== 'dummy' && authorization !== `Bearer ${config.mcpApiKey}`) {
          unauthorizedMcp(response);
          return;
        }
        if (typeof mcpHandler !== 'function') {
          sendJson(response, 503, {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: 'MCP service is unavailable' },
          });
          return;
        }

        let message;
        try {
          message = await readJsonBody(request, config.maxBodyBytes);
        } catch (error) {
          const code = error.statusCode === 413 ? -32600 : -32700;
          sendJson(response, error.statusCode || 400, {
            jsonrpc: '2.0',
            id: null,
            error: {
              code,
              message: code === -32700 ? 'Parse error' : error.message,
            },
          });
          return;
        }

        const reply = await mcpHandler(message);
        if (reply === null || reply === undefined) {
          sendEmpty(response, 202);
        } else {
          sendJson(response, 200, reply);
        }
        return;
      }

      if (request.method === 'GET') {
        sendJson(response, 200, {
          status: 'ok',
          batch_size: config.batchSize,
          max_chars: config.maxChars,
          max_urls: config.maxUrls,
          mcp_enabled: Boolean(config.mcpEnabled),
          mcp_path: config.mcpEnabled ? config.mcpPath : null,
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
      const targets = normalizeFetchTargets(body.urls, config.maxUrls);

      console.log(`Fetching ${targets.length} URL(s), batch_size=${config.batchSize}`);
      const startedAt = Date.now();
      const results = await fetchMany(targets);
      const success = results.filter((result) => result.page_content).length;
      console.log(
        `Completed ${targets.length} URL(s): ${success} succeeded, ${results.length - success} failed, ${Date.now() - startedAt} ms`,
      );

      sendJson(response, 200, results);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) console.error('Request handler error:', error);
      sendJson(response, statusCode, { error: error.message || 'Internal server error' });
    }
  });
}
