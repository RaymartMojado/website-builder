# Deploying

## GitHub cannot host this

GitHub Pages serves static files only. This app needs a running Node server:
server-rendered pages, API routes, Prisma talking to Postgres, and Supabase auth
reading and writing cookies. None of that survives being flattened to static HTML.

What GitHub *does* do here is run the tests — `.github/workflows/ci.yml` spins up
Supabase, applies migrations, and runs the unit, DOM and browser suites on every push.

To make the app live you need two things GitHub does not provide:

| Need | Service |
|---|---|
| Somewhere to run Node | **Vercel** — first-party Next.js support, free tier is enough to start |
| A hosted Postgres and auth | **Supabase** — you already have a project |

---

## 1. Supabase (hosted)

From your project at supabase.com:

- **Project Settings → API** — Project URL, `anon` key, `service_role` key
- **Project Settings → Database** — the **Session pooler** connection string

Apply the schema to it:

```bash
DATABASE_URL="<pooler-url>" npx prisma migrate deploy
```

> The password is URL-encoded in that string. `?` becomes `%3F` and `@` becomes
> `%40`, or the URL parses wrong and you get an opaque auth failure.

Add `?pgbouncer=true&connection_limit=1` to the pooler URL. Serverless functions
open a connection per invocation, and without this you exhaust the pool under
very little load.

Then in **Authentication → URL Configuration**, set the Site URL to
`https://app.yourbuilder.com` and add it to the redirect allowlist, or the email
confirmation links will point at localhost.

---

## 2. Domains

You need **two registrable domains**, not two subdomains of one:

```
yourbuilder.com          marketing
app.yourbuilder.com      the app
{slug}.yourbuilder.site  published customer sites   ← different domain
```

This is not cosmetic. Sibling subdomains are same-site for cookie purposes, so a
stored XSS on any customer's published page could reach the session cookie for
the app. Vercel, Webflow and Wix all separate these for the same reason.

Add `*.yourbuilder.site` as a wildcard domain in Vercel; it provisions the
certificate. Submit the sites domain to the
[Public Suffix List](https://publicsuffix.org/submit/) — it takes weeks, so open
the PR early.

`src/lib/env.ts` refuses to boot a production build whose app and sites hosts
share a registrable domain.

---

## 3. Vercel

```bash
vercel login
vercel link
vercel --prod
```

Environment variables (Project Settings → Environment Variables):

| Variable | Value |
|---|---|
| `DATABASE_URL` | pooler URL, with `?pgbouncer=true&connection_limit=1` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key — **never** prefix this `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_MARKETING_HOST` | `yourbuilder.com` |
| `NEXT_PUBLIC_APP_HOST` | `app.yourbuilder.com` |
| `NEXT_PUBLIC_SITES_HOST` | `yourbuilder.site` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |

`NEXT_PUBLIC_*` values are inlined at **build** time, so changing one needs a
redeploy, not just a restart.

Upstash is not optional in production. Without it the rate limiter falls back to
per-instance memory, and every serverless instance keeps its own counters — which
means the sign-in limits do not really exist.

---

## 4. After the first deploy

```bash
curl -I https://app.yourbuilder.com
```

- `content-security-policy` present, with a nonce
- `strict-transport-security` present
- **no `set-cookie` carrying a `Domain=` attribute** — a host-only session cookie
  is what keeps published sites away from it

Then sign up, create a site, publish a page, and load it on the sites domain.

---

## Known gaps before real users

- **Billing is not built.** `getEntitlement()` treats everyone as trialing, so
  there is nothing stopping unlimited free use. Stripe is phase 6.
- **No abuse handling.** A hosting product attracts phishing. There is a
  `SUSPENDED` site status and an audit log, but no reporting route and no
  moderation view.
- **No email verification gate on publishing.** The check exists in
  `requireVerifiedUserId` but is not yet wired to the publish action.
- **Uploads are not built.** Images are remote URLs; there is no asset pipeline
  and no storage quota enforcement.

None of these block a demo. All of them block charging people money.
