import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebsite } from '../src/lib/audit-url.mjs';
test('audit accepts bare domains and preserves valid page URLs', () => {
 assert.equal(normalizeWebsite(' example.com '), 'https://example.com/');
 assert.equal(normalizeWebsite('https://example.com/store?q=shoes'), 'https://example.com/store?q=shoes');
 assert.equal(normalizeWebsite('http://example.com'), 'http://example.com/');
});
test('audit rejects unsafe protocols, credentials and malformed addresses', () => {
 for (const value of ['', 'javascript:alert(1)', 'data:text/plain,test', 'ftp://example.com', 'https://user:pass@example.com', 'hello world', 'https://', 'not-a-domain', 'https://.com', 'a'.repeat(501)]) assert.throws(() => normalizeWebsite(value), value);
});
