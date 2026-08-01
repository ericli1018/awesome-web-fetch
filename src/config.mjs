function positiveInteger(env, name, fallback) {
  const raw = env[name] ?? String(fallback);
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
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
  return Object.freeze({
    port: positiveInteger(env, 'PORT', 3000),
    apiKey: env.API_KEY || 'dummy',
    batchSize: positiveInteger(env, 'BATCH_SIZE', 3),
    maxChars: positiveInteger(env, 'MAX_CHARS', 10000),
    maxUrls: positiveInteger(env, 'MAX_URLS', 20),
    maxBodyBytes: positiveInteger(env, 'MAX_BODY_BYTES', 262144),
    maxPdfBytes: positiveInteger(env, 'MAX_PDF_BYTES', 20971520),
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
  });
}
