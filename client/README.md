# Wayfinder Client

React + Vite frontend for Wayfinder. This folder is deployed as its own Vercel project with `client` set as the root directory.

## Scripts

- `npm run dev` starts the Vite development server.
- `npm run build` runs type-checking and creates the production bundle.
- `npm run start` previews the built SPA locally.
- `npm run lint` runs ESLint.
- `npm run test` runs Vitest in CI mode.
- `npm run typecheck` runs the TypeScript compiler without emitting files.

## Environment

Copy `.env.example` to `.env` and set:

```bash
VITE_API_BASE_URL=http://localhost:3000/api
```

Only browser-safe variables belong here. Secrets stay in the server project.

## Vercel

- Project root: `client`
- Framework preset: `Vite`
- SPA rewrite: handled by `vercel.json`

The client consumes server APIs over HTTP and does not depend on a shared build pipeline with the backend.
