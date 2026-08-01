import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWebFetchServer } from '../src/http-server.mjs';

async function withServer(options, callback) {
  const server = createWebFetchServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

const config = {
  apiKey: 'secret',
  batchSize: 3,
  maxChars: 10000,
  maxUrls: 2,
  maxBodyBytes: 1024,
};

test('GET health endpoint returns service status', async () => {
  await withServer({
    config,
    fetchMany: async () => [],
    statusProvider: () => ({ browser: 'Chromium 151' }),
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.browser, 'Chromium 151');
  });
});

test('POST requires bearer authentication', async () => {
  await withServer({ config, fetchMany: async () => [] }, async (baseUrl) => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ urls: ['https://example.com'] }),
    });
    assert.equal(response.status, 401);
  });
});

test('POST passes valid URLs to fetchMany and returns results', async () => {
  let received;
  await withServer({
    config,
    fetchMany: async (urls) => {
      received = urls;
      return [{ page_content: 'Example', metadata: { source: urls[0] } }];
    },
  }, async (baseUrl) => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ urls: ['https://example.com'] }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, ['https://example.com']);
    const body = await response.json();
    assert.equal(body[0].page_content, 'Example');
  });
});

test('POST rejects too many URLs', async () => {
  await withServer({ config, fetchMany: async () => [] }, async (baseUrl) => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ urls: ['https://a.example', 'https://b.example', 'https://c.example'] }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error, /maximum is 2/);
  });
});
