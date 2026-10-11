# SELABS website — source handoff

This is the current Astro website with an automatic website-audit backend. It is a proposed successor to the earlier static one-page implementation. Copying HTML alone is insufficient.

## Which version am I opening?
- `main` preserves the original static website.
- `sara/automatic-audit` contains Sara's updated website and automatic audit backend for review.
- The root `index.html`, `styles.css`, and `script.js` are the preserved original files. Opening that HTML directly shows the original version, not Sara's updated website.
- The updated homepage is `src/pages/index.astro`. To view it, check out `sara/automatic-audit`, run the development commands below, and open the localhost URL. Automatic audit also needs the running server.

This branch does not deploy the website or change `main`. Review the application and hosting requirements before merging.

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
