create policy promo_rate_limits_no_direct_access on private.promo_rate_limits for all to authenticated using (false) with check(false);
