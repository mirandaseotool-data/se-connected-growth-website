import test from 'node:test';
import assert from 'node:assert/strict';
import { auditWebsite } from '../src/lib/server/audit-engine.mjs';

const body = `<!doctype html><html><head><title>Example business</title><meta name="description" content="Clear service description"><link rel="canonical" href="https://example.com/"><script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"Example"}]}</script></head><body><main><h1>Useful services</h1><p>${'Useful service details. '.repeat(60)}</p><a href="/contact/">Contact</a><img src="/logo.svg" alt="Example"></main></body></html>`;
function fixture({ html = body, robots = 'User-agent: *\nAllow: /', sitemap = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/</loc></url></urlset>', robotsStatus = 200, sitemapStatus = 200, failRobots = false, rootHeaders = { 'content-type': 'text/html' } } = {}) {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    const pathname = new URL(url).pathname;
    if (pathname === '/robots.txt' && failRobots) throw new Error('Timeout');
    return { url, status: pathname === '/robots.txt' ? robotsStatus : pathname === '/sitemap.xml' ? sitemapStatus : 200, headers: pathname === '/robots.txt' ? { 'content-type': 'text/plain' } : pathname === '/sitemap.xml' ? { 'content-type': 'application/xml' } : rootHeaders, body: pathname === '/robots.txt' ? robots : pathname === '/sitemap.xml' ? sitemap : html };
  };
  return { fetcher, calls };
}
const check = (report, id) => report.checks.find((item) => item.id === id);

test('audit examines three public resources and reports evidence without a score', async () => {
  const mock = fixture();
  const report = await auditWebsite('https://example.com/', mock);
  assert.equal(mock.calls.length, 3);
  assert.equal(report.summary.warnings, 0);
  assert.equal(report.summary.total, report.checks.length);
  assert.equal('score' in report, false);
  assert.match(check(report, 'title').evidence, /Example business/);
  assert.equal(check(report, 'structured-data').status, 'pass');
  assert.ok(report.limitations.some((item) => /No Google indexing/.test(item)));
});

test('specific crawler rules override wildcard group and longest allow beats disallow', async () => {
  const mock = fixture({ robots: 'User-agent: *\nDisallow: /\nUser-agent: OAI-SearchBot\nDisallow: /\nAllow: /public\n' });
  const report = await auditWebsite('https://example.com/public/page', mock);
  assert.equal(check(report, 'robots-googlebot').status, 'warning');
  assert.equal(check(report, 'robots-oai-searchbot').status, 'pass');
  assert.equal(report.priorities[0].id, 'robots-googlebot');
});

test('unrelated crawler groups do not block search crawlers', async () => {
  const report = await auditWebsite('https://example.com/', fixture({ robots: 'User-agent: GPTBot\nDisallow: /' }));
  assert.equal(check(report, 'robots-googlebot').status, 'pass');
  assert.equal(check(report, 'robots-oai-searchbot').status, 'pass');
});

test('robots wildcard matching handles anchored rules and allow ties', async () => {
  const mock = fixture({ robots: 'User-agent: *\nDisallow: /*?private=$\nDisallow: /open\nAllow: /open' });
  const privatePage = await auditWebsite('https://example.com/page?private=', mock);
  assert.equal(check(privatePage, 'robots-googlebot').status, 'warning');
  const otherPage = await auditWebsite('https://example.com/page?private=false', mock);
  assert.equal(check(otherPage, 'robots-googlebot').status, 'pass');
  const open = await auditWebsite('https://example.com/open', mock);
  assert.equal(check(open, 'robots-googlebot').status, 'pass');
});

test('root HTTP errors stop the audit instead of diagnosing an error page', async () => {
  await assert.rejects(auditWebsite('https://example.com/', { fetcher: async (url) => ({ url, status: 403, headers: {}, body: '<h1>Forbidden</h1>' }) }), /HTTP 403/);
});

test('failed robots request is unknown and alternate sitemap declaration is not marked missing', async () => {
  const failed = await auditWebsite('https://example.com/', fixture({ failRobots: true }));
  assert.equal(check(failed, 'robots-googlebot').status, 'unknown');
  const declared = await auditWebsite('https://example.com/', fixture({ robots: 'Sitemap: https://example.com/sitemap-index.xml', sitemapStatus: 404, sitemap: 'Not found' }));
  assert.equal(check(declared, 'sitemap').status, 'unknown');
});

test('missing fields, broken JSON-LD and noindex are actionable and bounded', async () => {
  const report = await auditWebsite('https://example.com/', fixture({ html: '<html><head><meta name="robots" content="noindex"><script type="application/ld+json">{broken}</script></head><body><img src="a.png"><p>Hi</p></body></html>' }));
  for (const id of ['title', 'description', 'heading', 'canonical', 'structured-data', 'image-alt', 'index-directives']) assert.equal(check(report, id).status, 'warning');
  assert.equal(report.priorities.length, 3);
  assert.equal(report.priorities[0].id, 'index-directives');
});

test('a missing robots file differs from an unavailable or HTML robots response', async () => {
  const missing = await auditWebsite('https://example.com/', fixture({ robotsStatus: 404 }));
  assert.equal(check(missing, 'robots-googlebot').status, 'pass');
  const htmlRobots = await auditWebsite('https://example.com/', fixture({ robots: '<html>Not found</html>' }));
  assert.equal(check(htmlRobots, 'robots-googlebot').status, 'unknown');
});

test('HTTP headers are considered and non-HTML roots are rejected', async () => {
  const report = await auditWebsite('https://example.com/', fixture({ rootHeaders: new Headers({ 'content-type': 'text/html', 'x-robots-tag': 'noindex' }) }));
  assert.equal(check(report, 'index-directives').status, 'warning');
  await assert.rejects(auditWebsite('https://example.com/', fixture({ rootHeaders: { 'content-type': 'application/pdf' } })), /does not return an HTML/);
});

test('action semantics flags href-less text actions, excluding empty anchors and explicit focusable buttons', async () => {
  const html = body.replace('</main>', '<a onclick="openModal()">Book an inspection</a><a id="section"></a><a name="legacy"></a><a role="button" tabindex="0">Open details</a><a role="button">Contact sales</a></main>');
  const report = await auditWebsite('https://example.com/', fixture({ html }));
  const actions = check(report, 'action-semantics');
  assert.equal(actions.status, 'warning');
  assert.match(actions.evidence, /2 non-empty/);
  assert.match(actions.evidence, /Book an inspection/);
  assert.match(actions.evidence, /Contact sales/);
  assert.doesNotMatch(actions.evidence, /Open details/);
  assert.match(actions.evidence, /No runtime keyboard testing/);
});
