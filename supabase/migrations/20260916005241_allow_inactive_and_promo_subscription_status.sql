alter table public.profiles drop constraint if exists profiles_subscription_status_check;
alter table public.profiles add constraint profiles_subscription_status_check check (subscription_status in ('inactive','trial','promo','active','expired','cancelled'));
