# Buildora

The construction super-platform for Bangladesh — connecting land owners, architects,
structural engineers, contractors, and material suppliers in one trusted digital ecosystem.
Every professional verified, every payment protected, every permit tracked.

## Stack

| Layer    | Technology                                     |
| -------- | ---------------------------------------------- |
| Web      | Next.js 16 (React 19), Tailwind CSS 4, Zustand |
| API      | Node.js, Express 5, TypeScript                 |
| Database | MongoDB (Mongoose ODM)                         |
| Shared   | `@buildora/shared` — types, enums, constants   |
| Monorepo | pnpm workspaces + Turborepo                    |
| CI       | GitHub Actions (typecheck + build)             |

## Structure

```
buildora/
  apps/
    web/          Next.js frontend (App Router, src/app)
    api/          Express API (routes → controllers → models)
  packages/
    shared/       Shared TypeScript types, enums, constants
  infra/          docker-compose (MongoDB), deployment config
```

## Getting started

Prerequisites: Node.js ≥ 20 and pnpm ≥ 9.

```sh
pnpm install

# Environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# MongoDB — either:
#   a) MongoDB Atlas (no install): set MONGODB_URI in apps/api/.env
#   b) Local via Docker:           docker compose -f infra/docker-compose.yml up -d

# Run web (http://localhost:3000) + API (http://localhost:4000) together
pnpm dev
```

The API boots without a database (health endpoint works) so the scaffold can be
explored before MongoDB is configured.

## Scripts

| Command          | Description                            |
| ---------------- | -------------------------------------- |
| `pnpm dev`       | Run all apps in dev mode (Turborepo)   |
| `pnpm build`     | Production build of all packages       |
| `pnpm typecheck` | TypeScript checks across the workspace |
| `pnpm format`    | Prettier over the whole repo           |

## Roadmap (Phase 1 MVP)

Built step by step — see the product planning document. Current state: **scaffold only**;
auth endpoints are stubs (`501`), one starter `User` model.

1. ✅ Monorepo scaffold (web, api, shared, infra, CI)
2. Auth: registration, login, JWT, role-based access control
3. Professional verification: document upload, admin review queue, badges
4. Client project brief posting
5. Architect profiles and portfolios
6. Concept brief + fee flow
7. Design contract, escrow, and approval flow
8. Project dashboard and document archive
9. In-app messaging per project
10. DAP zone checker + RAJUK fee calculator
11. ECPS submission guide and permit status tracker
