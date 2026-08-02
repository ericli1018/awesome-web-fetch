import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPdfCache } from '../src/pdf-cache.mjs';

test('PDF cache downloads once and returns cached bytes on the next request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'web-fetch-pdf-cache-'));
  let downloadCount = 0;

  try {
    const cache = createPdfCache({ directory, ttlSeconds: 3600 });
    const downloader = async () => {
      downloadCount += 1;
      return {
        buffer: Buffer.from('cached-pdf'),
        finalUrl: 'https://cdn.example.com/file.pdf',
        contentType: 'application/pdf',
        statusCode: 200,
        etag: '"v1"',
        lastModified: 'Sat, 01 Aug 2026 00:00:00 GMT',
      };
    };

    const first = await cache.get('https://example.com/file.pdf', downloader);
    const second = await cache.get('https://example.com/file.pdf', downloader);

    assert.equal(downloadCount, 1);
    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.equal(second.buffer.toString(), 'cached-pdf');
    assert.equal(second.finalUrl, 'https://cdn.example.com/file.pdf');
    assert.equal(second.statusCode, 200);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PDF cache downloads again after TTL expires', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'web-fetch-pdf-cache-'));
  let currentTime = Date.parse('2026-08-01T00:00:00.000Z');
  let downloadCount = 0;

  try {
    const cache = createPdfCache({
      directory,
      ttlSeconds: 60,
      now: () => currentTime,
    });
    const downloader = async () => {
      downloadCount += 1;
      return {
        buffer: Buffer.from(`pdf-${downloadCount}`),
        finalUrl: 'https://example.com/file.pdf',
        contentType: 'application/pdf',
        statusCode: 200,
      };
    };

    const first = await cache.get('https://example.com/file.pdf', downloader);
    currentTime += 61_000;
    const second = await cache.get('https://example.com/file.pdf', downloader);

    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, false);
    assert.equal(downloadCount, 2);
    assert.equal(second.buffer.toString(), 'pdf-2');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
