-- Applied through Supabase migration product_security_and_plan.
-- No student records are deleted or backfilled.
alter table public.profiles add column if not exists subscription_plan text not null default 'standard'
  check (subscription_plan in ('standard','ai_plus'));
revoke all on public.promo_codes from anon, authenticated;
revoke all on public.promo_redemptions from anon, authenticated;
grant select on public.promo_redemptions to authenticated;
revoke truncate, references, trigger on public.student_app_state from anon, authenticated;
revoke all on public.student_app_state from anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.redeem_promo_code(text) from public, anon;
grant execute on function public.redeem_promo_code(text) to authenticated;
-- Subscription fields remain read-only to students; existing column-level
-- grants allow edits to full_name and filiere only.
revoke update on public.profiles from authenticated;
grant update(full_name,filiere) on public.profiles to authenticated;
