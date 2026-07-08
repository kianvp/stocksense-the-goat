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

- Open the site in a private window → you should see the **StockSense sign-in
  page**, not the app.
- Sign in with Google → the app loads.
- The account menu's **Sign out** hits `/__logout` and drops you back to the wall.

## Rollback

If anything misbehaves, revert to a public static site by removing `"main"` and
the `binding`/`run_worker_first` lines from `wrangler.jsonc` (leaving just
`assets.directory`), and redeploy.
