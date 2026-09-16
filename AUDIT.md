# Prepago product improvement pass — 16 September 2026

Existing project and public URL preserved. The current Sites design was newer than the GitHub design; this pass reconciles that design with the latest main-branch promo fix. Production serves `dist` only. No student records were deleted.

## Implemented

- Retained Tarifs: Prepago 29 DH/month, Prepago AI+ 99 DH/month, current status, promo field and logout. Paid checkout and AI tools explicitly remain unavailable.
- Improved French authentication errors, resend/reset recovery handling and signup wording. Login accepts existing passwords regardless of the signup minimum. New-account database defaults and all six subscription statuses verified.
- Hardened promo privileges, serialized redemptions, prevented reuse and paid-access downgrade, retained atomic usage accounting. Successful redemption reloads the profile and opens the workspace without manual refresh.
- Prevented account-to-account timer/state leakage and unclaimed legacy-browser data imports. Inactive access retains stored data. Added save status, retry, per-account unsynced drafts and optimistic concurrency to reject stale-device writes.
- Preserved the dashboard identity, added real student greeting and consistent partial chapter progress. Real session data drives study totals/charts.
- Added useful task filters and priority labels, calendar quick-add tasks, focus duration presets/objectives/reset, subject/chapter rename, real progression statistics, account settings and honest AI+ preparation.
- Reduced running-timer cloud writes, restored runtime state after account changes, and paused timers on logout/access expiration.
- Fixed collapsed mobile dashboard columns, horizontal overflow and header overlap. Improved labels, focus indicators, wrapping and empty states.

## Verification and evidence

Preview used the supervised local server. The isolated fixture in `tests/fixture.js` intentionally contains no Supabase client and is available only through the development server. It is not shipped in `dist` and does not prove authenticated end-to-end behavior.

| Requested flow | Result |
| --- | --- |
| Create account / verify email / login | Database creation trigger and inactive default passed transactional tests; real Auth API, email delivery and browser login remain unverified. |
| Inactive pricing / active dashboard | Ten access-status and expiry regression cases passed; pricing and dashboard visually previewed. Real session navigation remains unverified. |
| Promo validation and activation | Supabase tests passed invalid, inactive, expired, usage-cap, repeat and successful redemption; usage/redemption recorded, access activated. Real browser redemption remains unverified. |
| Create/complete task and dashboard count | Passed isolated browser interaction. |
| Calendar event and task deadline | Passed isolated browser interaction. |
| Start/pause/resume/finish focus and study totals | Passed isolated browser interaction; recorded session increased total. |
| Add chapter and progress steps / XP | Passed isolated browser interaction through all five stages. |
| Progress page and month toggle | Passed isolated browser interaction. |
| CNC filière, subject, ten years, notes, score, completion | Passed isolated browser interaction; real cross-session cloud persistence remains unverified. |
| Logout / login again / cross-device persistence | State isolation and cache regression tests passed; actual authenticated browser cycle remains unverified. |
| Responsive layout | Dashboard checked at 390, 768, 1024, 1280 and 1440px. Additional mobile subjects, progress, calendar, AI and pricing checks; additional desktop task, focus and account checks. |

Screenshots under `tests/evidence/` show final desktop, mobile and pricing previews with labeled fictitious data. Initial screenshots identified the collapsed mobile grid and fixed-header overlap, both corrected.

Run `node tests/regressions.cjs` for account/timer isolation, cache retention and access-state cases. `tests/backend-audit.sql` was executed against the connected Supabase database and rolled back, including disposable auth users and promo codes. It verifies own-account RLS, forbidden subscription edits, inactive write rejection, successful promo access, redemption counts, retained inactive data and stale-write rejection. JavaScript syntax and whitespace checks passed.

Applied migrations are recorded in `db/`. These files target the existing schema and are not a full fresh-database bootstrap.

## Remaining work and limits

- Complete real signup, mailbox verification, login, invalid credentials, password recovery, promo redemption and logout/login persistence using a dedicated test account. No production-ready certification is claimed before this completes.
- Payment provider/webhooks and real AI services are not connected. AI+ entitlement is stored server-side; future AI endpoints must enforce it server-side.
- CNC document URLs still need a verified, licensed exam catalogue; the app does not invent PDF documents.
- Supabase reports leaked-password protection disabled; enable this through the project's supported Auth settings. See https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
- Existing promo policy allows one redemption per account, preserved deliberately. Existing RLS permits promo rows without expiry whereas frontend access requires expiry; current redemption always sets expiry and users cannot edit subscription fields.
- XP is personal progress stored with the workspace, not a tamper-proof rewards currency. The existing layered global-script architecture remains and would benefit from a separate gradual modularization effort.
- This pass covers the flows above; it does not claim exhaustive testing of every edit/delete, network failure, browser or accessibility combination.
