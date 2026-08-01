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
