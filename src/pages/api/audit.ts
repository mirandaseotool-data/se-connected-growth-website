import type { APIRoute } from 'astro';
import { auditWebsite } from '../../lib/server/audit-engine.mjs';
import { normalizeWebsite } from '../../lib/audit-url.mjs';
export const prerender = false;
let active = 0;
const buckets = new Map<string, { count: number; until: number }>();
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (request.headers.get('origin') !== new URL(request.url).origin) return response({error:'Please run the audit from this website.'},403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response({error:'Send a website address as JSON.'},415);
  const now = Date.now();
  for (const [key,value] of buckets) if (value.until < now) buckets.delete(key);
  if (buckets.size >= 2000 && !buckets.has(clientAddress)) return response({error:'The audit service is busy. Please try again shortly.'},503);
  const bucket = buckets.get(clientAddress) || {count:0,until:now+60000};
  if (++bucket.count > 6) return response({error:'You have made several requests. Please wait a minute and try again.'},429);
  buckets.set(clientAddress,bucket);
  if (active >= 3) return response({error:'The audit service is busy. Please try again shortly.'},503);
  let website: string;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    let bytes=0, content=''; const decoder=new TextDecoder();
    while (true) { const {done,value}=await reader.read(); if(done)break; bytes+=value.byteLength; if(bytes>1024){await reader.cancel();return response({error:'The website address is too long.'},413);} content+=decoder.decode(value,{stream:true}); }
    content+=decoder.decode();
    const data=JSON.parse(content);
    if(typeof data.website !== 'string') throw new Error();
    website=normalizeWebsite(data.website);
  } catch { return response({error:'Enter a public website address such as example.com.'},400); }
  active++;
  try { return response(await auditWebsite(website)); }
  catch { return response({error:'We could not audit that address. Use a public HTTP or HTTPS website. It may block automated requests or be temporarily unavailable. No report has been invented.'},422); }
  finally { active--; }
};
