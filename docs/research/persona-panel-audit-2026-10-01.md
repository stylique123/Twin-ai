# Persona / audience-testing system: audit and fixes

This responds to the owner brief "The Persona/Audience-Testing System — Audit and Fixes". All numbers come from production on 2026-10-01.

## 1. Audit, before changing anything

| Question (brief Part 2) | Finding |
|---|---|
| **Who are the 10?** | 49 panels exist across 41 creators, always 10 personas each. Each persona is built from her DNA plus her 50 most recent posts with their plays and likes. They are genuinely different from one another. For the coffee account they were: Aspiring Coffee Cart Founder, Mobile Business Sceptic, Home Barista Tinkerer, Relatable Mishap Watcher, Bean Buyer, Small Business Peer, Specialty Coffee Sceptic, Gift Shopper, Fast Scroller, Window Shopper. None of this was ever shown to the creator. |
| **Does the mix change with the video's purpose?** | **No.** The same 10 personas are used for every video. |
| **Static or updated?** | They are updated. A panel is rebuilt when it is 7 days old or when she has 5 or more new posts. |
| **Is 10 enough?** | 10 is a fixed number with no stated reason behind it. It is kept for now. See "Not changed" below. |
| **Why do out-of-scope asks appear ("business numbers" on a roasting video)?** | **Confirmed.** The panel is her whole audience across every kind of video she makes. The coffee panel includes a cart founder and a business sceptic, so a craft video got business questions from them. |
| **What is a persona judging?** | Three things, judged separately: whether each hook would stop them (`would_stop`), the line where they would scroll away (`leaves_at`), and a comment question. |
| **Diagnosis shipped without action** | Of 172 tests, about 3% ended with a rewritten line. "Unanswered question" was flagged 83 times, backed by about 5 of 10 viewers each time. It cannot be fixed by rewriting, because it needs a fact only she has. The rewriter is correctly forbidden to invent that fact, so the script shipped unchanged. |
| **Hook count 4–16** | 156 tests had 4–5 hooks. Rewrite rounds added 3 hooks each, so 8 tests reached 13–14. |
| **Invented specificity rewarded** | Viewers saw only her product facts, not her stated knowledge, so they had no way to tell a real detail from an invented one. |
| **Only negatives** | The test output had fixes only. There was no "what worked" field. |

## 2. What was built

- **C. Diagnosis becomes a question (first priority).**
  - The panel returns `needs_her`: up to 2 plain questions about a fact only she can give, each tied to the line it belongs in.
  - The script page shows them under "Before you film: only you know this", with an answer box.
  - Her answer is saved as her own stated fact through the `answer_panel_question` RPC.
  - The worker (`runPanelAnswers`) then writes it into that line. The rewrite may only use her words: no other new number or name is allowed, and the privacy guard still applies.
- **B. Scoped to the video.**
  - Each persona now records which kinds of her videos it watches: product, coach/expert, educator, community or entertainer.
  - The test receives the script's family (from the hook-family work) and that family's real-video shape.
  - Every viewer says whether they would watch this kind of video. Those who wouldn't are left out of the score, provided at least 6 remain.
  - Fixes may not ask for content that belongs to another kind of video.
- **Personas built from real niche data.** Panels (v2) now also read her niche's real high-reach videos and the objections viewers raise in her niche, using the same "brain" the writer uses. Every existing panel will rebuild once.
- **A. Visible.**
  - "Who your 10 test viewers are" lists each persona with a type (Loyal fan, Buyer, Sceptic, New viewer, Learner, Peer) and a one-line description.
  - The page says when viewers were left out because they only watch her other kinds of videos.
- **D. Genuine vs invented.**
  - Viewers now receive her verified facts: up to 40 stated or demonstrated items from `creator_knowledge`, not marked private and not switched off.
  - A specific detail that those facts don't back gets no credit. It is listed in `unverified`, and the page shows it in red with "keep it only if it is true".
  - This is not a second fact system. It reads the same store as the writer's fact guards and only adds a scoring rule.
- **Hook cap.** 5 hooks are shown and at most 9 are tested: 5 written, plus 2 rewrite rounds of 2. This replaces 4 shown and up to 14 tested.
- **Positive signal and learning.**
  - `working` gives up to 3 things that landed and why, shown under "What's working".
  - These now become lessons, like the complaints already did, so the next script repeats what worked.
  - Successful rewrites were already recorded in `improved`.

## 3. Not changed, on purpose

- **Panel size stays 10.** Tying it to the amount of post data needs a measured comparison first.
- **The script is still shown while the test runs.** Holding it back would add about 1–3 minutes to every generation. Instead, the questions and fixes appear on the same page as soon as the test finishes, and answers are written into the script after that.

## 4. Success, measured on every test from now on

The `audience_test` event now logs `out_of_scope`, `needs_her`, `unverified`, `working` and `closed_hooks`. `panel_answer_applied` logs each answer that was written into a script.

The owner's five success criteria map to:
1. Panel shown in plain words.
2. Questions asked before filming.
3. Out-of-type viewers excluded from the score.
4. No credit for unverified details.
5. A 5-hook cap.

Each one is visible on the page and recorded in its own field.
