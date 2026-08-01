import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function ipv4ToNumber(address) {
  return address.split('.').reduce((value, octet) => (value << 8) + Number(octet), 0) >>> 0;
}

function inIpv4Range(address, base, prefix) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(base) & mask);
}

export function isPrivateAddress(address) {
  if (!address) return true;

  if (address.startsWith('::ffff:')) {
    return isPrivateAddress(address.slice(7));
  }

  const family = isIP(address);
  if (family === 4) {
    return [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
    ].some(([base, prefix]) => inIpv4Range(address, base, prefix));
  }

  if (family === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized)
    );
  }

  return true;
}

export async function assertAllowedUrl(
  value,
  allowPrivateNetwork = false,
  resolver = (hostname) => lookup(hostname, { all: true, verbatim: true }),
) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https URLs are allowed');
  }

  if (url.username || url.password) {
    throw new Error('URLs containing credentials are not allowed');
  }

  if (allowPrivateNetwork) return url;

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error(`URL resolves to a private or local target: ${hostname}`);
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error(`URL resolves to a private or local target: ${hostname}`);
    }
    return url;
  }

  let addresses;
  try {
    addresses = await resolver(hostname);
  } catch (error) {
    throw new Error(`DNS resolution failed for ${hostname}: ${error.message}`);
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error(`DNS resolution returned no addresses for ${hostname}`);
  }

  const blocked = addresses.find(({ address }) => isPrivateAddress(address));
  if (blocked) {
    throw new Error(`URL resolves to a private or local target: ${blocked.address}`);
  }

  return url;
}
