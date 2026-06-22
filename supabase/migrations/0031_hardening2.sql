-- Second hardening batch from the launch gap-audit (money/abuse/ops robustness).

-- [MED money] Referral farming: cap successful referrals per referrer so a user
-- can't mint unlimited credits with throwaway invitees. (Self-refer, double-redeem
-- per invitee, and the 14-day window are already enforced in 0021.)
create or replace function public.redeem_referral(p_invitee uuid, p_code text, p_reward integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_referrer uuid; v_created timestamptz;
begin
  if p_reward is null or p_reward <= 0 then raise exception 'INVALID_REWARD'; end if;
  select id into v_referrer from public.profiles where referral_code = upper(btrim(p_code));
  if v_referrer is null then return jsonb_build_object('ok', false, 'reason', 'invalid_code'); end if;
  if v_referrer = p_invitee then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  select created_at into v_created from public.profiles where id = p_invitee;
  if v_created is null or v_created < now() - interval '14 days' then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;
  -- Lifetime cap per referrer.
  if (select count(*) from public.referrals where referrer_id = v_referrer) >= 25 then
    return jsonb_build_object('ok', false, 'reason', 'referrer_cap');
  end if;
  begin
    insert into public.referrals (referrer_id, invitee_id, code, reward_credits)
    values (v_referrer, p_invitee, upper(btrim(p_code)), p_reward);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_redeemed');
  end;
  update public.profiles set credits = credits + p_reward where id = v_referrer;
  update public.profiles set credits = credits + p_reward where id = p_invitee;
  insert into public.credit_events (user_id, delta, reason) values
    (v_referrer, p_reward, 'referral_bonus'),
    (p_invitee, p_reward, 'referral_bonus');
  return jsonb_build_object('ok', true, 'reward', p_reward);
end;
$$;

-- [MED ops] The discovery dispatch (an external HTTP POST to GitHub) ran inline in
-- the brand_voices UPDATE with no error handling — a slow/down GitHub could wedge a
-- user-facing voice-ready write. Wrap it so a dispatch failure logs and never blocks.
create or replace function public.kick_discovery_on_new_niche()
returns trigger language plpgsql security definer set search_path = public, vault, net as $fn$
declare
  tok text; raw_niche text; raw_sub text; cand text;
  cands text[] := '{}'; to_send text[] := '{}'; window_secs integer := 3600;
begin
  if new.status <> 'ready' or old.status is not distinct from 'ready' then return new; end if;
  raw_niche := public.sanitize_niche(new.profile->>'niche');
  raw_sub   := public.sanitize_niche(new.profile->>'sub_niche');
  if raw_niche <> '' and not exists (select 1 from public.gallery_items gi where lower(gi.niche) = lower(raw_niche)) then
    cands := array_append(cands, raw_niche);
  end if;
  if raw_sub <> '' and lower(raw_sub) <> lower(raw_niche) and not exists (select 1 from public.gallery_items gi where lower(gi.niche) = lower(raw_sub)) then
    cands := array_append(cands, raw_sub);
  end if;
  foreach cand in array cands loop
    if not exists (select 1 from public.discovery_dispatch_log d where d.niche = lower(cand) and d.last_dispatch > now() - make_interval(secs => window_secs)) then
      to_send := array_append(to_send, cand);
      insert into public.discovery_dispatch_log (niche, last_dispatch) values (lower(cand), now())
      on conflict (niche) do update set last_dispatch = excluded.last_dispatch;
    end if;
  end loop;
  if array_length(to_send, 1) is null then return new; end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'gh_dispatch_token';
  if tok is not null then
    begin
      perform net.http_post(
        url := 'https://api.github.com/repos/stylique123/Twin-ai/actions/workflows/deploy-discovery.yml/dispatches',
        headers := jsonb_build_object('Authorization', 'Bearer ' || tok, 'Accept', 'application/vnd.github+json', 'User-Agent', 'twinai-discovery-trigger', 'Content-Type', 'application/json'),
        body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('only_niche', array_to_string(to_send, ',')))
      );
    exception when others then
      insert into public.ops_events (kind, severity, detail)
      values ('discovery_dispatch_failed', 'warn', jsonb_build_object('error', sqlerrm, 'niches', array_to_string(to_send, ',')));
    end;
  end if;
  return new;
end
$fn$;

-- [LOW ops] Keep the rate-limit table from bloating: purge rows older than 2 days daily.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'purge-rate-events') then perform cron.unschedule('purge-rate-events'); end if;
end $$;
select cron.schedule('purge-rate-events', '0 3 * * *', $$delete from public.rate_events where created_at < now() - interval '2 days'$$);
