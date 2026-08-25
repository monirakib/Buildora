# Buildora

The construction super-platform for Bangladesh — connecting land owners, architects,
structural engineers, contractors, and material suppliers in one trusted digital ecosystem.
Every professional verified, every payment protected, every permit tracked.

A land owner posts a brief, picks a verified architect, funds an escrow, watches the design
through revision rounds, appoints a structural engineer, tracks the RAJUK permit, runs a
sealed contractor tender, and releases construction money tranche by tranche against
engineer-signed inspections — all in one place.

## Stack

| Layer    | Technology                                     |
| -------- | ---------------------------------------------- |
| Web      | Next.js 16 (React 19), Tailwind CSS 4, Zustand |
| API      | Node.js, Express 5, TypeScript (ESM)           |
| Database | MongoDB (Mongoose ODM)                         |
| Auth     | JWT + database-backed sessions, bcrypt         |
| Realtime | Socket.IO (messaging, notifications, WebRTC)   |
| Shared   | `@buildora/shared` — types, enums, constants   |
| Monorepo | pnpm workspaces + Turborepo                    |
| CI       | GitHub Actions (typecheck + build)             |

## Structure

```
buildora/
  apps/
    web/          Next.js frontend (App Router, src/app)
    api/          Express API (routes → controllers → models → services)
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

# Seed the reference data the permit, bidding and estimator tools read
pnpm --filter @buildora/api seed:admin      # supervisor account
pnpm --filter @buildora/api seed:permits    # DAP zones, RAJUK fee rules, ECPS steps
pnpm --filter @buildora/api seed:build      # BOQ guide rates, inspection checklists
pnpm --filter @buildora/api seed:prices     # starter market prices for the cost estimator

# Run web (http://localhost:3000) + API (http://localhost:4000) together
pnpm dev
```

Every external key is optional — the API boots without them and the features that need a key
say so rather than failing. `apps/api/.env.example` documents each variable.

## Scripts

| Command          | Description                            |
| ---------------- | -------------------------------------- |
| `pnpm dev`       | Run all apps in dev mode (Turborepo)   |
| `pnpm build`     | Production build of all packages       |
| `pnpm typecheck` | TypeScript checks across the workspace |
| `pnpm format`    | Prettier over the whole repo           |

## Modules

The nine modules from the product plan, plus the accounts and verification layer underneath
them. All data is real — read and written to MongoDB; nothing is mocked.

| Module                   | What it does                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Accounts & roles**     | Six actors, JWT + DB sessions, device list, admin console with live analytics                                                                                                                                                                                                                                                                                                  |
| **Verification**         | A staged wizard per role — land owner (identity + registered address), architect (IAB), engineer (IEB + seal), contractor and supplier (trade licence, TIN/BIN) — with automated NID and credential pre-screens, one NID per account, and a supervisor review queue. Unverified accounts can browse everything but can't act; land owners can still order from the marketplace |
| **Design Studio**        | Briefs, architect proposals, concept fee, design contract, revision rounds, and a full-screen 3D design studio — floor plans, furniture and 693 CC0 model kits — that mirrors every save into the BOQ and permit pipeline                                                                                                                                                    |
| **Cost Estimator**       | AI cost ladder for a brief, sharpened by a RAG pipeline over admin-approved market prices — local embeddings match each BOQ line to the closest live listing, kept current by a weekly scrape-and-refresh job                                                                                                                                                                |
| **Finance & Escrow**     | Escrow deposits, staged releases, platform commission, full payment ledger per contract                                                                                                                                                                                                                                                                                        |
| **Permit Module**        | DAP zone checker, RAJUK fee calculator, ECPS step tracker, and a permit-application tracker with a per-type document checklist — all admin-editable, none hardcoded                                                                                                                                                                                                            |
| **Bidding System**       | BOQ tender builder, **sealed** contractor bids, side-by-side comparison, award                                                                                                                                                                                                                                                                                                 |
| **Inspection & Reports** | Milestone schedule, engineer-signed inspections with geotagged photo proof, escrow tranche release                                                                                                                                                                                                                                                                             |
| **Site Diary**           | Daily log with labour, materials and equipment, stamped with the weather over the plot                                                                                                                                                                                                                                                                                         |
| **Marketplace**          | Supplier product listings, land-owner orders, gateway checkout, road-distance delivery ETA to the build site                                                                                                                                                                                                                                                                  |
| **Professional Directory** | Public architect, engineer and contractor directories — portfolios, ratings and reviews, filterable by division/district, feeding straight into Inquiries                                                                                                                                                                                                                  |
| **Comms Hub**            | Per-project messaging, 1:1 voice and video calls (WebRTC), notification bell, admin broadcasts                                                                                                                                                                                                                                                                                 |
| **Project Hub**          | One tabbed view per project — Overview, Architect, Engineer, RAJUK, Contractor, Site diary, Documents — with a progress bar computed from real completed gates                                                                                                                                                                                                                 |

## External integrations

| Service                 | Used for                                        | Key needed |
| ----------------------- | ------------------------------------------------ | ---------- |
| Cloudinary              | Image, document and 3D model uploads             | yes        |
| SSLCommerz              | Payment gateway (sandbox)                        | yes        |
| Google Gemini           | NID card OCR, in-app assistant (fallback)        | yes        |
| Groq                    | In-app assistant, site diary digest (primary)    | yes        |
| OpenRouteService        | Delivery ETA and road route to the build site    | yes        |
| Open-Meteo              | Site diary weather and rain-day tally            | no         |
| OpenStreetMap/Nominatim | Plot map picker, geocoding (via Leaflet)         | no         |
| IAB public directory    | Architect membership lookup                      | no         |

Cost-estimate retrieval runs on a local embedding model (`Xenova/all-MiniLM-L6-v2`, via
`@huggingface/transformers`) — no network call and no key, but the first run downloads and
caches the model.

Meeting invites are generated as Google Calendar / Outlook links and `.ics` downloads on the
client, so the calendar feature needs no API key or OAuth consent.

## A note on verification

The automated checks are **pre-screening, not verification**. Bangladesh publishes no free
lookup for an NID (the Election Commission's Porichoy gateway is fee-based and
corporate-gated), a BIN or TIN, an IEB membership, or a trade licence. What the platform does
is check formats, expiry dates, duplicate claims across accounts, and — for architects only —
the public IAB directory. A human supervisor is the gate on every badge, and no screen output
is ever presented as government verification.

## Course context

Built for CSE471 (Software Engineering). MongoDB is used deliberately in place of the
PostgreSQL/Prisma stack named in the original product plan; where the plan and the code
disagree, the code is current.
