# AdventureRacing

## Setup

```sh
npm install              # postinstall auto-creates cesium symlink + .env symlinks in worktrees
cp .env.example .env     # then add real VITE_CESIUM_ION_TOKEN
cp .env client/.env      # client needs VITE_CESIUM_ION_TOKEN too (or just the token line)
```

In git worktrees, `npm install` auto-symlinks `.env` and `client/.env` from the main working tree.

MinIO needed for S3 locally: endpoint `http://localhost:9000`, creds `minioadmin/minioadmin`, bucket `adventure-racing`.

## Dev

```sh
npm run dev              # starts server (:3001) + client (:5173 with proxy)
npm run dev:server       # server only
npm run dev:client       # client only
```

## Build

```sh
npm run build            # builds shared -> server -> client
```

## Testing

```sh
npm run test:e2e                              # Playwright e2e (auto-starts dev servers if not running)
npm run test:smoke -w e2e                     # smoke tests only
BASE_URL=https://... npm test -w e2e          # run against remote target
```

## Deploy (Fly.io)

```sh
fly deploy                                    # production (adventure-racing app, CDG region)
fly deploy --app adventure-racing-dev         # dev environment
fly logs -a adventure-racing                  # view logs
```

## GitHub

- Repo: `https://github.com/nail60/AdventureRacing.git`
- Branch: `main`
- Use `gh` CLI for PRs, issues

## Architecture

- npm workspaces monorepo: shared, server, client, e2e
- Cesium hoists to root `node_modules`; symlink needed at `client/node_modules/cesium` (handled by postinstall)
- Server: Express + SQLite (better-sqlite3) + S3 — DB auto-creates + migrates on startup
- Client: React + Vite + CesiumJS/Resium
- Shared types via `@adventure-racing/shared`
- Tracklogs = raw files in S3; Scenes = derived compressed artifacts
