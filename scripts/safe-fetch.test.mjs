import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicAddress, validatePublicUrl, resolvePublicTarget, fetchPublicPage } from '../src/lib/server/safe-fetch.mjs';

test('public literal addresses and ordinary website URLs are accepted', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.ok(assertPublicAddress(ip).address);
  }
  assert.equal(validatePublicUrl('https://sunbridgeenergy.com.au/path#section').href, 'https://sunbridgeenergy.com.au/path');
  assert.equal(validatePublicUrl('https://[2606:4700:4700::1111]/').protocol, 'https:');
});

test('private, loopback, reserved and mapped private addresses cannot be fetched', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '255.255.255.255',
    '::', '::1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:127.0.0.1', '::ffff:192.168.1.1',
    '::127.0.0.1', '64:ff9b::127.0.0.1', '2002:7f00:1::1', 'fec0::1', '4000::1']) {
    assert.throws(() => assertPublicAddress(ip), /public internet/);
  }
});

test('URL parsing blocks credentials, non-web schemes, unusual ports and local aliases', () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com', 'https://user:secret@example.com',
    'http://example.com:443', 'https://example.com:80', 'https://example.com:8080',
    'http://localhost', 'http://a.localhost.', 'http://metadata.google.internal', 'http://router.lan',
    'http://printer', 'http://127.1', 'http://2130706433', 'http://0x7f000001',
    'http://[::ffff:127.0.0.1]', 'http://[::1]', 'not a url']) {
    assert.throws(() => validatePublicUrl(url), undefined, url);
  }
});

test('all DNS answers must be public, including mixed IPv4 and IPv6 answers', async () => {
  const lookup = async () => [{ address: '8.8.8.8', family: 4 }, { address: '::ffff:10.0.0.1', family: 6 }];
  await assert.rejects(resolvePublicTarget('https://www.example.com', { lookup }), /public internet/);
  await assert.rejects(resolvePublicTarget('https://www.example.com', { lookup: async () => [] }), /resolved/);
  const target = await resolvePublicTarget('https://www.example.com', { lookup: async () => [
    { address: '8.8.8.8', family: 4 }, { address: '2606:4700:4700::1111', family: 6 },
  ] });
  assert.equal(target.addresses.length, 2);
  assert.equal(target.url.hostname, 'www.example.com');
});

test('private literals are rejected before DNS and limit validation happens before fetch', async () => {
  let called = false;
  await assert.rejects(resolvePublicTarget('http://127.0.0.1', { lookup: async () => { called = true; return []; } }));
  assert.equal(called, false);
  await assert.rejects(fetchPublicPage('https://www.example.com', { maxBytes: 0 }), /limits/);
});
