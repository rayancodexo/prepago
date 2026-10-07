-- Applied to production on 2026-10-07 as Supabase migration workspace_size_limit_and_grants.
-- A saved workspace is one JSON document; cap it at 2 MiB (largest today is about 20 KB).
alter table public.student_app_state
 add constraint student_app_state_data_size check (octet_length(data::text) <= 2097152);
-- Same grant hardening student_app_state already has.
revoke truncate, references, trigger on public.study_sessions, public.study_settings from anon, authenticated;
