# Shared CNC library

## Owner workflow

An account with `user_roles.role = admin` sees **Gestion des annales** in Annales CNC and Mon compte. An administrator with inactive student access can also open it from Tarifs. No paid access or student-data privileges are granted by the admin role.

Choose a filière, subject and year, select a subject PDF (required) and optional corrigé, then publish or save a draft. Each file must be a PDF of at most 20 MiB. Existing entries can be edited to replace files or remove a corrigé. Edition identity is fixed while editing so students' attempts do not move to a different exam. Archive and restore are reversible; notes, scores, timers and XP stay in each student's private workspace.

No real administrator existed when implemented. The owner must identify their exact Prepago login email before any account is promoted. Never infer ownership from editable profile fields, signup metadata, or account creation order. No role assignment was performed during this change.

## Architecture

- `cnc_exams`: shared metadata, draft/published/archive state, unique non-archived edition, optimistic update checks.
- `cnc-documents`: private Supabase bucket, PDF MIME type and 20 MiB server limit. Admin-only inserts; replacements use new object paths. No student uploads or anonymous reads.
- RLS limits published metadata and PDFs to students with active, promo or trial access. Administrators can manage drafts and archived items. They do not gain access to students' private workspaces.
- File links are signed for 15 minutes and held only in the rendered page, never copied into student state. Previously issued links remain usable until expiry after unpublishing; downloaded copies cannot be revoked.
- Existing per-student document links remain a fallback for editions without a published shared PDF.
- Catalogue loads on session initialization. Students can use **Actualiser** to fetch newly published content without logging out. Older uploaded years are included in the exam list.
- Archived, replaced and interrupted-upload files are retained. Future storage cleanup must identify unreferenced objects and use the Storage API; it must not delete storage metadata with SQL.

## Verification

`tests/cnc-library.sql` ran against the connected Supabase project in a rolled-back transaction. It passed admin recognition, ignored signup role metadata, draft isolation, student upload and role-escalation rejection, published subject/correction visibility, student write rejection, inactive-access rejection, stale-update rejection, private-note isolation and preservation after archive. It inserts disposable Storage metadata only; it does not test real file bytes over the Storage API.

The isolated development preview passed file picker selection, new PDF publication with a fake Storage adapter, publishing an existing draft, correction removal, availability counts and the shared document link in the exam workspace. Desktop editor screenshot inspected. The browser stalled on the native archive confirmation; the archive backend was verified by SQL, but archive/restore UI and mobile visual verification were not completed. Live authenticated upload/download remains pending owner admin activation.

The `admin` QA mode and fake adapter exist only in development middleware and `tests/`; they are excluded from the hosted `dist` assets. Production authorization always uses Supabase RLS.

Supabase security advisors reported no new findings. The pre-existing [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains.
