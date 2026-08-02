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
