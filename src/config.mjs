function positiveInteger(env, name, fallback) {
  const raw = env[name] ?? String(fallback);
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function mcpPathValue(env) {
  const value = env.MCP_PATH || '/mcp';
  if (!value.startsWith('/')) throw new Error('MCP_PATH must start with /');
  if (value.length > 1 && value.endsWith('/')) return value.slice(0, -1);
  return value;
}

function booleanValue(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  throw new Error(`${name} must be true or false`);
}

export function loadConfig(env = process.env) {
  const apiKey = env.API_KEY || 'dummy';
  return Object.freeze({
    port: positiveInteger(env, 'PORT', 3000),
    apiKey,
    batchSize: positiveInteger(env, 'BATCH_SIZE', 3),
    maxChars: positiveInteger(env, 'MAX_CHARS', 10000),
    maxUrls: positiveInteger(env, 'MAX_URLS', 20),
    maxBodyBytes: positiveInteger(env, 'MAX_BODY_BYTES', 262144),
    maxPdfBytes: positiveInteger(env, 'MAX_PDF_BYTES', 20971520),
    pdfCacheDir: env.PDF_CACHE_DIR || '/data/pdf-cache',
    pdfCacheTtlSeconds: positiveInteger(env, 'PDF_CACHE_TTL_SECONDS', 86400),
    gotoTimeout: positiveInteger(env, 'GOTO_TIMEOUT', 8000),
    waitTimeout: positiveInteger(env, 'WAIT_TIMEOUT', 8000),
    headTimeout: positiveInteger(env, 'HEAD_TIMEOUT', 5000),
    fetchTimeout: positiveInteger(env, 'FETCH_TIMEOUT', 15000),
    maxRedirects: positiveInteger(env, 'MAX_REDIRECTS', 5),
    allowPrivateNetwork: booleanValue(env, 'ALLOW_PRIVATE_NETWORK', false),
    locale: env.LOCALE || 'zh-TW',
    timezone: env.TIMEZONE || 'Asia/Taipei',
    acceptLanguage: env.ACCEPT_LANGUAGE || 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    userAgent: env.USER_AGENT || '',
    mcpEnabled: booleanValue(env, 'MCP_ENABLED', true),
    mcpPath: mcpPathValue(env),
    mcpApiKey: env.MCP_API_KEY || apiKey,
    mcpMaxPages: positiveInteger(env, 'MCP_MAX_PAGES', 50),
    mcpServerName: env.MCP_SERVER_NAME || 'awesome-web-fetch',
    mcpServerVersion: env.MCP_SERVER_VERSION || '0.4.0',
  });
}
