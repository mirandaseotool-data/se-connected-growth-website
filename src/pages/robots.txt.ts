import { site } from '../data/site';
export function GET({ site: origin }: { site: URL }) {
  const body = site.release
    ? `User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', origin).href}\n`
    : 'User-agent: *\nAllow: /\n# Preview pages carry noindex. Publish a release build on the confirmed domain.\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
