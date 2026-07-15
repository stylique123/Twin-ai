-- 0067: critical ops events must reach a human. Rows with severity
-- error/critical previously sat inert in ops_events until an admin happened to
-- open /metrics — a dead worker, failed refund, or refused billing grant was
-- silent. Fan each one out as an in-app notification to every platform admin
-- (the bell already polls notifications). Self-contained: no webhook/email
-- dependency to configure.
create or replace function public.notify_admins_on_ops_alert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.severity in ('error', 'critical') then
    insert into public.notifications (user_id, type, title, body, link)
    select pa.user_id,
           'ops_alert',
           'Ops alert: ' || new.kind,
           coalesce(left(new.detail::text, 240), ''),
           '/metrics'
      from public.platform_admins pa;
  end if;
  return new;
end;
$$;

drop trigger if exists ops_alert_notify on public.ops_events;
create trigger ops_alert_notify
  after insert on public.ops_events
  for each row execute function public.notify_admins_on_ops_alert();
