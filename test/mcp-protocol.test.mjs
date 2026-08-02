import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMcpProtocol,
  MCP_SERVER_INSTRUCTIONS,
  MCP_TOOL_DESCRIPTION,
} from '../src/mcp-protocol.mjs';

const silentLogger = { error() {} };

const config = {
  mcpServerName: 'awesome-web-fetch',
  mcpServerVersion: '0.4.0',
  mcpMaxPages: 50,
};

function request(id, method, params) {
  return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
}

test('MCP initialize negotiates the client protocol version and advertises tools', async () => {
  const protocol = createMcpProtocol({
    config,
    fetchOne: async () => { throw new Error('not called'); },
    logger: silentLogger,
  });

  const response = await protocol.handleMessage(request(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'Hermes Agent', version: '1.0.0' },
  }));

  assert.equal(response.result.protocolVersion, '2025-06-18');
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
  assert.deepEqual(response.result.serverInfo, {
    name: 'awesome-web-fetch',
    version: '0.4.0',
  });
  assert.equal(response.result.instructions, MCP_SERVER_INSTRUCTIONS);
});

test('MCP tools/list exposes only fetch_url with strict PDF pages schema', async () => {
  const protocol = createMcpProtocol({
    config,
    fetchOne: async () => { throw new Error('not called'); },
    logger: silentLogger,
  });

  const response = await protocol.handleMessage(request(2, 'tools/list', {}));
  assert.equal(response.result.tools.length, 1);

  const tool = response.result.tools[0];
  assert.equal(tool.name, 'fetch_url');
  assert.equal(tool.title, 'Primary URL Reader for Web Pages and PDFs');
  assert.equal(tool.description, MCP_TOOL_DESCRIPTION);
  assert.deepEqual(tool.inputSchema.required, ['url']);
  assert.equal(tool.inputSchema.properties.pages.type, 'array');
  assert.equal(tool.inputSchema.properties.pages.maxItems, 50);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.openWorldHint, true);
});

test('MCP fetch_url forwards URL and selected PDF pages to the loader', async () => {
  let received;
  const protocol = createMcpProtocol({
    config,
    logger: silentLogger,
    fetchOne: async (target) => {
      received = target;
      return {
        page_content: 'Page 2 text',
        content_length: 11,
        truncated: false,
        metadata: {
          source: target.url,
          final_url: 'https://cdn.example.com/manual.pdf',
          title: 'PDF (8 pages)',
          content_type: 'application/pdf',
          status_code: 200,
          browser_rendered: false,
          type: 'pdf',
          total_pages: 8,
          requested_pages: [2],
          extracted_pages: [2],
          extraction_mode: 'selected_pages',
          cache_hit: true,
        },
      };
    },
  });

  const response = await protocol.handleMessage(request(3, 'tools/call', {
    name: 'fetch_url',
    arguments: {
      url: 'https://example.com/manual.pdf',
      pages: [2],
    },
  }));

  assert.deepEqual(received, {
    url: 'https://example.com/manual.pdf',
    pages: [2],
  });
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.ok, true);
  assert.equal(response.result.structuredContent.content_length, 11);
  assert.match(response.result.content[0].text, /final_url: https:\/\/cdn\.example\.com\/manual\.pdf/);
  assert.match(response.result.content[0].text, /--- CONTENT ---\nPage 2 text/);
  assert.equal('page_content' in response.result.structuredContent, false);
});

test('target URL failures return ok false without MCP isError', async () => {
  const protocol = createMcpProtocol({
    config,
    logger: silentLogger,
    fetchOne: async ({ url }) => ({
      page_content: '',
      content_length: 0,
      truncated: false,
      metadata: {
        source: url,
        final_url: url,
        title: '',
        content_type: '',
        status_code: null,
        browser_rendered: false,
        error: 'URL resolves to a private or local address',
      },
    }),
  });

  const response = await protocol.handleMessage(request(4, 'tools/call', {
    name: 'fetch_url',
    arguments: { url: 'http://127.0.0.1/' },
  }));

  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.ok, false);
  assert.match(response.result.content[0].text, /ok: false/);
  assert.match(response.result.content[0].text, /URL resolves to a private or local address/);
});

test('MCP rejects scalar pages to keep the tool schema unambiguous', async () => {
  const protocol = createMcpProtocol({
    config,
    fetchOne: async () => { throw new Error('not called'); },
    logger: silentLogger,
  });

  const response = await protocol.handleMessage(request(5, 'tools/call', {
    name: 'fetch_url',
    arguments: {
      url: 'https://example.com/manual.pdf',
      pages: 2,
    },
  }));

  assert.equal(response.error.code, -32602);
  assert.match(response.error.message, /pages must be an array/);
});

test('unexpected loader exceptions are returned as MCP tool errors', async () => {
  const protocol = createMcpProtocol({
    config,
    fetchOne: async () => {
      throw new Error('browser state corrupted');
    },
    logger: silentLogger,
  });

  const response = await protocol.handleMessage(request(6, 'tools/call', {
    name: 'fetch_url',
    arguments: { url: 'https://example.com' },
  }));

  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.ok, false);
  assert.match(response.result.content[0].text, /Internal web_fetch MCP error/);
  assert.doesNotMatch(response.result.content[0].text, /browser state corrupted/);
});
