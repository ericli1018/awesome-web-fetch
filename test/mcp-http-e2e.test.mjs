import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWebFetchServer } from '../src/http-server.mjs';
import { createMcpProtocol } from '../src/mcp-protocol.mjs';

const config = {
  apiKey: 'rest-secret',
  batchSize: 3,
  maxChars: 10000,
  maxUrls: 20,
  maxBodyBytes: 262144,
  mcpEnabled: true,
  mcpPath: '/mcp',
  mcpApiKey: 'mcp-secret',
  mcpMaxPages: 50,
  mcpServerName: 'awesome-web-fetch',
  mcpServerVersion: '0.4.0',
};

async function withServer(callback) {
  let received;
  const mcp = createMcpProtocol({
    config,
    fetchOne: async (target) => {
      received = target;
      return {
        page_content: 'Example content',
        content_length: 15,
        truncated: false,
        metadata: {
          source: target.url,
          final_url: `${target.url}/final`,
          title: 'Example',
          content_type: 'text/html',
          status_code: 200,
          browser_rendered: true,
          type: 'html',
        },
      };
    },
  });

  const server = createWebFetchServer({
    config,
    fetchMany: async () => [],
    mcpHandler: mcp.handleMessage,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const { port } = server.address();
    await callback(`http://127.0.0.1:${port}`, () => received);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function callMcp(baseUrl, payload) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer mcp-secret',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(payload),
  });
  return { response, body: response.status === 202 ? null : await response.json() };
}

test('remote MCP completes initialize, tools/list, and tools/call over HTTP', async () => {
  await withServer(async (baseUrl, getReceived) => {
    const initialized = await callMcp(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'Hermes Agent', version: 'test' },
      },
    });
    assert.equal(initialized.response.status, 200);
    assert.equal(initialized.body.result.serverInfo.name, 'awesome-web-fetch');

    const listed = await callMcp(baseUrl, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    assert.deepEqual(listed.body.result.tools.map((tool) => tool.name), ['fetch_url']);

    const called = await callMcp(baseUrl, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'fetch_url',
        arguments: { url: 'https://example.com' },
      },
    });

    assert.deepEqual(getReceived(), { url: 'https://example.com', pages: null });
    assert.equal(called.body.result.structuredContent.ok, true);
    assert.match(called.body.result.content[0].text, /Example content/);
  });
});
