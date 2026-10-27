# Owner account setup (Mon 26 Oct, about 45 minutes)

Your own real creator account, set up through the normal onboarding, then your
first scripts on the canary (docs/release/canary.md). Fictional walk-through of
the same path: `packages/shared/src/script/__tests__/canaryOnboardingWalk.test.ts`.

**Before you start, merge (in this order):** #1315 (canary switch), this PR
(it lets the canary through the question panel, check this line, the Using
list and the voice card, which were test-account only), #1316 (feedback panel).
Apply migration `0293_canary_feedback.sql` before step C.

## A. Sign up and get your id (5 min)

1. Open the app, **Sign up** with the email you will use as a creator (not the test account).
2. When the onboarding screen ("Paste your handle…") appears, **stop and leave the tab open.**
3. Supabase dashboard → **Authentication → Users** → your email → copy the **UID**.

## B. Turn the canary on for that id (10 min, includes one redeploy)

The pillars question and the angle panel only show once the web app knows your id,
so do this **before** onboarding.

1. Supabase → **Edge Functions → Secrets** → add `CANARY_ACCOUNT_IDS` = your UID. Make sure `CANARY_KILL` is absent or `0`.
2. Vercel → web project → **Settings → Environment Variables** → add `VITE_CANARY_ACCOUNT_ID` = the same UID (Production). **Redeploy** the web app and wait for it to finish.
3. **Credits.** A new account starts with 30 credits and each script costs 10 (`RECREATION_COST`), so you get 3 scripts. There is no credit button in the app: ask for a top-up of `profiles.credits` on your account before step D if you want more (a one-row update, done by whoever has database access).
4. Reload the onboarding tab.

## C. Onboarding (20 min)

1. **Handle.** Pick your platform, paste your handle. If you have public videos, let it read them (optional; skip if you have none). Confirm or correct "Here's how you sound".
2. **The things your videos cannot tell us.** Answer what you do (pick *Software* for Twin), who it is for, and what you never claim.
3. **Your topics (pillars).** "What are the 2 or 3 things you make videos about?" Enter 2-3 short topics, e.g. *building Twin in public*, *creator tools*, *one-person startup*. (If this box is missing, step B.2 did not take effect: redeploy and reload.)
4. **Stories.** In the story questions, answer 5-10 with REAL stories: what happened, a number or a date, what you do differently now. One story per answer, 1-3 sentences. Skip any that do not apply.
5. **Products.** Confirm *Twin* as your product (name, what it does, price/offer only if true). Add any other product the same way from **Products** later. On a product page import, the **Left out** line lists prices/buttons from other products that scripts will not use: check it is right.
6. Finish. You land on Create.

## D. First Create (10 min)

1. **Create** → pick the mode (Product), the product (Twin), the goal, and the length.
2. **Pick an angle.** Three cards, each with an opening line; one says **Twin's pick**. Pick one.
3. **Questions under it** (at most 3). Answer in one line, or **Skip** (then choose: general version / add one line / another angle). Answers are saved as your own facts and reused next time.
4. **Result.** Check:
   - **Check this line** cards: keep, edit or remove each flagged line.
   - The **general-version banner** if you skipped a needed answer; **Make it yours** takes you back to add a story or answer.
   - The **Using** list: what the script used. Remove an item from this script, or "never use".
5. **Feedback panel** (canary scripts only): rating 1-10, paste the script as you used it, posted yes/no + link, a note. Save.

## If something is wrong

Set the secret `CANARY_KILL` = `1`: your next script uses the old flow. `VITE_CANARY_KILL=1` (plus redeploy) hides the screens.
Write down what broke and the result page URL.
