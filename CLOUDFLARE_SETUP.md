# Deploy behind a real sign-in wall (Cloudflare Pages + Access)

The GitHub Pages build serves the site to everyone — the in-app Google gate
only hides the UI. To *enforce* sign-in (nobody sees anything until they log
in), host the same repo on **Cloudflare Pages** and put **Cloudflare Access**
in front of it. Free for up to 50 users.

No code changes are needed: `next.config.ts` already builds root-relative when
`GITHUB_ACTIONS` is not set (which is the case on Cloudflare), so the export in
`out/` works at the root of a `*.pages.dev` domain.

---

## Part 1 — Host on Cloudflare Pages

1. Create a free account at <https://dash.cloudflare.com> (no card needed for Pages).
2. **Workers & Pages → Create → Pages → Connect to Git.**
3. Authorize GitHub and select **`kianvp/stocksense-the-goat`**.
4. Build settings:
   - **Framework preset:** `None`  *(do NOT pick the Next.js preset — that tries SSR; we ship a static export)*
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
5. **Environment variables** (add under Production *and* Preview). Use the same
   values you already stored as GitHub Actions secrets — do **not** paste real
   keys into this file or any committed file:
   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | *(your Google OAuth client ID, ends `.apps.googleusercontent.com`)* |
   | `NEXT_PUBLIC_FINNHUB_KEY` | *(your Finnhub key)* |
   | `NEXT_PUBLIC_GEMINI_KEY` | *(your Gemini key)* |
   | `NODE_VERSION` | `20` |
6. **Save and Deploy.** You'll get `https://stocksense-the-goat.pages.dev`.
7. In **Google Cloud Console → APIs & Services → Credentials → your OAuth client**,
   add to **Authorized JavaScript origins**:
   `https://stocksense-the-goat.pages.dev`

At this point the site is live on Cloudflare — but still public. Part 2 locks it.

---

## Part 2 — Turn on Cloudflare Access (the sign-in wall)

> Heads-up: activating **Zero Trust** is $0 for the Free plan (50 users), but
> Cloudflare may ask you to put a **card on file** during onboarding. You are
> not charged on the Free plan. If you refuse any card on file, skip Access and
> ask me for the Worker-only route instead.

1. Cloudflare dashboard → **Zero Trust** (left sidebar).
2. Pick a team name (e.g. `stocksense`) → choose the **Free** plan.
3. **Settings → Authentication → Login methods → Add new → Google.**
   Cloudflare shows a redirect URL like
   `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`.
   - In Google Cloud Console, create a **second** OAuth client (type: Web app),
     paste that redirect URL into **Authorized redirect URIs**, and copy its
     **Client ID + Client Secret** back into Cloudflare. Save, then **Test**.
4. **Access → Applications → Add an application → Self-hosted.**
   - **Application name:** StockSense
   - **Application domain:** `stocksense-the-goat.pages.dev`
5. **Add a policy:**
   - **Action:** Allow
   - **Include:** either *Emails* → your address (just you), or
     *Login Methods* → Google (anyone with a Google account), or
     *Emails ending in* → `@gmail.com`.
6. Save. Done.

Now visiting `stocksense-the-goat.pages.dev` forces the Cloudflare login first —
static files included. Unauthenticated users get nothing.

---

## After it works

- Turn off the old GitHub Pages deploy if you want a single source of truth:
  repo **Settings → Pages → Source → None** (or delete `.github/workflows/nextjs.yml`).
- The in-app Google button still works for the personalized greeting/watchlist.
  Optionally I can wire the app to read the signed-in identity straight from
  Access (`/cdn-cgi/access/get-identity`) so users only log in once — ask me.
