# Rescued from production — 7 October 2026

Access to the tool that built and deployed Prepago was lost. This branch is a copy of what was actually running, taken so the project has a source of truth again.

## What is here

| Path | What it is | Where it came from |
| --- | --- | --- |
| `dist/` | The complete site as served at https://www.prepago.site on 7 October 2026 (133 files: 11 pages, 41 scripts, 36 stylesheets, 32 icons, plus fonts and images). | Downloaded file by file from the live site. |
| `supabase/functions/prepago-ai-tutor/` | Source of the AI tutor Edge Function (version 1). | Read from the Supabase project. |
| `supabase/migrations/` | All 27 database migrations, in order, as recorded by Supabase. | Read from `supabase_migrations.schema_migrations`. |
| `rescue-manifest.json` | Every URL that was fetched, with its size, type and status. | Written during the download. |

## What you should know

- **`dist/` is build output, not original source.** The stylesheets have hashed names (`styles.7c4512a173da.css`) and scripts carry `?v=` numbers that some lost build step produced. It runs as-is on any static host; there is no build step to run. New work can edit these files directly.
- **Three things differ from the live files, on purpose:**
  - Cloudflare's bot-detection snippet, which Cloudflare adds to each page at delivery time, was removed from the 11 HTML files. It is not part of the site.
  - The example text in the admin promo-code form (`dist/promo-admin.js`) was a real, active promo code. It is replaced with `CODE-EXEMPLE` here because this repository is public.
  - The same code is replaced with `REDACTED_LAUNCH_CODE` in `supabase/migrations/20260916004656_promo_code_access_system.sql`.
- **Six icons were recovered by probing**, because the site builds their file names at run time and no page links to them directly: `circle-dot`, `expand`, `flask-conical`, `minus`, `paperclip`, `send`.
- **Not included:** the database contents, the private PDF in Supabase Storage, the Edge Function's secrets (`OPENAI_API_KEY`, `PREPAGO_AI_MODEL`, `PREPAGO_AI_LIVE`), and Supabase Auth settings (email templates, redirect URLs, SMTP). Those live in the Supabase project.
- **`tests/` and the QA preview in `vite.config.mjs` are stale.** They were written for the 16 September code and do not match these files. `db/` holds the older hand-kept SQL notes; `supabase/migrations/` is the complete record.

## Checks done on this copy

- The zip passed its integrity check. All 115 untouched files match the sizes recorded at download; the only differences are the 12 files changed on purpose above.
- Served locally, all 8 public pages plus the login and sign-up views loaded with no missing files and no script errors.
- All scripts parse.
- No secret keys are present; the only Supabase key in `dist/` is the publishable one, which is meant to be public.

## Run it locally

```
npx vite dist
```

or any static file server pointed at `dist/`.

## Deploy it somewhere you control

`dist/` is a plain static site. On any static host (Cloudflare Pages, Netlify, Vercel, GitHub Pages), set the publish directory to `dist` and leave the build command empty. Then point `www.prepago.site` at the new host, and add the new address to the allowed redirect URLs in Supabase Auth if it changes.
