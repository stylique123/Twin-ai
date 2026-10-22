# The canary: the owner's account on the new writer (Fast Path v1, Track B)

**What it is.** One real account (the owner's) gets exactly the path the test and panel accounts get (`trialOn`). Every other real creator is untouched: no new path, no shadow run, no extra cost. Its scripts stay real data (`is_heartbeat` stays false), and each carries `blueprint.canary = true` so the daily report can find them.

**Why not the registry's S2 stage.** S2 also puts every *other* real creator into a silent shadow run (`releaseFlags.ts` `stageFor`), which costs money and is not what the canary needs. The registry's per-component kill switches still apply to the canary.

## Turn it on (owner; after the canary gate and your "go")
1. Find your account's user id: Supabase dashboard → **Authentication** → **Users** → your email → copy **UID**.
2. Supabase dashboard → **Edge Functions** → **Secrets** (or **Settings → Edge Functions → Secrets**) → **Add new secret**:
   - Name `CANARY_ACCOUNT_IDS`, value: the UID from step 1. Save.
3. Make one script on your account. Its saved blueprint should show `"canary": true`.

At most **one** id is accepted. A list of two or more is refused whole (widening the canary is a separate decision).

## Kill switch (instant rollback, any time)
Add or set the secret `CANARY_KILL` to `1`. Your next script uses the old flow. To resume: set `CANARY_KILL` to `0` (or delete it).

## Turn it off for good
Delete the `CANARY_ACCOUNT_IDS` secret.
