-- A PROBE WHOSE ANSWER NOBODY CAN READ IS A PROBE THAT DOES NOT EXIST.
--
-- ⚠️ 0143's SIBLING SHIPPED WITH THIS EXACT DEFECT, WRITTEN BY THE SAME HAND.
-- `downloaderProbe` was built to answer one question — does THIS CONTAINER have
-- working impersonation, or is `curl-cffi` declared and ineffective — precisely
-- because nobody could get a shell on the VPS to check. It writes its answer to
-- stdout. On the VPS. Which is the one place the person asking cannot look.
--
-- ⚖️ SO THE ANSWER GOES WHERE THE QUESTION IS ASKED FROM. `worker_heartbeat`
-- already exists, is already written every loop, and is already the one row that
-- proves a worker is alive; what a worker can DO belongs beside whether it is
-- running. One row per worker, overwritten each boot — this is current state,
-- not history, and a table of every boot's capabilities would be a log with a
-- primary key.
alter table public.worker_heartbeat
  add column if not exists downloader jsonb;

comment on column public.worker_heartbeat.downloader is
  'What the RUNNING CONTAINER can actually do, measured at boot rather than inferred from requirements.txt. Null means a worker that predates the probe. `{"tiktokReadable": false}` is the state that explains a wave of TikTok failures, and it is readable without a shell — which is the whole reason the column exists.';
