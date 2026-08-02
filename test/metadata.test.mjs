import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetadata, normalizeContentType } from '../src/metadata.mjs';

test('normalizeContentType returns only the media type', () => {
  assert.equal(normalizeContentType('text/html; charset=utf-8'), 'text/html');
  assert.equal(normalizeContentType('Application/PDF'), 'application/pdf');
  assert.equal(normalizeContentType(''), '');
  assert.equal(normalizeContentType(null), '');
});

test('createMetadata includes sidecar response fields', () => {
  assert.deepEqual(
    createMetadata({
      source: 'https://example.com',
      finalUrl: 'https://example.com/final',
      title: 'Example',
      contentType: 'text/html; charset=utf-8',
      statusCode: 200,
      browserRendered: true,
      type: 'html',
    }),
    {
      source: 'https://example.com',
      final_url: 'https://example.com/final',
      title: 'Example',
      content_type: 'text/html',
      status_code: 200,
      browser_rendered: true,
      type: 'html',
    },
  );
});

test('createMetadata keeps required keys when response details are unavailable', () => {
  assert.deepEqual(
    createMetadata({
      source: 'https://invalid.example',
      browserRendered: false,
      error: 'DNS failed',
    }),
    {
      source: 'https://invalid.example',
      final_url: 'https://invalid.example',
      title: '',
      content_type: '',
      status_code: null,
      browser_rendered: false,
      error: 'DNS failed',
    },
  );
});

test('createMetadata appends PDF extraction and cache fields', () => {
  const metadata = createMetadata({
    source: 'https://example.com/file.pdf',
    finalUrl: 'https://cdn.example.com/file.pdf',
    title: 'PDF (10 pages)',
    contentType: 'application/pdf',
    statusCode: 200,
    browserRendered: false,
    type: 'pdf',
    extra: {
      total_pages: 10,
      requested_pages: [2, 4],
      extracted_pages: [2, 4],
      extraction_mode: 'selected_pages',
      cache_hit: true,
    },
  });

  assert.equal(metadata.total_pages, 10);
  assert.deepEqual(metadata.requested_pages, [2, 4]);
  assert.deepEqual(metadata.extracted_pages, [2, 4]);
  assert.equal(metadata.extraction_mode, 'selected_pages');
  assert.equal(metadata.cache_hit, true);
});
