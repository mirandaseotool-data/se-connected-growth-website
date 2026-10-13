# Contributing

Create a feature branch and open a pull request. Do not push changes directly to main.

The current app is Astro with a Node automatic-audit endpoint. Use Node 24, npm ci and npm run dev for local development. Run ASTRO_TELEMETRY_DISABLED=1 npm run build:release, RELEASE=true npm test and npm run test:api before review.

Check desktop/mobile layout and keyboard interaction. Include screenshots for visual changes where useful. Keep commits focused and preserve accessible controls. Never commit secrets, .env files, dependencies, generated builds or unrelated client material. The supplied logo artwork must be preserved; use SELABS for new document branding.

The legacy root HTML/CSS/JS files remain for reference; edit src/ for the current application. The backend is required for automatic audits. Review hosting configuration before merging because external deploy hooks may run.
