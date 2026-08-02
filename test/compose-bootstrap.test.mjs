import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const composePath = new URL('../docker-compose.part.yaml', import.meta.url);

async function readCompose() {
  return readFile(composePath, 'utf8');
}

test('bootstrap never removes the repository volume mount point', async () => {
  const compose = await readCompose();

  assert.doesNotMatch(compose, /rm -rf "\$\$\{REPO_DIR\}"/);
  assert.match(
    compose,
    /find "\$\$\{REPO_DIR\}" -mindepth 1 -maxdepth 1 -exec rm -rf -- \{\} \+/
  );
  assert.match(compose, /git clone[\s\S]*?"\."/);
});

test('compose persists PDF cache and configures its TTL', async () => {
  const compose = await readCompose();

  assert.match(compose, /PDF_CACHE_DIR:\s*"\/data\/pdf-cache"/);
  assert.match(compose, /PDF_CACHE_TTL_SECONDS:\s*"86400"/);
  assert.match(compose, /web_fetch_pdf_cache:\/data\/pdf-cache/);
  assert.match(compose, /\n\s{2}web_fetch_pdf_cache:\s*\n/);
});

test('compose enables remote MCP with a separate key and no additional container', async () => {
  const compose = await readCompose();

  assert.match(compose, /MCP_ENABLED:\s*"true"/);
  assert.match(compose, /MCP_PATH:\s*"\/mcp"/);
  assert.match(compose, /MCP_API_KEY:\s*"\$\{WEB_FETCH_MCP_API_KEY:-dummy\}"/);
  assert.equal((compose.match(/^\s{2}web_fetch:\s*$/gm) || []).length, 1);
});
