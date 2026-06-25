-- Scene Timeline (V2 Creative Studio) — the single source of truth for a
-- generation's script, hook, teleprompter, editor cuts, captions and b-roll.
-- Stored as jsonb ON the generation it belongs to, so it travels with the row
-- the V2 flow already loads and inherits the existing generations RLS (no new
-- policies needed — a user only ever sees their own generations).
--
-- Additive and nullable: existing rows and the V1 flow are 100% unaffected;
-- scene_timeline is simply null until a V2 build writes it.

alter table public.generations
  add column if not exists scene_timeline jsonb;

comment on column public.generations.scene_timeline is
  'V2 Creative Studio Scene Timeline (single source of truth). Shape mirrors src/lib/timeline.ts SceneTimeline. Null for V1 generations.';
