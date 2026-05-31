# Wayfinder Server

Express API for Wayfinder, deployed as its own Vercel project with `server` set as the root directory.

## Architecture Notes

- Runs on Vercel Serverless Functions through `api/index.ts`
- Uses Express for routing and middleware composition
- Reuses a cached Mongoose connection to avoid exhausting MongoDB Atlas connections
- Must read MongoDB credentials from `process.env.MONGODB_URI` only
- Will use SSE or conditional polling for real-time updates, not persistent WebSockets

## Scripts

- `npm run dev` starts the local Express server with file watching.
- `npm run build` runs type-checking and emits the TypeScript build to `dist/`.
- `npm run start` runs the local server without watch mode.
- `npm run lint` runs ESLint.
- `npm run test` runs Vitest in CI mode.
- `npm run typecheck` runs the TypeScript compiler without emitting files.

## Environment

Copy `.env.example` to `.env` and set:

```bash
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
CLIENT_ORIGIN=http://localhost:5173,https://your-wayfinder-client.vercel.app
PORT=3000
NODE_ENV=development
```

`CLIENT_ORIGIN` accepts a comma-separated list, and wildcard Vercel origins such as `https://*.vercel.app` are supported.

Do not commit real credentials. The connection string must never be hardcoded in source.

## Vercel

- Project root: `server`
- Framework preset: `Other`
- API rewrite: `/api/* -> /api/index.ts`

Because Vercel serverless functions are ephemeral, this scaffold does not use `socket.io` or any other persistent WebSocket transport.
