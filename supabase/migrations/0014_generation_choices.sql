-- Let the creator drive the back half of the loop from the blueprint:
--   selected_hook  — which of the 5 generated hooks they will actually shoot,
--                    so the teleprompter, cover and b-roll all use THAT hook.
--   edit_style     — the auto-edit look they want (e.g. punchy | clean | cinematic).
-- Both are presentation choices the owner may update on their own rows; column
-- grants keep them from touching blueprint/credits via the same policy.
alter table generations add column if not exists selected_hook text;
alter table generations add column if not exists edit_style text;

drop policy if exists "own generations update" on generations;
create policy "own generations update" on generations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke update on generations from authenticated;
grant update (selected_hook, edit_style) on generations to authenticated;
