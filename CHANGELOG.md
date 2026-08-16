# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `npm run build` now runs `prisma generate` before `next build`. The Prisma
  client is generated into `src/generated/prisma`, which is gitignored, so a
  clean checkout — every Vercel build, and every fresh clone — compiled against
  a module that did not exist and failed on `Cannot find module
  '@/generated/prisma/client'`. Local builds only worked because a previous
  `db:migrate` or `db:generate` had left the directory behind.

### Added

- `DEPLOY.md` documents deploying without custom domains. Vercel routes
  `<project>.vercel.app` but not `{slug}.<project>.vercel.app`, so the published
  surface — which `proxy.ts` reaches only by subdomain — has no reachable host
  until a real domain exists. The section records the host configuration that
  gets marketing, auth, dashboard and editor live in the meantime, and states
  plainly what that mode does not cover.

### Deferred

- **Published sites are not viewable on a domainless deploy.** Publishing writes
  `publishedContent` as normal; nothing serves it. Serving it path-based on the
  app host was considered and rejected: it would put customer-authored content
  on the origin holding the session cookie, which is the exact risk the
  split-domain design exists to prevent. Adding a sites domain resolves this
  through configuration alone.
- **The marketing page is unreachable in that mode**, because `/` redirects to
  `/dashboard` on the app surface. Routing the URL to the marketing surface
  would restore it but skip Supabase session refresh, which `proxy.ts` performs
  only on the app surface.
- Upstash rate limiting, billing, abuse handling, the publish-time email
  verification gate, and uploads remain unbuilt — see "Known gaps" in
  `DEPLOY.md`.
