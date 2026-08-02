import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPdfContent } from '../src/pdf-extractor.mjs';

test('extractPdfContent uses legacy full-document parser when pages are omitted', async () => {
  let selectedParserCalled = false;
  const result = await extractPdfContent({
    buffer: Buffer.from('fake'),
    pages: null,
    maxChars: 100,
    fullDocumentParser: async () => ({ text: ' Full document text ', numpages: 8 }),
    selectedPagesParser: async () => {
      selectedParserCalled = true;
      throw new Error('must not be called');
    },
  });

  assert.equal(selectedParserCalled, false);
  assert.deepEqual(result, {
    text: 'Full document text',
    totalPages: 8,
    requestedPages: null,
    extractedPages: 'all',
    extractionMode: 'full_document',
    contentLength: 18,
    truncated: false,
  });
});

test('extractPdfContent uses selected-page parser only when pages are provided', async () => {
  let fullParserCalled = false;
  const result = await extractPdfContent({
    buffer: Buffer.from('fake'),
    pages: [2, 4],
    maxChars: 100,
    fullDocumentParser: async () => {
      fullParserCalled = true;
      throw new Error('must not be called');
    },
    selectedPagesParser: async () => ({
      text: 'Page 2\n\nPage 4',
      totalPages: 6,
      extractedPages: [2, 4],
    }),
  });

  assert.equal(fullParserCalled, false);
  assert.deepEqual(result, {
    text: 'Page 2\n\nPage 4',
    totalPages: 6,
    requestedPages: [2, 4],
    extractedPages: [2, 4],
    extractionMode: 'selected_pages',
    contentLength: 14,
    truncated: false,
  });
});

test('extractPdfContent reports out-of-range pages', async () => {
  await assert.rejects(
    () => extractPdfContent({
      buffer: Buffer.from('fake'),
      pages: [9],
      maxChars: 100,
      fullDocumentParser: async () => ({ text: '', numpages: 0 }),
      selectedPagesParser: async () => {
        const error = new RangeError('Requested page 9 is out of range; PDF has 6 pages');
        error.totalPages = 6;
        error.requestedPages = [9];
        error.extractedPages = [];
        throw error;
      },
    }),
    (error) => {
      assert.equal(error.totalPages, 6);
      assert.deepEqual(error.requestedPages, [9]);
      assert.deepEqual(error.extractedPages, []);
      return true;
    },
  );
});


test('extractPdfContent reports truncation for long PDF text', async () => {
  const result = await extractPdfContent({
    buffer: Buffer.from('fake'),
    pages: null,
    maxChars: 4,
    fullDocumentParser: async () => ({ text: '123456', numpages: 1 }),
  });

  assert.equal(result.text, '1234');
  assert.equal(result.contentLength, 4);
  assert.equal(result.truncated, true);
});
