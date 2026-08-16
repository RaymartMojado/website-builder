# Website Builder

Drag-and-drop website builder. Multi-page sites with shared navigation, published to
subdomains, on a Stripe subscription with a 7-day trial.

**Status: Phases 0–3 complete** — foundation and auth, the document model and renderer,
and a working drag-and-drop editor. Multi-page navigation (Phase 4), a full publish
pipeline (5) and Stripe billing (6) are next.

## Requirements

- **Node 22 or later.** `@supabase/supabase-js` has deprecated Node 20, and Node 20
  lacks the global `WebSocket` it expects (tests and scripts polyfill it with `ws`).
  The project runs on 20 today but will not indefinitely.
- Docker Desktop, for the local Supabase stack.

## Getting started

```bash
npm install
npx supabase start          # Postgres + Auth + Studio in Docker
cp .env.example .env        # then paste in the values `supabase start` printed
npm run db:deploy           # apply migrations
npx tsx scripts/seed-demo.ts
npm run dev
```

| Surface | URL | Notes |
|---|---|---|
| Marketing | http://localhost:3000 | |
| App | http://app.localhost:3000 | sign in / dashboard |
| Published sites | http://acme-coffee.sites.localhost:3000 | one per customer subdomain |

`*.localhost` resolves automatically in Chrome, Edge, and Firefox — no hosts file edits.

Supabase Studio is at http://127.0.0.1:54323, and mail sent by Auth is caught at
http://127.0.0.1:54324 rather than delivered.

## Architecture

Three surfaces on two registrable domains, split by `Host` in `src/proxy.ts`:

```
yourbuilder.com          → marketing
app.yourbuilder.com      → app (auth required)
{slug}.yourbuilder.site  → published customer content
```

Published sites sit on a **separate registrable domain**. Sibling subdomains are
same-site for cookie purposes, so hosting customer content next to the app would put a
stored XSS one step from a session cookie. Submit the published domain to the
[Public Suffix List](https://publicsuffix.org/) before launch — it takes weeks.

### Data

Supabase owns the `auth` schema; Prisma owns `public` exclusively. `public.profiles`
mirrors `auth.users` via triggers in `prisma/migrations/*_supabase_auth_bridge`. There
is deliberately **no cross-schema foreign key** — Prisma models foreign keys, cannot see
across schemas, and would report one as drift on every `migrate dev`. Triggers give the
same integrity and are invisible to Prisma's differ.

### The editor

The canvas is an `<iframe>`, mounted with **its own React root** rather than a portal.
React delegates events at the root container and events raised inside an iframe never
bubble to the parent document, so a portal renders correctly and then ignores every
click. Both roots share the module-level Zustand store, so state stays single-sourced.

Drag-and-drop is built on raw pointer events, not dnd-kit. A drag starts in the parent
document (the palette) and is hit-tested against elements inside the iframe; library drag
systems assume one document, so every target would need a coordinate shim. Since the
hit-testing has to be custom anyway, the library adds translation without removing work.
The accessibility it would have provided comes instead from the Layers panel, which moves
and nests anything from the keyboard (WCAG 2.5.7).

Two traps worth knowing if you touch canvas code:

- **Never use `instanceof HTMLElement` on canvas elements.** They belong to the iframe's
  realm, where the parent window's constructor does not match, so the check is always
  false. Use `nodeIdOf()` in `store/drag.ts`.
- **Never build derived arrays inside a Zustand selector.** The snapshot must be
  reference-stable or React re-renders forever. Select stable references, derive with
  `useMemo` — see `useBreadcrumb`.

### Two rules worth knowing before you write code

**1. RLS does not protect application queries.** Prisma connects with a privileged role
and bypasses row-level security entirely. The RLS enabled in the auth-bridge migration
guards PostgREST, not us. Tenant isolation is `src/lib/auth/guards.ts` and nothing else.

**2. Load tenant records through the guards.** `requireSite`, `requirePage`,
`requireSymbol`, `requireAsset`. They scope by owner and throw `NotFoundError` — never
`Forbidden`, because distinguishing "not yours" from "doesn't exist" leaks which ids are
real. `eslint.config.mjs` bans bare `findUnique` on tenant models so this cannot regress.

A second lint rule bans `supabase.auth.getSession()`, which trusts the cookie without
verifying it. Use `getUser()`.

## Commands

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run verify` | typecheck + lint + tests |
| `npm test` | vitest |
| `npm run db:migrate` | create and apply a migration |
| `npm run db:deploy` | apply pending migrations |
| `npx tsx scripts/verify-phase0.ts` | end-to-end check: auth, sites, publishing |
| `npx tsx scripts/verify-editor.ts` | end-to-end check: editor route, autosave, IDOR |
| `npx tsx scripts/seed-demo.ts` | demo account with a two-page site |

Tests always run against local Supabase. `tests/setup.ts` loads `.env.test` with override
and refuses to start if it points anywhere non-local — the suites truncate tables.

## Layout

```
src/
├─ proxy.ts                    host routing + security headers + session refresh
├─ lib/
│  ├─ auth/guards.ts           tenant access control          ← A01
│  ├─ security/headers.ts      per-surface CSP                ← A05
│  ├─ security/rate-limit.ts   in-memory or Upstash           ← A07
│  ├─ billing/entitlement.ts   plan limits (Stripe in Phase 6)
│  ├─ sites/{service,published,subdomain}.ts
│  └─ supabase/{server,client}.ts
└─ app/
   ├─ signin/                  email + password
   ├─ dashboard/               site CRUD
   └─ site/[slug]/[[...path]]/ published renderer (Phase 1)
```

## Next: Phase 4

Pages and navigation — page CRUD with a switcher and tree, header/footer editing with an
affected-pages banner, the menu editor, the link picker wired into every link-taking prop
with referrer warnings before delete, symbols, and a `Nav` component with dropdowns and
an accessible mobile drawer.

The composition seam (`RenderPage` taking header/body/footer) and the `Link` type already
exist and are used — Phase 4 builds the UI for editing them, not the machinery.
