-- Big build 3 (agency), stage 2: approval status on a blueprint.
-- An agency can mark a blueprint client-approved before it's recorded/posted, so a
-- team can track what's signed off. A soft status (not a hard block) so solo
-- creators are unaffected. Owner-only via the existing "own generations update"
-- policy + a column grant (mirrors 0014's selected_hook/edit_style grant).
alter table public.generations add column if not exists approved boolean not null default false;
grant update (approved) on public.generations to authenticated;
