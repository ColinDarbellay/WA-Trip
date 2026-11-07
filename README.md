# Western Australia 2027 – trip planner

Your camper trip planner as a standalone web app: OpenStreetMap with real road routes, budget, packing list per person, live sync between your two phones, and offline viewing.

Setup takes about 20 minutes, once. You need a free GitHub account and a free Supabase account.

## 1. Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com), sign up, and click **New project**. Pick a name (e.g. `wa-trip`), a database password, and region **Sydney** or **Frankfurt**.
2. When the project is ready, open **SQL Editor → New query**.
3. Open `supabase/schema.sql` from this folder, replace `COLIN_EMAIL_HERE` and `ISABEL_EMAIL_HERE` with your two email addresses, paste it in and click **Run**.
4. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.
5. Open `config.js` and paste them in place of `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY`.

## 2. Put the app online (GitHub Pages)

1. On [github.com](https://github.com), click **New repository**, name it e.g. `wa-trip`, and create it (public is fine; the trip data stays in Supabase, only your two emails can read it).
2. Click **uploading an existing file** and drag in everything from this folder (including the `supabase` folder and the hidden `.nojekyll` file). Click **Commit changes**.
3. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and **Save**.
4. After a minute, your app is at `https://YOUR-GITHUB-NAME.github.io/wa-trip/`.

## 3. Connect login to your app address

In Supabase: **Authentication → URL Configuration**

- **Site URL**: your GitHub Pages address from step 2.4
- **Redirect URLs**: add the same address.

## 4. First start

1. Open the app address on your phone, enter your email at the top, and tap **Send login link**. Open the email on the same phone and tap the link.
2. The route list shows **Load our saved route (25 stops)**. Tap it once to bring in everything planned so far.
3. Road routes are drawn one leg at a time over the first minute and then saved.
4. Add the app to your home screen: on iPhone **Share → Add to Home Screen**, on Android **⋮ → Install app**.
5. Isabel does step 1 on her phone with her email. Everything she changes appears on yours within a second, and the other way round.

## Offline

Once opened online, the app and your last synced trip open without a connection (read-only). Map areas you have looked at stay available offline; zoom into the regions you'll visit before you leave to keep them on the phone.

## Good to know

- Map: © OpenStreetMap contributors. Routes: OSRM public demo server (free, fine for personal use; it may be slow at times).
- To change who has access, edit the `members` table in Supabase (**Table Editor → members**).
- After changing app files later, raise `APP = "wa-app-v1"` in `sw.js` to `v2` so phones pick up the new version.
