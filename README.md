# Stone's AI Video Maker

Create AI videos and animations in one click, right in the browser.

## What it does

- **Text to video:** type an idea and get an animated video with scenes, captions, icons and music.
- **Image to animation:** upload up to 6 photos and get a moving slideshow with zoom, pan, transitions and captions.
- **Talking avatar:** pick a presenter (Nova, Leo, Mia or Bolt), type a script, and they read it with lip sync and live captions.
- **4 styles:** Cinematic, Anime, 3D and Explainer.
- **4 formats:** TikTok / Reels (9:16), YouTube (16:9), Instagram square (1:1) and Instagram post (4:5).
- Live progress bar, gallery of past videos, one-click download and share.
- **Accounts and credits:** guests get 10 free credits on their device. A free account gets 30 credits and saves videos to the cloud. Text and photo videos cost 1 credit, avatars cost 2. A "buy credits" screen is ready for payments later.

## How it works

The demo engine draws every frame on a `<canvas>` and records it with `MediaRecorder`, with a soundtrack made by the Web Audio API. Nothing is uploaded unless you sign in. Videos come out as MP4 where the browser supports it (Chrome, Edge, Safari) and WebM otherwise.

The avatar's voice uses the browser's built-in speech. It plays live in the preview, but browsers don't let a page record that voice, so downloaded avatar videos have captions and music, without the voice. A pro engine (below) fixes that.

```
index.html            page layout
css/styles.css        design
js/app.js             screens, buttons, gallery, sharing
js/config.js          Supabase URL + publishable key, credit prices
js/supabase.js        sign-in and credits
js/store.js           saved videos (this device + Supabase Storage)
js/providers.js       list of video engines (demo now, pro engines later)
js/engine/            the demo engine: scenes, styles, avatars, music, recorder
supabase/schema.sql   database tables, security rules and storage bucket
netlify.toml          hosting settings
```

## Set up Supabase (one time)

1. Open your Supabase project, go to **SQL Editor → New query**.
2. Paste everything from [`supabase/schema.sql`](supabase/schema.sql) and press **Run**.
3. In **Authentication → URL Configuration**, set the Site URL to your Netlify address.

This creates `profiles` (with credits), `credit_transactions`, `videos` and a private `videos` storage bucket. Row level security means each user only sees their own videos and credits, and credits can only go down through the `spend_credits` function.

## Admin page (`/admin.html`)

A console for you, the platform owner, to sell subscriptions: create subscriber accounts with an activation key (like `SAV-7KQ2-M9XD-4TPA`), record mobile money or cash payments that extend the subscription, chase renewals on WhatsApp, manage each subscriber's users and passwords, see a business dashboard and export everything to Excel.

Members of an active subscription make **unlimited videos** (no credits spent). A customer types their key in **My account → Have an activation key?** in the app.

Setup, one time:
1. Supabase → SQL Editor → run [`supabase/migrations/002_admin_platform.sql`](supabase/migrations/002_admin_platform.sql) (after `schema.sql`; safe to run again). If you ran `schema.sql` before this change, run it again too so credits are skipped for subscribers.
2. Open `https://<your-site>/admin.html`, sign in with your app account and click **Claim platform owner** (only the very first account can).
3. In **Platform settings**, set the support phone, currency and prices.

## Run locally

It's a static site with no build step:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy

Netlify serves the repository root as is (see `netlify.toml`). No build command is needed.

## Adding a pro AI engine later

`js/providers.js` lists fal.ai, Replicate, Runway and HeyGen/D-ID as "coming soon". To switch one on:

1. Add a Netlify Function (for example `netlify/functions/generate.mjs`) that calls the provider's API with a secret key stored in Netlify environment variables. Never put that key in the browser code.
2. Set `available: true` on the provider and give it a `generate(job, io)` that calls the function, reports progress with `io.onProgress`, and returns `{ blob, mime, ext, thumb, duration }`.
3. Charge credits from the server for paid engines so users can't skip payment.

## Payments later

The credits screen shows example packs. To sell them, add a checkout (for example Stripe or a mobile money provider) and a server webhook that adds credits to `profiles.credits` with the Supabase service role key.
