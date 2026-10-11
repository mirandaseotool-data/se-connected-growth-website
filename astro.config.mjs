import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
const site = process.env.SITE_URL || 'https://selabs.com.au';
const url = new URL(site);
if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('SITE_URL must be a bare origin.');
if (process.env.RELEASE === 'true' && (url.protocol !== 'https:' || /^(localhost|127\.|\[::1\])/.test(url.hostname))) throw new Error('Release requires a confirmed public HTTPS SITE_URL.');
export default defineConfig({ site: url.origin, output: 'static', adapter: node({mode:'standalone'}), trailingSlash: 'always' });
