# Prepago

Study workspace for Moroccan CPGE students: subjects and chapters, tasks, calendar, focus sessions, progress, CNC past papers and a TIPE space.

- **Site:** https://www.prepago.site
- **Backend:** Supabase (auth, database, storage, one Edge Function)

## What is in this repository

| Path | What it is |
| --- | --- |
| `dist/` | The site itself: plain HTML, CSS and JavaScript, no build step. What is in `dist/` is what gets served. |
| `supabase/migrations/` | Every database migration, in order. |
| `supabase/functions/prepago-ai-tutor/` | Source of the AI tutor Edge Function. |
| `tests/qa/` | Local checks that run the site against a stand-in backend. |
| `tests/*.sql` | Database tests (run inside a transaction that is rolled back). |
| `tools/publish.sh` | Publishes `dist/` by hand. |
| `RESCUE.md` | How this copy was recovered from production on 7 October 2026. |
| `AUDIT.md`, `CNC-LIBRARY.md`, `db/` | Notes and SQL kept from September 2026. |

## Run it locally

```
npm install
npm run dev
```

Logging in from a local address talks to the real Supabase project.

## Check a change

```
npm test
```

This opens every public page, the login, sign-up and activation screens and every workspace page on desktop and phone, and fails on any missing file or script error. It then runs the behaviour checks in `tests/qa/flows.py` (code journey, loading) `tests/qa/home.py` (Accueil dashboard, CNC countdown) `tests/qa/pages.py` (Concentration, Calendrier, Matières and Annales CNC: shared look and navigation) and `tests/qa/landing.py` (public home page: product tour video, XP section). No network and no real accounts are used. It needs Python with Playwright and a Chromium build.

## Publish

Pushing to `main` runs the "Publish site" workflow, which copies `dist/` to the `gh-pages` branch. GitHub Pages serves that branch at the address in `dist/CNAME`.

## How the page loads

`dist/index.html` holds both the landing page and the workspace. A visitor reading the landing page downloads only what it shows; the workspace's scripts and most of its stylesheets load when someone has a session or opens login or sign-up. The loader is the last script in `index.html`.

## Access

Students get in with an activation code, entered at sign-up or on the activation screen. Codes are created in the admin panel inside the workspace (admin accounts only).
