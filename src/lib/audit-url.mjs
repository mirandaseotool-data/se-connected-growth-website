export function normalizeWebsite(value) {
  const raw = value.trim();
  if (!raw || raw.length > 500 || /\s/.test(raw)) throw new Error('Enter a website such as example.com.');
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || url.hostname.startsWith('.') || url.hostname.endsWith('.')) throw new Error('Use a public website address such as example.com.');
  return url.href;
}
