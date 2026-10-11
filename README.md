# SELABS website — source handoff

This is the current Astro website with an automatic website-audit backend. It replaces the earlier static one-page implementation. Copying HTML alone is insufficient.

## Local development
Use Node 24 LTS. Run `npm ci`, then `npm run dev`. Open the localhost URL printed by Astro.

## Build and verify
Run `ASTRO_TELEMETRY_DISABLED=1 npm run build:release`, then `RELEASE=true npm test` and `npm run test:api`.
Start the built application with `HOST=127.0.0.1 PORT=4321 npm start`.

## Deployment
A Node-capable host is required. Build output contains both client and server code. Do not publish only dist/client. Configure HTTPS, the canonical host and proxy/rate limits for the chosen platform. Hosting is not configured by this handoff.

## Collaboration
Target repository: https://github.com/mirandaseotool-data/se-connected-growth-website
Create a feature branch and submit a pull request according to CONTRIBUTING.md. Inspect existing external deployment settings before merging into main. Keep the repository LICENSE and CONTRIBUTING.md. The legacy root index.html/styles.css/script.js are not the current app entrypoints; src/ contains the current app.

## Main files
- src/pages/index.astro: homepage
- src/pages/audit.astro: audit report UX
- src/pages/api/audit.ts: server endpoint
- src/lib/server/: safe public fetch and deterministic audit checks
- src/styles/: design and layout
- public/: logo and other assets
- scripts/: tests

## Current boundaries
Automatic checks inspect initial HTML and public crawl files. They do not establish Google indexing, AI recommendations, visual usability or live performance. Contact uses an email draft rather than server-side delivery. Report state is not persisted. API limits are per process and need appropriate ingress/shared configuration when deployed at scale.

No .env secrets, node_modules, generated dist, unrelated client documents or Git metadata are included. Brand name for new materials is SELABS; supplied logo artwork is preserved.
