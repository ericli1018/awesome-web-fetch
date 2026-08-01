import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowedUrl, isPrivateAddress } from '../src/url-policy.mjs';

test('isPrivateAddress identifies IPv4 private and metadata ranges', () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('10.1.2.3'), true);
  assert.equal(isPrivateAddress('172.16.0.1'), true);
  assert.equal(isPrivateAddress('192.168.1.1'), true);
  assert.equal(isPrivateAddress('169.254.169.254'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
});

test('assertAllowedUrl accepts public http and https URLs', async () => {
  const resolver = async () => [{ address: '93.184.216.34', family: 4 }];
  await assert.doesNotReject(() => assertAllowedUrl('https://example.com/path', false, resolver));
});

test('assertAllowedUrl rejects unsupported protocols and private targets', async () => {
  await assert.rejects(() => assertAllowedUrl('file:///etc/passwd', false), /Only http and https/);
  const resolver = async () => [{ address: '127.0.0.1', family: 4 }];
  await assert.rejects(() => assertAllowedUrl('http://example.test', false, resolver), /private or local/);
});
