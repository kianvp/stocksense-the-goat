# Real sign-in enforcement on Cloudflare Workers (free, no credit card)

The site is a static export (`output: "export"` → `./out`) deployed as a
Cloudflare **Worker with static assets**. A small Worker (`worker/index.ts`)
runs *in front of* those files and refuses to serve anything without a valid
signed session. Sign-in is Google, verified **server-side**, so the app's
HTML/JS never reaches an unauthenticated visitor. This is genuine enforcement
and costs nothing — the Workers free plan needs no card (unlike Cloudflare
Access / Zero Trust, which does).

## How it works

- `run_worker_first: true` makes the Worker handle **every** request.
- No valid `ss_session` cookie → the Worker returns a Google sign-in page.
- On sign-in, the browser posts the Google ID token to `/__auth`. The Worker
  verifies it against Google, checks the audience (your client ID), then sets:
  - `ss_session` — HttpOnly, HMAC-signed, 7 days. The actual gate.
  - `ss_id` — readable identity so the app greets the user without a 2nd login.
- `/__logout` clears both cookies.

## One-time setup in the Cloudflare dashboard

Your project already builds. You only need to add **three Worker variables** and
make sure the deploy command is `npx wrangler deploy`.

1. **Project → Settings → Variables and Secrets** — add (type: *Secret* for the
   secret ones):
   | Name | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | your Google OAuth client ID (ends `.apps.googleusercontent.com`) |
   | `SESSION_SECRET` | a long random string — e.g. run `openssl rand -hex 32` |
   | `ALLOWED_EMAILS` | *(optional)* comma-separated emails allowed in; leave unset to allow any Google account |

   > These are **runtime** Worker variables (used by `worker/index.ts`), separate
   > from the `NEXT_PUBLIC_*` **build** variables the site's JS uses. Keep both.

2. **Settings → Build**
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - `NODE_VERSION` = `22`

3. **Google Cloud Console → Credentials → your OAuth client → Authorized
   JavaScript origins** — add your Worker URL (e.g. `https://stocksense-the-goat.<subdomain>.workers.dev`).
   This lets the Google button render on the sign-in page.

4. **Retry deployment.**

## Test it

- Open the site in a private window → you should see the **InvestSense sign-in
  page**, not the app.
- Sign in with Google → the app loads.
- The account menu's **Sign out** hits `/__logout` and drops you back to the wall.

## User database (D1) + admin page

Every successful Google sign-in is recorded in a **Cloudflare D1** database
(serverless SQLite, free plan). The `users` table creates itself on first use —
no migration step.

| Column | Source |
| --- | --- |
| `google_id` | Google's stable `sub` claim (primary key) |
| `email` / `name` / `picture` | from the verified ID token |
| `created_at` | first sign-in |
| `last_login` | refreshed on every subsequent sign-in |

Persistence is **best-effort by design**: if the `DB` binding is missing or the
database errors, the Worker logs it and still signs the user in. Auth never
depends on the database.

### Turning it on (one-time)

1. **Create the database** — dashboard → *Storage & Databases* → *D1* → *Create*,
   name it `investsense`. (CLI equivalent: `npx wrangler login` then
   `npx wrangler d1 create investsense`.) Copy the **Database ID**.
2. **Uncomment the `d1_databases` block** at the bottom of `wrangler.jsonc` and
   paste the ID into `database_id`. Deploy fails if this ID is wrong or blank,
   which is why it ships commented out.
3. **Add `ADMIN_EMAILS`** under *Settings → Variables and Secrets* as a **Secret**
   (secrets survive `wrangler deploy`; plaintext vars get wiped). Comma-separated
   list of emails allowed to see the admin data, e.g. `you@gmail.com`.
4. **Push.** The table is created on the first sign-in after deploy.

> With `ADMIN_EMAILS` unset the admin routes deny **everyone**, including you —
> that's the intended fail-closed default.

### Viewing users

- **Page:** `/admin` — table of name, email, date joined, last login.
- **Raw JSON:** `GET /__admin/users` → `{ "users": [...], "count": n }`

Both require a valid session **and** an email in `ADMIN_EMAILS`. A normal
signed-in user gets `403`; an anonymous visitor gets `401`/the login wall.

You can also query it directly:

```bash
npx wrangler d1 execute investsense --remote --command "SELECT * FROM users"
```

## Going live on a custom domain (ask-market.ai)

Cloudflare Workers is the only free host that can run this app's sign-in gate:
the gate *is* a Worker sitting in front of the files. Static-only hosts (GitHub
Pages, Netlify drop, Vercel static) serve `./out` directly, which means every
"members-only" page is readable by anyone. Don't move the site to one.

Order matters — do 1 before 4, or sign-in will break on the new domain.

1. **Add the domain to Cloudflare.** Dashboard → *Add a site* → `ask-market.ai`
   → Free plan. Cloudflare gives you two nameservers.

2. **Repoint the nameservers at GoDaddy.** GoDaddy → *My Products* → the domain
   → *Nameservers* → *Change* → *I'll use my own* → paste Cloudflare's two.
   Propagation is usually minutes, up to 24h. Cloudflare emails you when active.

3. **Attach the domain to the Worker.** Workers & Pages → this Worker →
   *Settings* → *Domains & Routes* → *Add* → *Custom domain* → `ask-market.ai`.
   Repeat for `www.ask-market.ai` if you want it. The TLS certificate is issued
   automatically and is free.

4. **Google Cloud Console → Credentials → your OAuth client → Authorized
   JavaScript origins** — add `https://ask-market.ai` (and `https://www.ask-market.ai`).
   Without this the Google button silently fails to render on the new origin.
   Keep the `workers.dev` origin listed until you stop using it.

5. **Set the canonical URL.** *Settings → Build → Variables* → add build variable
   `NEXT_PUBLIC_SITE_URL` = `https://ask-market.ai`, then redeploy. This drives
   `metadataBase`, the OG/Twitter tags, `robots.txt` and `sitemap.xml`
   (see `src/lib/site.ts`). Skip it and link previews keep pointing at the old
   `workers.dev` URL.

> The Worker's internal name (`stocksense-the-goat`) is invisible to visitors
> once a custom domain is attached — renaming it creates a *new* Worker and
> drops the `SESSION_SECRET` secret and the `NEXT_PUBLIC_*` build variables.

## Rollback

If anything misbehaves, revert to a public static site by removing `"main"` and
the `binding`/`run_worker_first` lines from `wrangler.jsonc` (leaving just
`assets.directory`), and redeploy. Note this also removes the sign-in gate.
