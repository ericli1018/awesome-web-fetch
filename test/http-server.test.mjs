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
      return [{ page_content: 'Example', metadata: { source: urls[0].url } }];
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
    assert.deepEqual(received, [{ url: 'https://example.com', pages: null }]);
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

test('POST forwards selected PDF pages to fetchMany', async () => {
  let received;
  await withServer({
    config,
    fetchMany: async (targets) => {
      received = targets;
      return [{ page_content: 'Selected page', metadata: { source: targets[0].url } }];
    },
  }, async (baseUrl) => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        urls: [{ url: 'https://example.com/manual.pdf', pages: [2, 5, 2] }],
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(received, [
      { url: 'https://example.com/manual.pdf', pages: [2, 5] },
    ]);
  });
});

test('POST /mcp uses the dedicated MCP bearer key and returns JSON-RPC', async () => {
  const mcpConfig = {
    ...config,
    mcpEnabled: true,
    mcpPath: '/mcp',
    mcpApiKey: 'mcp-secret',
  };

  await withServer({
    config: mcpConfig,
    fetchMany: async () => [],
    mcpHandler: async (message) => ({
      jsonrpc: '2.0',
      id: message.id,
      result: { protocolVersion: message.params.protocolVersion },
    }),
  }, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' },
      }),
    });
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer mcp-secret',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' },
      }),
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const body = await response.json();
    assert.equal(body.result.protocolVersion, '2025-06-18');
  });
});

test('MCP initialized notification receives HTTP 202 with no JSON-RPC body', async () => {
  const mcpConfig = {
    ...config,
    mcpEnabled: true,
    mcpPath: '/mcp',
    mcpApiKey: 'mcp-secret',
  };

  await withServer({
    config: mcpConfig,
    fetchMany: async () => [],
    mcpHandler: async () => null,
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer mcp-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    assert.equal(response.status, 202);
    assert.equal(await response.text(), '');
  });
});

test('invalid MCP JSON returns a JSON-RPC parse error', async () => {
  const mcpConfig = {
    ...config,
    mcpEnabled: true,
    mcpPath: '/mcp',
    mcpApiKey: 'mcp-secret',
  };

  await withServer({
    config: mcpConfig,
    fetchMany: async () => [],
    mcpHandler: async () => null,
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer mcp-secret',
        'content-type': 'application/json',
      },
      body: '{broken',
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.jsonrpc, '2.0');
    assert.equal(body.error.code, -32700);
  });
});

test('disabled MCP path returns 404 instead of falling through to REST', async () => {
  const mcpConfig = {
    ...config,
    mcpEnabled: false,
    mcpPath: '/mcp',
    mcpApiKey: 'mcp-secret',
  };

  await withServer({
    config: mcpConfig,
    fetchMany: async () => [],
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });

    assert.equal(response.status, 404);
  });
});
