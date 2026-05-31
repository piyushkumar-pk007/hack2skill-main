# Wayfinder

Wayfinder is scaffolded as a two-project MERN application so the frontend and backend can be deployed independently on Vercel:

- `client/` is a React + Vite single-page application deployed as a static Vercel project.
- `server/` is an Express API deployed as a separate Vercel project using Serverless Functions.
- `shared/` contains the TypeScript travel domain model that both projects import so the core data contracts stay in one place.

## Repository Layout

```text
.
|-- client/
|-- server/
`-- shared/
```

## Deploy Model

Create two separate Vercel projects from this same repository:

1. Frontend project
   - Root Directory: `client`
   - Framework Preset: `Vite`
   - Output: static SPA
2. Backend project
   - Root Directory: `server`
   - Framework Preset: `Other`
   - Runtime: Vercel Serverless Functions

These builds are intentionally decoupled. The client only needs `VITE_API_BASE_URL`, and the server only needs backend secrets such as `MONGODB_URI`.

## Environment Contract

### Client

```bash
VITE_API_BASE_URL=https://your-wayfinder-api.vercel.app/api
```

### Server

```bash
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
CLIENT_ORIGIN=https://your-wayfinder-client.vercel.app
PORT=3000
NODE_ENV=development
```

`MONGODB_URI` must always come from `process.env.MONGODB_URI`. No connection strings should be committed anywhere in source.

## Real-Time Update Strategy

Vercel Serverless Functions cannot hold persistent WebSocket connections reliably, so Wayfinder is scaffolded for:

- Server-Sent Events (SSE), or
- polling with ETag / conditional requests

This tradeoff is documented now so later phases do not drift toward a long-lived `socket.io` server that would not fit Vercel's execution model.

## MongoDB / Mongoose Constraint

The server scaffold includes a cached Mongoose connection helper that memoizes the connection across serverless invocations. This avoids opening a fresh Atlas connection on every cold start or request burst.

## Getting Started

Install dependencies per project:

```bash
cd client && npm install
cd ../server && npm install
```

Then run each app independently:

```bash
cd client && npm run dev
cd ../server && npm run dev
```

Feature work is intentionally deferred until the next phase.
