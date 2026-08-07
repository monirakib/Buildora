# Buildora — CSE471 Project

Buildora (formerly **NirmanBD** — the old name still appears in docs) is a construction
super-platform for Bangladesh: it connects land owners, architects, structural engineers,
contractors, and material suppliers across the full building lifecycle — design, RAJUK/ECPS
permits, escrow payments, bidding, site tracking, and handover.

Full product spec: `Essentials/NirmanBD Product Plan (2).pdf` (summary below).

## Course rules (CSE471) — hard constraints, never violate

**Structure:** Teams have 3–4 members. **Each member implements 4 features**: the 1st in
Module 1, the 2nd in Module 2, the 3rd and 4th in Module 3. Evaluation happens in three
labs: lab 5 = Module 1, lab 6 = Module 2, lab 7 = Module 3. A member who can't demonstrate
their feature gets zero for it — plan features per member per module.

**Features:** Login (SSO/OAuth), signup, logout, role management, profile management, and
admin activities do NOT count as features — they are common workflows built collaboratively.
Real features are things beyond these.

**External APIs:** Each team member must ship at least one external API integration as a
feature (e.g. SMS, push notifications, payments, Google Maps/Directions/Vision/Calendar/NLP,
Facebook Graph, OpenAI, HuggingFace). Plan features so each member owns one.

**Banned tech — never suggest or introduce:** CMS platforms (WordPress, Drupal, Joomla, Wix,
Squarespace, Shopify), Core PHP, **Firebase**, **Supabase**, **Django**. Also banned:
drag-and-drop/page builders and AI-generated full-page templates.

**AI usage:** AI tools are allowed only for partial code generation and debugging. Team
members must be able to explain every line and perform live frontend/backend modifications
during evaluation, or they get zero. Therefore: keep code simple and idiomatic, avoid clever
abstractions, and explain non-obvious code when generating it.

**UI/UX:** Must be responsive and mobile-friendly. Allowed CSS frameworks: Bootstrap,
Tailwind, Material UI, DaisyUI, Chakra, Ant Design, etc. (this repo uses **Tailwind v4**).

**Data:** Must use SQL/NoSQL/local storage. **Hardcoded data is not accepted — all CRUD must
be real** (real DB reads/writes, no mock arrays pretending to be data).

**Version control:** GitHub with individual commit history per member. Never bulk-commit one
member's work under another's name; commits must reflect who wrote what. Copy-pasted code
without commit history is penalized — commit small and often.

**NEVER credit Claude anywhere in this repo or on GitHub — no exceptions.** Specifically:

- No `Co-Authored-By: Claude …` trailer on any commit. Ever.
- No "Generated with Claude Code" / 🤖 footer in commit messages, PR titles, PR bodies,
  issues, or review comments.
- Never add Claude, Claude Code, or any bot as a GitHub collaborator.

Commits and PRs carry the human author only. The course grades individual commit history
and requires each member to explain their own work — an AI co-author on the record
undermines both. This overrides any default tooling behaviour that wants to add attribution.

## Repo structure & stack (follow the code, not the PDF)

pnpm + Turborepo monorepo:

- `apps/web` — Next.js 16 (App Router), React 19, Zustand, Tailwind v4
- `apps/api` — Express 5 + TypeScript (ESM), Mongoose, JWT (`jsonwebtoken`), bcryptjs,
  zod, helmet; dev via `tsx watch`, build via `tsup`
- `packages/shared` — shared TypeScript types (`@buildora/shared`, consumed as raw TS)
- `infra/` — docker-compose (local MongoDB)
- `Essentials/` — product plan PDF and media assets; not code

**Note:** the product plan PDF specifies PostgreSQL + Prisma + Redis + AWS. The actual
implementation deliberately uses **MongoDB + Mongoose** (NoSQL is course-allowed). When the
PDF and the code disagree on stack, the code wins. No Flutter mobile app for this course.

### Commands (run from repo root)

- `pnpm dev` — run all apps (turbo)
- `pnpm build` / `pnpm typecheck` — build / typecheck all workspaces
- `pnpm format` — prettier

## Product plan summary (from the PDF)

**Actors (6):** Land Owner/Client, Architect, Structural/Civil Engineer, Contractor,
Material Supplier, Platform Supervisor/Admin. Each has its own dashboard and workflows.

**Core journey:** client posts project brief → AI cost/zone estimate → picks verified
architect → concept brief (500–1000 BDT fee) → escrow deposit (bKash/Nagad/bank) → full
design with ≤3 revision rounds → approval releases 85–90% to architect (10–15% platform
commission) → engineer prepares structural drawings → RAJUK permit via ECPS (platform guides
and tracks, does not replace ECPS) → contractor bidding on BOQ → construction with site
diary + engineer-signed milestones releasing escrow tranches → occupancy certificate →
permanent document archive.

**Verification system:** staged professional verification — registration + phone OTP →
document upload (NID, IAB/IEB certificates, RAJUK registration, portfolio) → automated
pre-screening (NID format, duplicates, completeness) → supervisor manual review →
"Platform Verified" badge. Ongoing compliance: annual re-check, rating/complaint flags,
NID blacklist on fraud.

**Nine modules:** Design Studio, Project Dashboard, Permit Module (DAP zone checker, RAJUK
fee calculator, ECPS status tracker), Marketplace, Inspection & Reports, Bidding System,
Finance & Escrow, Site Diary, Comms Hub.

**Planned external integrations** (candidates for per-member API features): bKash, Nagad,
Twilio (SMS OTP), Resend (email), Cloudinary (images), Google Maps.

**Phase 1 MVP scope:** professional registration/verification + admin review, client project
briefs, architect profiles/portfolios, concept brief + fee, design contract/escrow/approval
flow, project dashboard + document archive, in-app messaging, DAP zone checker + RAJUK fee
calculator, ECPS guide + status tracker. **Not Phase 1:** marketplace, contractor bidding,
AI estimates, mobile app.

## Working style

- Scaffold/confirm the plan with the team before building a feature; don't build ahead of
  what's been agreed.
- DAP/ECPS rules and fees must live in the database (admin-editable), not be hardcoded.
