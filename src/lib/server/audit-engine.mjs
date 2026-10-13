import { load } from 'cheerio';
import { fetchPublicPage } from './safe-fetch.mjs';

const compact = (value, limit = 260) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const header = (headers, name) => headers?.get?.(name) ?? Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name)?.[1] ?? '';
const isOk = (page) => page.status >= 200 && page.status < 300;

// Match robots wildcards without constructing a potentially expensive regex
// from a site's untrusted robots.txt rules.
function matchesPath(pattern, path) {
  const anchored = pattern.endsWith('$');
  const glob = anchored ? pattern.slice(0, -1) : `${pattern}*`;
  let p = 0;
  let s = 0;
  let star = -1;
  let retry = 0;
  while (s < path.length) {
    if (glob[p] === '*') { star = p++; retry = s; }
    else if (glob[p] === path[s]) { p++; s++; }
    else if (star !== -1) { p = star + 1; s = ++retry; }
    else return false;
  }
  while (glob[p] === '*') p++;
  return p === glob.length;
}

// Resolve the most specific user-agent group, then the longest matching rule.
// An empty disallow means no restriction; allow wins a same-length tie.
function robotsPermission(source, agent, path) {
  const groups = [];
  let group;
  let hasRules = false;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!group || hasRules) {
        group = { agents: [], rules: [] };
        groups.push(group);
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group && (key === 'allow' || key === 'disallow')) {
      hasRules = true;
      if (value) group.rules.push({ value, allow: key === 'allow' });
    }
  }
  const specificity = (group) => Math.max(-1, ...group.agents.map((value) => value === '*' ? 0 : agent.toLowerCase().includes(value) ? value.length : -1));
  const best = Math.max(-1, ...groups.map(specificity));
  if (best < 0) return { allowed: true, rule: 'No matching restriction' };
  let winner;
  for (const rule of groups.filter((item) => specificity(item) === best).flatMap((item) => item.rules)) {
    const raw = rule.value.endsWith('$') ? rule.value.slice(0, -1) : rule.value;
    if (!matchesPath(rule.value, path)) continue;
    const length = raw.replaceAll('*', '').length;
    if (!winner || length > winner.length || (length === winner.length && rule.allow)) winner = { ...rule, length };
  }
  return winner ? { allowed: winner.allow, rule: `${winner.allow ? 'Allow' : 'Disallow'}: ${winner.value}` } : { allowed: true, rule: 'No matching restriction' };
}

function schemaTypes(value, types = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => schemaTypes(item, types));
  else if (value && typeof value === 'object') {
    const type = value['@type'];
    for (const item of Array.isArray(type) ? type : [type]) if (typeof item === 'string') types.add(item.replace(/^https?:\/\/schema.org\//, ''));
    for (const child of Object.values(value)) if (child && typeof child === 'object') schemaTypes(child, types);
  }
  return types;
}

/** Inspect at most three public resources; this is a readiness check, not a ranking prediction. */
export async function auditWebsite(input, { fetcher = fetchPublicPage } = {}) {
  const page = await fetcher(input, { maxBytes: 1_500_000, timeoutMs: 10_000 });
  if (!isOk(page)) throw new Error(`The website returned HTTP ${page.status}. We could not inspect its page.`);
  const contentType = String(header(page.headers, 'content-type')).toLowerCase();
  if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) throw new Error('That URL does not return an HTML web page. Enter a website page URL.');
  const url = new URL(page.url || input);
  const $ = load(page.body);
  const checks = [];
  const add = (id, title, status, evidence, recommendation) => checks.push({ id, title, status, evidence, recommendation });
  const title = compact($('title').first().text());
  add('title', 'Page title', title ? 'pass' : 'warning', title ? `Found: “${title}”.` : 'No non-empty title element was found in the returned HTML.', title ? 'Keep this specific to the page and business.' : 'Add a descriptive, unique title that names the business and page purpose.');
  const description = compact($('meta[name]').filter((_, el) => $(el).attr('name')?.toLowerCase() === 'description').first().attr('content'));
  add('description', 'Search description', description ? 'pass' : 'warning', description ? `Found: “${description}”.` : 'No non-empty meta description was found.', description ? 'Keep it consistent with the page’s actual offer.' : 'Summarise the offer and who it helps in a page-specific meta description.');
  const canonicals = $('link[rel]').filter((_, el) => ($(el).attr('rel') || '').toLowerCase().split(/\s+/).includes('canonical'));
  let canonical;
  try { if (canonicals.first().attr('href')?.trim()) canonical = new URL(canonicals.first().attr('href'), url); } catch {}
  const validCanonical = canonical && ['https:', 'http:'].includes(canonical.protocol);
  add('canonical', 'Canonical URL', canonicals.length === 1 && validCanonical ? 'pass' : 'warning', canonicals.length > 1 ? `Found ${canonicals.length} canonical declarations.` : validCanonical ? `Declared canonical: ${compact(canonical.href)}. The intended preferred page has not been verified.` : 'No usable canonical URL was found.', 'Use one canonical URL for the intended preferred version of this page.');
  const headings = $('h1').map((_, el) => compact($(el).text())).get().filter(Boolean);
  add('heading', 'Main page heading', headings.length === 1 ? 'pass' : 'warning', headings.length ? `Found ${headings.length} non-empty H1 heading(s): ${compact(headings.join(' / '))}.` : 'No non-empty H1 heading was found.', 'Use a clear main heading that explains the page’s offer; heading count alone does not determine ranking.');
  const textRoot = load(page.body);
  textRoot('script,style,noscript,template,svg,nav,header,footer').remove();
  const readable = compact(textRoot('main').length ? textRoot('main').text() : textRoot('body').text(), 100_000);
  const wordCount = readable.split(/\s+/).filter(Boolean).length;
  add('readable-content', 'Content in the initial HTML', wordCount >= 150 ? 'pass' : 'warning', `Approximately ${wordCount} whitespace-separated words are present outside navigation and scripts. This checks returned HTML, not a rendered browser.`, wordCount >= 150 ? 'Keep important service details and answers available in HTML.' : 'Check that the core offer, business details and useful answers are in the initial HTML. The 150-word threshold is a screening heuristic, not a search requirement.');
  const links = $('a[href]').toArray().filter((el) => { try { const link = new URL($(el).attr('href'), url); return ['http:', 'https:'].includes(link.protocol) && link.origin === url.origin; } catch { return false; } });
  add('internal-links', 'Discoverable internal links', links.length ? 'pass' : 'warning', `${links.length} same-origin HTTP(S) links were found. Destinations were not crawled.`, links.length ? 'Keep important service and contact pages reachable through descriptive links.' : 'Use real links to important service, about and contact pages.');
  const incompleteActions = $('a:not([href])').toArray().filter((el) => {
    const anchor = $(el);
    if (!compact(anchor.text())) return false;
    const role = (anchor.attr('role') || '').toLowerCase();
    const tabindex = anchor.attr('tabindex');
    // This only checks static semantics. A custom role also needs keyboard
    // activation handling, which cannot be established from HTML alone.
    return role !== 'button' || tabindex === undefined || !/^\d+$/.test(tabindex.trim());
  });
  const actionExamples = incompleteActions.slice(0, 3).map((el) => `“${compact($(el).text(), 70)}”`).join(', ');
  add('action-semantics', 'Link and action semantics', incompleteActions.length ? 'warning' : 'pass', incompleteActions.length ? `${incompleteActions.length} non-empty anchor element(s) have no href and lack button role or keyboard focus semantics. Examples: ${actionExamples}. No runtime keyboard testing was performed.` : 'No non-empty anchors lacking both a navigation target and complete button/focus semantics were found. Runtime keyboard behaviour was not tested.', 'Use an anchor with a real href for navigation and a native button for actions. Verify keyboard activation and focus in the browser.');
  const images = $('img');
  const missingAlt = images.filter((_, el) => $(el).attr('alt') === undefined).length;
  add('image-alt', 'Image alternative text', missingAlt ? 'warning' : images.length ? 'pass' : 'unknown', images.length ? `${missingAlt} of ${images.length} image elements are missing an alt attribute. Descriptive quality was not assessed.` : 'No image elements were found in the returned HTML.', 'Give meaningful images useful alternative text; use empty alt text for decorative images.');
  const types = new Set();
  let invalidJson = 0;
  const blocks = $('script[type="application/ld+json"]');
  blocks.each((_, el) => { try { schemaTypes(JSON.parse($(el).text()), types); } catch { invalidJson++; } });
  const businessTypes = ['Organization', 'LocalBusiness', 'Corporation', 'ProfessionalService', 'Store', 'Restaurant', 'Electrician', 'HomeAndConstructionBusiness'];
  const businessSchema = businessTypes.some((type) => types.has(type));
  add('structured-data', 'Business structured data', invalidJson || !businessSchema ? 'warning' : 'pass', `${blocks.length} JSON-LD block(s); ${invalidJson} failed JSON parsing. Types found: ${compact([...types].join(', ')) || 'none'}. This is not a full schema validation.`, invalidJson ? 'Fix invalid JSON-LD and validate required properties for the chosen schema types.' : 'Describe the business with accurate Organization or appropriate LocalBusiness structured data, matching visible information.');
  const metaDirectives = $('meta[name]').filter((_, el) => ['robots', 'googlebot'].includes(($(el).attr('name') || '').toLowerCase())).map((_, el) => `${$(el).attr('name')}: ${$(el).attr('content') || ''}`).get();
  const xRobots = String(header(page.headers, 'x-robots-tag'));
  const directives = [...metaDirectives, ...(xRobots ? [`X-Robots-Tag: ${xRobots}`] : [])];
  const restrictsIndexing = directives.some((item) => /\b(noindex|none)\b/i.test(item));
  add('index-directives', 'Indexing directives', restrictsIndexing ? 'warning' : 'pass', directives.length ? compact(directives.join('; '), 600) : 'No noindex directive was observed in robots/googlebot meta tags or the response X-Robots-Tag header.', restrictsIndexing ? 'Review whether this page should be publicly indexed before changing its directives. Some restrictions may be crawler-specific.' : 'This does not confirm indexing; verify actual indexing with Search Console.');

  const optional = async (path) => { try { return { page: await fetcher(new URL(path, url.origin).href, { maxBytes: 500_000, timeoutMs: 7_000 }) }; } catch { return { unavailable: true }; } };
  const [robotsResult, sitemapResult] = await Promise.all([optional('/robots.txt'), optional('/sitemap.xml')]);
  for (const agent of ['Googlebot', 'OAI-SearchBot']) {
    const robots = robotsResult.page;
    const usable = robots && isOk(robots) && !/<(?:!doctype|html)\b/i.test(robots.body) && !String(header(robots.headers, 'content-type')).includes('text/html');
    if (usable) {
      const rule = robotsPermission(robots.body, agent, `${url.pathname}${url.search}`);
      add(`robots-${agent.toLowerCase()}`, `${agent} crawl rules`, rule.allowed ? 'pass' : 'warning', `For ${url.pathname}: ${rule.rule}.`, rule.allowed ? 'The robots rules permit this path; actual crawler access and visits are not verified.' : `Review this robots rule if you want ${agent} to crawl this page.`);
    } else if (robots?.status === 404 || robots?.status === 410) {
      add(`robots-${agent.toLowerCase()}`, `${agent} crawl rules`, 'pass', `robots.txt returned HTTP ${robots.status}; no robots.txt restriction was found.`, 'A missing robots.txt is not itself a crawl block. Actual crawler access is not verified.');
    } else {
      add(`robots-${agent.toLowerCase()}`, `${agent} crawl rules`, 'unknown', robots ? `robots.txt returned HTTP ${robots.status} or was not a usable text response.` : 'robots.txt could not be retrieved within the request limits.', 'Check robots.txt and crawler-specific access from the live site.');
    }
  }
  const sitemap = sitemapResult.page;
  let validSitemap = false;
  if (sitemap && isOk(sitemap)) {
    const xml = load(sitemap.body, { xmlMode: true });
    validSitemap = xml('urlset > url > loc, sitemapindex > sitemap > loc').length > 0;
  }
  const declaredSitemap = robotsResult.page && isOk(robotsResult.page) && /^\s*sitemap\s*:\s*https?:\/\//im.test(robotsResult.page.body);
  add('sitemap', 'Sitemap discovery', validSitemap ? 'pass' : declaredSitemap || !sitemap || ![404, 410].includes(sitemap.status) ? 'unknown' : 'warning', validSitemap ? 'Found sitemap URL entries at /sitemap.xml. Listed pages were not fetched.' : declaredSitemap ? 'robots.txt declares a sitemap. Its declared location was not fetched within this three-resource audit.' : sitemap ? `/sitemap.xml returned HTTP ${sitemap.status}; a valid sitemap with URL entries was not confirmed.` : 'The standard /sitemap.xml location could not be retrieved.', 'Publish a valid sitemap and declare its URL in robots.txt. A sitemap does not guarantee indexing.');

  return {
    url: url.href,
    checkedAt: new Date().toISOString(),
    summary: { passed: checks.filter((check) => check.status === 'pass').length, warnings: checks.filter((check) => check.status === 'warning').length, unknown: checks.filter((check) => check.status === 'unknown').length, total: checks.length },
    checks,
    priorities: checks.filter((check) => check.status === 'warning').sort((a, b) => (a.id.startsWith('robots-') || a.id === 'index-directives' ? -1 : 0) - (b.id.startsWith('robots-') || b.id === 'index-directives' ? -1 : 0)).slice(0, 3).map(({ id, title, evidence, recommendation }) => ({ id, title, evidence, recommendation })),
    limitations: ['Automated readiness checks cover one HTML page, /robots.txt and /sitemap.xml only. Redirects may be followed within safe request limits.', 'No Google indexing, search rankings, AI mentions or citation performance have been measured.', 'No browser rendering, mobile usability, speed test, full-site crawl or contact-form submission was performed.', 'A pass confirms only the specific observable check. It does not certify accessibility, content quality or AI visibility.'],
  };
}
