-- On-demand AI thumbnail: the generate-thumbnail edge function renders a cover
-- image from the blueprint's packaging brief and stores it in the private `edits`
-- bucket. This column holds that storage path so the plan can re-show the image
-- without regenerating (and paying) on every visit. Written by the service role
-- only; the client just reads it under the existing owner RLS select policy.
alter table public.generations add column if not exists ai_thumb_path text;
