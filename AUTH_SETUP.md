# Authentication setup

The app supports three sign-in methods:

- **Magic link** (email OTP) - works by default
- **Email + password** - requires Supabase dashboard flag
- **Google OAuth** - requires Google Cloud setup + Supabase dashboard config

Follow this checklist once per Supabase project (staging and production are
separate projects; repeat for each).

---

## 1. Run the migration

From the Supabase SQL editor (or `supabase db push` via the CLI), run
[`supabase/migrations/0005_profiles.sql`](supabase/migrations/0005_profiles.sql).

This creates:

- `public.profiles` table (keyed by `auth.users.id`)
- On-insert trigger that creates a profile row for every new signup
- RLS so users can update their own profile and read fellow-household members
- `avatars` public storage bucket with per-user write policies

It is idempotent - safe to re-run.

---

## 2. Email provider (magic link + password)

In the Supabase dashboard:

1. **Authentication -> Providers -> Email** - make sure it is enabled.
2. Toggle **"Confirm email"** on if you want signups to verify before first
   login. (Magic-link signups are effectively pre-confirmed; password signups
   will be blocked from signing in until the confirmation email is clicked.)
3. **Authentication -> Policies -> Redirect URLs** - add the app origin(s):
   - `http://localhost:3000/**`
   - `https://<your-prod-domain>/**`
   - any Vercel preview pattern you want to support, e.g.
     `https://home-inventory-catalog-*.vercel.app/**`

   These must match exactly (including wildcards) or the magic-link /
   password-reset emails will not redirect back into the app.

No environment variables are needed for email auth beyond the existing
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## 3. Google OAuth

### Google Cloud console

1. Go to [Google Cloud Console -> APIs & Services -> Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** of type **Web application**.
3. Under **Authorized redirect URIs**, add:

   ```text
   https://<your-supabase-ref>.supabase.co/auth/v1/callback
   ```

   (You can find the exact URL on the Supabase **Providers -> Google** page.)

4. Save and copy the **Client ID** and **Client secret**.

### Supabase dashboard

1. **Authentication -> Providers -> Google** - toggle **Enabled**.
2. Paste the **Client ID** and **Client secret** from Google.
3. Leave **"Skip nonce checks"** off.
4. Save.

### App side

No env changes are required - the login page calls
`supabase.auth.signInWithOAuth({ provider: 'google', ... })` and Supabase
handles the OAuth round-trip. After Google redirects back to Supabase,
Supabase redirects to the app's `/auth/callback` where we already exchange
the code for a session.

---

## 4. Environment variables

Make sure `NEXT_PUBLIC_SITE_URL` is set on Vercel (and in `.env.local` for
dev) to the canonical origin of the deployment:

```bash
# .env.local
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Vercel (prod)
NEXT_PUBLIC_SITE_URL=https://your-prod-domain
```

This is used to build the `redirectTo` for magic links, password resets,
and OAuth callbacks. If it is wrong, users will land on the wrong
environment after clicking their email link.

---

## 5. Smoke test

After deploy:

1. Visit `/login`.
2. **Sign in** tab: create a password-based account (if you enabled
   confirmation, click the confirmation email first) then log in.
3. **Forgot password** link -> enter email -> click the link in the email ->
   set a new password -> you should land signed in on `/`.
4. **Continue with Google** -> approve -> you should land signed in on `/`.
5. **Magic link** -> enter email -> click the link -> signed in on `/`.
6. `/account` -> update display name, upload an avatar - both should persist
   across reload, and the sidebar chip + Settings members list should
   reflect the new name.
