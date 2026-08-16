# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Opening the editor from the dashboard no longer wraps it in the dashboard's
  chrome. The layout decided whether to render the header, trial banner and
  centred column by reading the request pathname from a header, but Next reuses
  a shared layout across client-side navigations rather than re-rendering it —
  so a soft navigation into the editor kept the chrome rendered for the
  dashboard, squeezing a full-viewport tool into `max-w-5xl`, and a manual
  refresh appeared to fix it. The chrome moved into a `(chrome)` route group
  beside the editor, so the router picks it per route. URLs are unchanged.
- `getCurrentUser` is now deduplicated per request, so the auth boundary and the
  chrome layout share one verification against the auth server instead of two.

### Added

- Height has a slider and a number box in the inspector, beside width. It was
  reachable only by typing an exact value such as `48px` into a text field —
  the knowledge the size presets exist to avoid requiring. This matters for
  images and logos, whose side handles write width only, so scaling one meant
  setting a height first.
- Site cards have a Preview button. The address sat under the title as a bare
  link, which read as metadata rather than an action, and on a deployment with
  no sites domain it is a path rather than a hostname — not something worth
  showing to be read.

- A Logo's image now honours the styles set on it. The `<img>` carried a
  hardcoded inline `width: auto`, and an inline style outranks the compiled
  class, so resizing the node stretched the anchor while the picture inside it
  stayed put. `border-radius` failed the other way around: it applied to the
  anchor, and the square image covered the rounded corners. The image now fills
  the node's box and inherits its radius. It uses `object-fit: contain`, so a
  logo is never stretched — which does mean changing width alone re-boxes the
  image rather than scaling it, because the aspect ratio is then held by the
  height. The resize handles write width only (`resize-handles.tsx`), so
  scaling a logo by dragging still needs a height to be set alongside it.

- The app is readable again on a machine set to dark mode. `globals.css` still
  carried create-next-app boilerplate whose `body { background; color }` rule
  sat outside any cascade layer, so it overrode the `bg-neutral-50
  text-neutral-900` that `layout.tsx` sets on `<body>` — unlayered CSS beats
  Tailwind v4's layered utilities regardless of specificity. Under
  `prefers-color-scheme: dark` that repainted body text near-white while every
  card kept `bg-white`, leaving the dashboard white-on-white: site names,
  section headings, field labels and the Rename button were all invisible. The
  UI is a light design with no dark variants in any component, so it now
  declares `color-scheme: light` rather than half-flipping. Real dark-mode
  support remains unbuilt.
- `font-mono` renders in a monospace face. The same boilerplate mapped
  `--font-mono` and `--font-sans` to `var(--font-geist-*)`, which nothing
  defines because no font is loaded, so the seven `font-mono` labels resolved
  to an invalid value and inherited Arial from `body`.
- Published pages no longer collide with the app over `--color-background`.
  That token is a site theme value produced by `lib/styles/compile.ts`, but the
  boilerplate also defined it on `:root` as app chrome; since published pages
  share the root layout, which one won came down to stylesheet order.

- The editor now works in Safari. The canvas iframe carried
  `sandbox="allow-same-origin"`, and WebKit gives a script-disabled browsing
  context no events at all: the parent's listeners on the iframe document never
  fired, so the page rendered correctly and every click, drag and hover was
  silently dropped. Selecting a node did nothing, the inspector stayed empty and
  components could not be dragged onto the canvas — in Chromium, all of it
  worked. The attribute is gone; nothing in the canvas can execute, because no
  block type emits raw HTML and authored content never reaches
  `dangerouslySetInnerHTML`.
- The Playwright suite now runs in WebKit as well as Chromium. The two specs
  that already covered this — "clicking an element selects it and fills the
  inspector" and the palette drag — passed throughout, because a chromium-only
  suite cannot see an engine-specific defect in the one part of the editor that
  depends on cross-realm event delivery.

- `npm run build` now runs `prisma generate` before `next build`. The Prisma
  client is generated into `src/generated/prisma`, which is gitignored, so a
  clean checkout — every Vercel build, and every fresh clone — compiled against
  a module that did not exist and failed on `Cannot find module
  '@/generated/prisma/client'`. Local builds only worked because a previous
  `db:migrate` or `db:generate` had left the directory behind.

### Added

- Published sites are now viewable without owning a domain. When
  `NEXT_PUBLIC_SITES_HOST` cannot serve sites, a site is served on the app's own
  origin at `/s/{slug}`, and every "view site" link points there. Previously
  publishing wrote `publishedContent` that nothing could display, because
  wildcard subdomains require a domain you own.

  This trades away real isolation: published content is rendered on the origin
  holding the session cookie, which is what the separate registrable domain
  exists to prevent. It is defensible only while the account owner is the sole
  author — nothing in the builder can currently author a script, since no block
  type emits raw HTML and authored content never reaches
  `dangerouslySetInnerHTML`. Setting a real sites host restores subdomain
  serving and disables the `/s/` route automatically, with no code change; the
  same-domain guard in `src/lib/env.ts` stays armed either way.

  Internal links inside a preview carry a `basePath`, so nav stays inside the
  site rather than resolving against the app's own routes.

- `DEPLOY.md` documents deploying without custom domains. Vercel routes
  `<project>.vercel.app` but not `{slug}.<project>.vercel.app`, so the published
  surface — which `proxy.ts` reaches only by subdomain — has no reachable host
  until a real domain exists. The section records the host configuration that
  gets marketing, auth, dashboard and editor live in the meantime, and states
  plainly what that mode does not cover.

### Deferred

- **The marketing page is unreachable in that mode**, because `/` redirects to
  `/dashboard` on the app surface. Routing the URL to the marketing surface
  would restore it but skip Supabase session refresh, which `proxy.ts` performs
  only on the app surface.
- Upstash rate limiting, billing, abuse handling, the publish-time email
  verification gate, and uploads remain unbuilt — see "Known gaps" in
  `DEPLOY.md`.
