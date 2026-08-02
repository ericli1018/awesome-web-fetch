import test from 'node:test';
import assert from 'node:assert/strict';
import { truncateContent } from '../src/content.mjs';

test('truncateContent trims text and reports whether MAX_CHARS truncated it', () => {
  assert.deepEqual(truncateContent('  example  ', 20), {
    text: 'example',
    contentLength: 7,
    truncated: false,
  });

  assert.deepEqual(truncateContent('123456', 4), {
    text: '1234',
    contentLength: 4,
    truncated: true,
  });
});
