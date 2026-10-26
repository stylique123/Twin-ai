# Going private: the checklist (target Sat 24 Oct)

For the owner. Plain clicks. About 20 minutes. Do the **checks first**; only flip when every check says GO.

What I verified on Fri 23 Oct: the repo is public, it has **0 forks, 0 stars, 0 watchers** (good: no public copies to chase), **0 self-hosted runners**, and **no `CI_RUNNER` variable**. Every one of the 30 CI jobs is written to use the self-hosted runner only when the repo is private **and** `CI_RUNNER` is set; otherwise it uses GitHub's hosted machines. So the day the repo goes private, all CI runs on GitHub's paid minutes. That is the one thing that can stop work, so it is check 1.

---

## Part 1: four checks (GO / NO-GO)

### Check 1 — Your GitHub plan keeps the safety rules working (most important)
On the **free** plan, a **private** repo loses its rulesets and branch protection: the required checks would silently stop being enforced, and pushes straight to `main` would no longer be blocked. On **Pro** (about $4 a month) they keep working.
1. Click your profile picture (top right) → **Settings**.
2. Left side → **Billing and plans** → **Plans and usage**.
3. Read the plan name.
   - **Pro, Team or Enterprise → GO.**
   - **Free → upgrade to Pro first** (same page, "Upgrade"), then GO.

### Check 2 — CI minutes and a spending limit
About 200+ CI runs happen in a week. Private repos use paid minutes after the monthly free allowance.
1. Same page (**Billing and plans**) → **Spending limits** (or **Budgets and alerts**).
2. Set a budget for **Actions**, for example **$20 a month**, with an email alert at 75%.
   - If the budget is reached, CI stops and PRs cannot merge until next month or until you raise it. You will get an email first.
3. **GO** once a budget with an alert exists.

(Later, optional: a self-hosted runner on the separate server makes CI free again. Not needed for Saturday.)

### Check 3 — A fresh backup, taken just before the flip
On the Mac, in Terminal:
```
cd ~/Desktop
git clone --mirror https://github.com/stylique123/Twin-ai.git Twin-ai-backup-24oct.git
```
Then move `Twin-ai-backup-24oct.git` into your private document store. **GO** when it is there.

### Check 4 — No paid run in progress
1. Open the repo → **Actions** tab.
2. Look at the top of the list. If anything shows a yellow dot (running), wait until it finishes.
3. **GO** when nothing is running.

---

## Part 2: the flip

1. Open **github.com/stylique123/Twin-ai**.
2. Click **Settings** (the gear tab, top of the repo).
3. Scroll to the very bottom, the red **Danger Zone**.
4. Click **Change repository visibility** → **Change to private**.
5. Read the warning, click through it, and type `stylique123/Twin-ai` when asked. Confirm.

---

## Part 3: right after the flip (5 minutes)

1. **Confirm it is private:** open the repo; under the name it should say **Private**. Open the same address in a private (incognito) browser window: it should say **404**.
2. **Rulesets still on:** Settings → **Rules** → **Rulesets**. The `main` ruleset should still show **Active**. (If it says it is not enforced, you are on the free plan: go back to Check 1.)
3. **Secret scanning:** Settings → **Code security**. On a private repo without GitHub's paid security add-on, "push protection" may switch off. That is expected and acceptable now that the repo is private; note it, nothing to do.
4. **CI still runs:** open any open PR (for example #1312) → **Checks**. Within a few minutes new runs should start. If they stay "Queued" for more than 15 minutes, tell me.
5. **Tell me "private done".** I then re-check that the staging test (it proves its identity by repository name, which does not change) still answers, and I update the plan.

---

## What going private does NOT undo
- Anyone who copied or downloaded the code while it was public keeps that copy. With 0 forks recorded this is a small risk, but it is not zero.
- The git history still holds the earlier real stories. A history rewrite is a separate decision (yours, with the advisor); nothing here does it.

## If something goes wrong
Going private is reversible: Settings → Danger Zone → **Change to public**. The backup from Check 3 is the safety net for everything else.

---

## Also today (2 minutes): confirm the 3 Reddit rows are gone

Supabase dashboard → your production project → **SQL Editor** → **New query** → paste, then **Run**:
```sql
select count(*) as left_over
from public.niche_reddit
where researched_at >= '2026-10-17' and researched_at < '2026-10-19';
```
- **`left_over` = 0 → done.** Tell me "Reddit 0" and I mark Track C complete.
- **More than 0 →** the delete has not run yet: run the reviewed SELECT (expect exactly 3 rows), then the reviewed DELETE, then this query again.

This reads counts only; it shows no post text.
