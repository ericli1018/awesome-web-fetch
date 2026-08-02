import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFetchTargets } from '../src/http-server.mjs';

test('normalizeFetchTargets preserves string URLs as full-document requests', () => {
  assert.deepEqual(
    normalizeFetchTargets(['https://example.com/file.pdf'], 20),
    [{ url: 'https://example.com/file.pdf', pages: null }],
  );
});

test('normalizeFetchTargets accepts selected PDF pages', () => {
  assert.deepEqual(
    normalizeFetchTargets([
      { url: 'https://example.com/file.pdf', pages: [3, 1, 3] },
      { url: 'https://example.com/other.pdf', pages: 2 },
    ], 20),
    [
      { url: 'https://example.com/file.pdf', pages: [3, 1] },
      { url: 'https://example.com/other.pdf', pages: [2] },
    ],
  );
});

test('normalizeFetchTargets rejects invalid page numbers', () => {
  assert.throws(
    () => normalizeFetchTargets([{ url: 'https://example.com/file.pdf', pages: [0] }], 20),
    /positive integer/,
  );
  assert.throws(
    () => normalizeFetchTargets([{ url: 'https://example.com/file.pdf', pages: [] }], 20),
    /must not be empty/,
  );
});
