import { loadConfig } from './src/config.mjs';
import { createWebFetchServer } from './src/http-server.mjs';
import { createWebLoader } from './src/loader.mjs';
import { createMcpProtocol } from './src/mcp-protocol.mjs';

const config = loadConfig();
const loader = await createWebLoader(config);
const mcp = createMcpProtocol({
  config,
  fetchOne: loader.fetchOne,
});
const server = createWebFetchServer({
  config,
  fetchMany: loader.fetchMany,
  statusProvider: loader.status,
  mcpHandler: mcp.handleMessage,
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`web_fetch listening on port ${config.port}`);
  console.log(`BATCH_SIZE=${config.batchSize} MAX_CHARS=${config.maxChars} MAX_URLS=${config.maxUrls}`);
  console.log(`ALLOW_PRIVATE_NETWORK=${config.allowPrivateNetwork}`);
  console.log(`MCP_ENABLED=${config.mcpEnabled} MCP_PATH=${config.mcpPath}`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  server.close();
  await loader.close().catch((error) => console.error('Browser shutdown error:', error));
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown(signal).catch((error) => {
      console.error('Shutdown error:', error);
      process.exit(1);
    });
  });
}
