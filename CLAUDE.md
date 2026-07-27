# CLAUDE.md - Report Ease App (Field Service Tracker)

## Project Overview

Angular 18.1.3 PWA for tracking field service activities. Firebase (Firestore + Auth) backend.
Cloudflare Worker for AI features (weather tips, chatbot). Deployed to Netlify.

## Quick Commands

- `npm start` - Dev server (http://localhost:4200)
- `npm run build -- --configuration production` - Production build
- `npm run test -- --no-watch --browsers=ChromeHeadless` - Run tests once
- `npm run lint` - ESLint check
- `npm run lint:fix` - ESLint auto-fix
- `npm run format` - Prettier format all files
- `npm run format:check` - Prettier check (CI mode)
- `npm run firebase:deploy-rules` - Deploy Firestore rules (staging)
- `npm run firebase:deploy-rules:prod` - Deploy Firestore rules (production)

## Architecture

- **Framework**: Angular 18 with standalone components (no NgModules)
- **State**: No state management library; services with RxJS
- **Styling**: Tailwind CSS + component CSS files
- **Auth**: Firebase Auth (@angular/fire)
- **Database**: Firestore with persistent offline cache (multi-tab)
- **PWA**: Angular service worker (ngsw-config.json)
- **AI**: Cloudflare Worker at /cloudflare-worker/ (separate deploy via wrangler)

## Key Directories

- `src/app/_services/` - Core services (api, auth, network, notification, etc.)
- `src/app/_guard/` - Route guards (auth, auth-redirect)
- `src/app/_utils/` - Utility functions
- `src/app/_animations/` - Shared animations
- `src/app/_directives/` - Custom Angular directives
- `src/app/components/` - Shared/reusable components
- `src/app/dashboard/`, `home/`, `login/`, `register/`, `settings/`, `planner/` - Page components
- `src/environments/` - Firebase config (environment.ts = dev, environment.prod.ts = prod)
- `cloudflare-worker/` - Cloudflare Worker (separate wrangler.toml, separate deploy)

## Build Output

`dist/report_ease_app/browser/browser/` - Note the double "browser" path.
This is the Netlify publish directory configured in netlify.toml.

## Conventions

- 2-space indentation, single quotes for TypeScript
- Standalone components throughout (no NgModules)
- Services use constructor injection
- Prefix: `app-` for component selectors
- Commit messages: `feat:`, `fix:`, `update:`, `hotfix:`, `chore:` prefixes

## Environment / Credentials

- Firebase config is in `src/environments/environment.ts` and `environment.prod.ts`
- These files are committed to the repo (Firebase keys are client-side safe, security is via Firestore rules)
- Production Firebase project ID: `reportease-app`
- Angular.json handles file replacement for prod builds

## Testing

- Framework: Karma + Jasmine
- Spec files exist across src/ but many contain stale auto-generated tests
- CI runs: `ng test --no-watch --browsers=ChromeHeadless`

## Deployment

- **Netlify**: Auto-deploy on push to master via GitHub Actions
- **Cloudflare Worker**: Manual deploy via `wrangler deploy` from /cloudflare-worker/
- **Firestore Rules**: Manual deploy via npm scripts

## Branch Strategy

- Trunk-based: feature branches PR into master, auto-deploy on merge
- Branch naming: feature/_, fix/_, hotfix/*

## Linting

- ESLint with angular-eslint (flat config in eslint.config.js)
- Several rules set to "warn" for gradual cleanup: no-explicit-any, prefer-control-flow, accessibility rules
- Prettier for formatting (.prettierrc)
- Husky + lint-staged runs on pre-commit (changed files only)
