# Where To Poo

Find a free public restroom near you, anywhere you travel. The locations are
crowdsourced: signed-in users add restrooms they know about, and everyone votes
on whether each one is still there.

Built as a **mobile web app (PWA)** — it opens in any phone browser and can be
added to the home screen, where it runs full-screen with its own icon, no app
store required.

---

## Run it right now

```bash
yarn install
yarn dev
```

Open <http://localhost:3000>. In Chrome, press **F12 → the phone icon** to switch
to a phone-sized view.

**It works immediately with no accounts.** Without a Supabase project it runs on
a dozen built-in sample restrooms around Manhattan, so you can see and click
every screen. Adding and voting are the only things that need the real database.

> Location only works over `https://` or on `localhost`. Opening the dev server
> from your phone via a LAN address like `http://192.168.1.5:3000` will silently
> fail to get a fix — that's a browser security rule, not a bug. Deploy to Vercel
> (below) to test on a real phone.

---

## Connect the real database

About ten minutes, all free tier.

### 1. Create the Supabase project

1. Go to <https://supabase.com> and sign up.
2. **New project**. Name it `where-to-poo`, pick a region near your users, and
   save the database password somewhere.
3. Wait for it to finish provisioning (~2 minutes).

### 2. Create the tables

1. In the left sidebar: **SQL Editor → New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql) from this repo, copy the
   whole file, paste it in, and press **Run**.
3. You should see "Success. No rows returned." It's safe to run again later.

This creates the two tables, the security rules, and the `nearby_restrooms`
search function.

### 3. Turn on Google sign-in

1. **Authentication → Sign In / Providers → Google → Enable**.
2. Supabase shows you a **Callback URL**. Copy it.
3. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   **Create Credentials → OAuth client ID → Web application**, and paste that
   callback URL into **Authorized redirect URIs**.
4. Copy the **Client ID** and **Client Secret** back into Supabase and save.

### 4. Point the app at it

1. **Project Settings → API**. Copy the **Project URL** and the **anon public**
   key.
2. In this folder:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Restart `yarn dev`. The "Demo data" banner disappears.

The anon key is meant to be public — Row Level Security is what protects the
data. The **service role** key is the secret one; it only belongs in
`.env.local`, only for the seed script below.

### 5. (Optional) Fill the map with real data

```bash
yarn seed:osm          # New York City
yarn seed:osm london   # or london, paris, tokyo, sf, chicago
yarn seed:osm 51.28,-0.51,51.69,0.33   # or a custom south,west,north,east box
```

This imports public toilets from OpenStreetMap so the app isn't empty on launch.
Needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Re-running updates rather than
duplicating. OpenStreetMap data is ODbL-licensed — see the note at the top of
`supabase/seed-osm.ts`.

---

## Deploy

```bash
npx vercel
```

Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the Vercel
project's environment variables, then redeploy. Two things to do afterwards:

- Add `https://your-app.vercel.app/auth/callback` to the Google OAuth redirect
  URIs, and set the **Site URL** in Supabase → Authentication → URL Configuration.
- Open the URL on your phone and use **Share → Add to Home Screen**.

---

## How it works

```
src/
  app/            routes: / (map), /add, /login, /me, /auth/callback
  components/     the screens; restroom-map.tsx is the only Leaflet code
  lib/            queries.ts is the entire data layer (5 functions)
supabase/
  schema.sql      tables, security rules, and the search function
  seed-osm.ts     OpenStreetMap importer
```

**Finding is anonymous, contributing is not.** Anyone can browse the map without
an account — someone who needs a restroom right now should never hit a login
wall. Adding and voting require Google sign-in, which is what makes the
crowdsourced data worth trusting.

**Trust is computed in the database, not on the phone.** Every restroom gets a
score from its votes, and `restrooms_with_scores` turns that into one of three
states:

| State | Meaning | Pin |
| --- | --- | --- |
| Confirmed | 2+ net votes, confirmed in the last 180 days | Green |
| Unverified | New, or not enough votes yet | Amber |
| Reported gone | 3+ net "it's gone" votes | Grey, faded |

Anything below −5 stops appearing at all. Recency is deliberately part of the
test: a restroom last confirmed in 2019 tells a traveller nothing today, and that
decay is what stops crowdsourced data from quietly rotting.

**Search is one database call.** `nearby_restrooms(lat, lng, radius, limit)` does
the radius filter (via a PostGIS spatial index), the distance calculation, the
sort, and the confidence rating in a single round trip. Panning the map refetches
for the new viewport, debounced.

---

## Costs

Everything here is free at small scale: Supabase free tier, Vercel hobby tier,
and OpenStreetMap tiles with no API key.

One thing to know before you promote the app widely: the public OpenStreetMap
tile server is meant for development and light use, not a busy consumer app. The
tile URL lives in one place (`src/components/restroom-map.tsx`), so moving to a
free-tier host like Stadia Maps or Carto is a one-line change when the time
comes.

---

## Not in v1

Deliberately left out, in rough priority order: photos, offline caching via a
service worker, search-by-city when location is denied, reporting/blocking abusive
entries, and native App Store builds.
