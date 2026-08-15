-- A DEFAULT WE WROTE DOWN IS NOT A CHOICE THE CREATOR MADE.
--
-- ⚠️ THE FREE-TEXT ROW IS NOT THE PROBLEM. `selected_hook` was reported as a
-- corrupted field because one row holds "PICK THIS HOOK for the cover and broll"
-- instead of a hook. Measured before building on it: of 23 rows with a hook, 22
-- are an EXACT match to one of that generation's five offered options. One is
-- not. That is a single legacy row, not a corrupted dataset, and the writing
-- path cannot produce another — `pickHook` only ever persists an option's own
-- text (apps/web/src/pages/Result.tsx).
--
-- ⚖️ THE REAL DEFECT IS THE OPPOSITE ONE, AND IT IS LARGER. Result.tsx captures
-- the RECOMMENDED hook on load when none is stored:
--
--     if (id && !g?.selected_hook && initial) updateGenerationChoice(...)
--
-- with the stated reason that the learning signal was otherwise nearly empty
-- (1 of 15). It made the column non-empty by filling it with something no
-- creator ever picked, and nothing distinguishes the two afterwards. Measured:
-- 14 of 23 rows equal option[0] and are indistinguishable from that default.
-- The usable preference signal is 8 rows, not 23 — and every one of those 14 is
-- a row a ranking model would read as "the creator preferred the first option".
--
-- ⚠️ THIS IS `unrecorded is not none` WEARING A DIFFERENT FACE. The fix is not
-- to stop defaulting — the teleprompter genuinely needs a hook to shoot — but to
-- record HOW the value got there, so a reader can ask for choices and get
-- choices.
--
-- ⚖️ AND IT KEEPS THE ODD ROW RATHER THAN FORBIDDING IT. A creator who typed an
-- instruction into the hook field was telling us something — that they wanted a
-- channel and used the only one available. `source = 'freeform'` records that as
-- a fact about the product instead of deleting it as bad data.
alter table public.generations
  add column if not exists hook_choice jsonb;

-- ⚠️ THREE SOURCES, AND THE ABSENT ROW IS A FOURTH STATE. NULL means the choice
-- predates this column — never "the creator did not choose". Every row written
-- before 0134 is NULL and must stay unreadable as a preference.
alter table public.generations
  drop constraint if exists generations_hook_choice_shape;
alter table public.generations
  add constraint generations_hook_choice_shape check (
    hook_choice is null or (
      jsonb_typeof(hook_choice) = 'object'
      and hook_choice ->> 'source' in ('creator', 'default', 'freeform')
      -- A creator pick names WHICH option. A freeform entry matches none, so its
      -- index is null; requiring one would force a lie.
      and (
        (hook_choice ->> 'source' = 'freeform' and hook_choice -> 'index' = 'null'::jsonb)
        or (hook_choice ->> 'index' ~ '^[0-9]+$' and (hook_choice ->> 'index')::int < 20)
      )
    )
  );

-- The reader asks for creator picks and must not scan every row to find them.
create index if not exists generations_hook_choice_source
  on public.generations ((hook_choice ->> 'source'))
  where hook_choice is not null;

comment on column public.generations.hook_choice is
  'How selected_hook got its value: {"source":"creator"|"default"|"freeform","index":int|null}. '
  '`creator` is the only one that is a preference. `default` is the recommended hook '
  'captured on load so the teleprompter has something to shoot. NULL means the row '
  'predates 0134 — not that no choice was made, and not that one was.';

-- ⚠️ THE CLIENT WRITES THIS, so it needs the same column grant selected_hook has
-- (0014). Without it the update fails loudly rather than silently — but it fails.
grant update (hook_choice) on public.generations to authenticated;
