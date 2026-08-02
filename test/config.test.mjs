import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';

test('loadConfig parses numeric and boolean environment values', () => {
  const config = loadConfig({
    PORT: '3100',
    BATCH_SIZE: '5',
    MAX_CHARS: '20000',
    MAX_URLS: '10',
    MAX_BODY_BYTES: '65536',
    MAX_PDF_BYTES: '1048576',
    GOTO_TIMEOUT: '9000',
    WAIT_TIMEOUT: '4000',
    HEAD_TIMEOUT: '3000',
    FETCH_TIMEOUT: '12000',
    ALLOW_PRIVATE_NETWORK: 'true',
  });

  assert.equal(config.port, 3100);
  assert.equal(config.batchSize, 5);
  assert.equal(config.maxChars, 20000);
  assert.equal(config.allowPrivateNetwork, true);
});

test('loadConfig rejects invalid positive integers', () => {
  assert.throws(() => loadConfig({ PORT: '0' }), /PORT must be a positive integer/);
});

test('loadConfig reads PDF cache settings', () => {
  const config = loadConfig({
    PDF_CACHE_DIR: '/cache/pdf',
    PDF_CACHE_TTL_SECONDS: '7200',
  });

  assert.equal(config.pdfCacheDir, '/cache/pdf');
  assert.equal(config.pdfCacheTtlSeconds, 7200);
});
