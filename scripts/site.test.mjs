import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../dist/client/', import.meta.url));
const release = process.env.RELEASE === 'true';
const origin = process.env.SITE_URL || 'https://selabs.com.au';
async function walk(dir) { const result = []; for (const name of await readdir(dir)) { const path = join(dir, name); if ((await stat(path)).isDirectory()) result.push(...await walk(path)); else if (name.endsWith('.html')) result.push(path); } return result; }
const pages = await Promise.all((await walk(root)).map(async path => ({ path, html: await readFile(path, 'utf8') })));
const route = path => path.slice(root.length).replace(/index\.html$/, '').replace(/^/, '/');
const match = (html, re) => html.match(re)?.[1];
test('all intended pages are generated, with substantive server-rendered content', () => {
  assert.equal(pages.length, 14);
  for (const {html, path} of pages) {
    assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length, 1, path);
    assert.ok(html.includes('lang="en-AU"'), path);
    assert.ok(html.includes('id="main"'), path);
    assert.ok(!html.includes('astro-island'), 'Core content must not rely on hydration');
    assert.ok(!html.includes('selabstools@gmail.com'));
    assert.ok(html.includes('info@selabs.com.au'));
    assert.ok(html.match(/<main[^>]*>[\s\S]{100,}<\/main>/), path);
  }
});
test('every page has unique metadata and the confirmed canonical origin', () => {
  const titles = [], descriptions = [];
  for (const {html, path} of pages) {
    const title = match(html, /<title>([^<]+)<\/title>/);
    const desc = match(html, /<meta name="description" content="([^"]+)"/);
    const canonical = match(html, /<link rel="canonical" href="([^"]+)"/);
    assert.ok(title && desc && canonical, path);
    assert.equal(new URL(canonical).origin, new URL(origin).origin);
    assert.equal(new URL(canonical).pathname, route(path));
    titles.push(title); descriptions.push(desc);
    assert.ok(html.includes(`content="${!release || (path.endsWith('/404.html') || path.endsWith('/audit/index.html')) ? 'noindex, follow' : 'index, follow, max-image-preview:large'}"`), path);
  }
  assert.equal(new Set(titles).size, pages.length);
  assert.equal(new Set(descriptions).size, pages.length);
});
test('structured data parses and service entities reference the shared organization', () => {
  let serviceCount = 0;
  for (const {html, path} of pages) {
    const raw = match(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const schema = JSON.parse(raw);
    assert.equal(schema['@context'], 'https://schema.org');
    const org = schema['@graph'].find(n => n['@type'] === 'Organization');
    assert.equal(org.name, 'SE LABS');
    assert.equal(org.email, process.env.CONTACT_EMAIL || 'info@selabs.com.au');
    const service = schema['@graph'].find(n => n['@type'] === 'Service');
    if (service) { serviceCount++; assert.equal(service.provider['@id'], org['@id']); assert.ok(html.includes(service.name.replace(/&/g, '&amp;')), path); }
  }
  assert.equal(serviceCount, 5);
});
test('internal links and fragment targets resolve in generated output', async () => {
  for (const {html, path} of pages) {
    for (const [,href] of html.matchAll(/href="([^"]+)"/g)) {
      if (!href.startsWith('/') && !href.startsWith('#')) continue;
      const url = new URL(href, origin + route(path));
      const file = url.pathname.endsWith('/') ? join(root, url.pathname, 'index.html') : join(root, url.pathname);
      assert.ok((await stat(file)).isFile(), `${path}: ${href}`);
      if (url.hash) { const target = await readFile(file, 'utf8'); assert.ok(target.includes(`id="${url.hash.slice(1)}"`), href); }
    }
  }
});
test('crawler and sitemap settings distinguish preview from publication', async () => {
  const robots = await readFile(join(root,'robots.txt'), 'utf8');
  const sitemap = await readFile(join(root,'sitemap.xml'), 'utf8');
  assert.ok(!sitemap.includes('localhost'));
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  if (release) {
    assert.ok(robots.includes('User-agent: OAI-SearchBot\nAllow: /'));
    assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
    assert.equal(urls.length, 12);
    for (const url of urls) { assert.equal(new URL(url).origin, origin); assert.ok(!url.includes('404')); assert.ok(pages.some(p => origin + route(p.path) === url)); }
  } else { assert.equal(urls.length, 0); assert.ok(!robots.includes('Sitemap:')); }
});
test('contact offers an honest draft flow and a no-JavaScript email fallback', async () => {
  const html = await readFile(join(root,'contact/index.html'), 'utf8');
  assert.ok(html.includes('<noscript>'));
  assert.ok(html.includes('mailto:info@selabs.com.au'));
  assert.ok(html.includes('No details are uploaded by this form.'));
  assert.ok(html.includes('id="brief-form"'));
  assert.ok(html.includes('inputmode="url"'));
  assert.ok(!html.includes('action="http'));
});

test('audit landing exposes scope and objections without JavaScript and connects unique tab targets', async () => {
 const html = await readFile(join(root, 'index.html'), 'utf8');
 for (const text of ['Explore your automated checks.', 'Is the audit really free?', 'Do you need access to my accounts?', 'Illustrative example']) assert.ok(html.includes(text), text);
 const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
 assert.equal(new Set(ids).size, ids.length, 'Unique panel and control IDs');
 for (const [,id] of html.matchAll(/aria-controls="([^"]+)"/g)) assert.ok(ids.includes(id), id);
 assert.ok(!html.includes('Our first experiment'));
});
