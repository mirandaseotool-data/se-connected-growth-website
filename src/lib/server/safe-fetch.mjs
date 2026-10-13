import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

/** Errors are intentionally independent of a framework so callers can map them to safe UI messages. */
export class PublicFetchError extends Error {
  constructor(message, code = 'UNSAFE_URL') {
    super(message);
    this.name = 'PublicFetchError';
    this.code = code;
  }
}

/** Validate a literal IP. IPv4-mapped IPv6 is checked as IPv4, never as an IPv6 escape hatch. */
export function assertPublicAddress(input) {
  let address;
  try { address = ipaddr.parse(input); }
  catch { throw new PublicFetchError('The hostname resolved to an invalid address.'); }
  if (address.kind() === 'ipv6' && address.isIPv4MappedAddress()) address = address.toIPv4Address();
  // Restrict IPv6 to the global unicast allocation too: deprecated compatible
  // IPv4 (::/96) and unallocated ranges must not slip through a library fallback.
  if (address.zoneId || address.range() !== 'unicast' ||
      (address.kind() === 'ipv6' && !address.match(ipaddr.parse('2000::'), 3))) {
    throw new PublicFetchError('Only public internet addresses can be audited.');
  }
  return { address: address.toString(), family: address.kind() === 'ipv4' ? 4 : 6 };
}

/** Parse and validate protocol, credentials, port and hostname before any DNS or network access. */
export function validatePublicUrl(input) {
  let url;
  try { url = new URL(input); }
  catch { throw new PublicFetchError('Enter a valid public website URL.'); }
  if (url.href.length > 4096) throw new PublicFetchError('The website URL is too long.');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new PublicFetchError('Use an HTTP or HTTPS website URL without credentials.');
  }
  if (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) {
    throw new PublicFetchError('Only standard website ports are supported.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!hostname || hostname.includes('%')) throw new PublicFetchError('Invalid public hostname.');
  if (ipaddr.isValid(hostname)) {
    assertPublicAddress(hostname);
  } else if (!hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|test|invalid|example|onion|arpa)$/.test(hostname)) {
    throw new PublicFetchError('Only public internet hostnames can be audited.');
  }
  url.hash = '';
  return url;
}

/** Resolve every address and reject mixed public/private DNS answers. Inject lookup only in tests. */
export async function resolvePublicTarget(input, { lookup = dnsLookup } = {}) {
  const url = validatePublicUrl(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  let addresses;
  if (ipaddr.isValid(hostname)) addresses = [assertPublicAddress(hostname)];
  else {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!Array.isArray(records) || !records.length) {
      throw new PublicFetchError('The website hostname could not be resolved.', 'DNS_FAILURE');
    }
    addresses = records.map(record => assertPublicAddress(record.address));
  }
  return { url, addresses };
}

function abortError() {
  return new PublicFetchError('The website took too long to respond.', 'TIMEOUT');
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function requestPage(target, { maxBytes, signal }) {
  return new Promise((resolve, reject) => {
    const { url, addresses } = target;
    const pinned = addresses[0];
    const transport = url.protocol === 'https:' ? https : http;
    // Keep the original URL hostname for Host, SNI and certificate verification. Only lookup is pinned.
    const request = transport.request(url, {
      method: 'GET', agent: false, signal,
      lookup(_hostname, options, callback) {
        if (options?.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
      },
      headers: {
        'User-Agent': 'SELABS-Audit/1.0 (+https://selabs.com.au/)',
        Accept: 'text/html,text/plain,application/xml,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Encoding': 'identity',
      },
    }, response => {
      const status = response.statusCode || 0;
      const headers = response.headers;
      if ([301, 302, 303, 307, 308].includes(status) && headers.location) {
        response.destroy();
        resolve({ url: url.href, status, headers, body: '' });
        return;
      }
      const encoding = String(headers['content-encoding'] || 'identity').trim().toLowerCase();
      if (encoding !== 'identity') {
        response.destroy();
        reject(new PublicFetchError('The website returned unsupported compressed content.', 'UNSUPPORTED_ENCODING'));
        return;
      }
      if (headers['content-length'] && Number(headers['content-length']) > maxBytes) {
        response.destroy();
        reject(new PublicFetchError('The website response is too large to audit.', 'TOO_LARGE'));
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          response.destroy();
          reject(new PublicFetchError('The website response is too large to audit.', 'TOO_LARGE'));
        } else chunks.push(chunk);
      });
      response.on('end', () => resolve({ url: url.href, status, headers, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('aborted', () => reject(new PublicFetchError('The website response ended early.', 'NETWORK_ERROR')));
      response.on('error', reject);
    });
    request.on('error', error => reject(signal.aborted ? abortError() : error));
    request.end();
  });
}

/** Bounded GET of a public page. Includes DNS and up to three redirects in one total time budget. */
export async function fetchPublicPage(input, { maxBytes = 1_000_000, timeoutMs = 10_000 } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 5_000_000 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new PublicFetchError('Invalid audit fetch limits.', 'INVALID_LIMITS');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = validatePublicUrl(input);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const target = await abortable(resolvePublicTarget(current), controller.signal);
      const result = await requestPage(target, { maxBytes, signal: controller.signal });
      if (![301, 302, 303, 307, 308].includes(result.status) || !result.headers.location) return result;
      if (redirects === 3) throw new PublicFetchError('The website redirected too many times.', 'TOO_MANY_REDIRECTS');
      current = validatePublicUrl(new URL(result.headers.location, result.url));
    }
  } finally {
    clearTimeout(timer);
  }
}
