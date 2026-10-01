# What a successful script is, by creator type: research and plan

Brief: "What a Successful Script Actually Is, By Niche" (owner, 2026-10-01).

Status: research done (4.1, 4.2), plan written (4.3). **No code has been written. Awaiting review.**

---

## 4.1 The audit against the real code: confirmed

| Brief's claim (Part 2) | What the code does | Verdict |
|---|---|---|
| 1. No product-vs-coach hook distinction | One prompt generates hooks for every creator (`generate-blueprint/index.ts` HOOKS section, ~5694–5722). Niche only selects which vocabulary, brain notes and gallery examples get injected. Goal changes a "shape" directive (`purposeShape.ts`) and some goal/focus wording. Nothing selects a hook family or a beat structure. There is no `creator_type` field anywhere. | **Confirmed** |
| 2. No open-vs-closed curiosity-gap rule | "Curiosity gap" is one of four optional triggers to stack. Nothing requires the hook to withhold its answer. | **Confirmed** |
| 3. No per-beat word discipline | Only the hook is enforced (`hookContract.ts`: target 12, max 14). Beats get a prompt hint ("2 to 4 sentences"). | **Confirmed** |
| 4. Resolution not checked | Only one hook-to-body contract exists in code: a numbered hook must deliver that many items. Nothing checks that the ending closes what the hook opened. | **Confirmed** |
| 5. Hook sets not structurally distinct | `hookVariety.ts` only flags when 3 or more hooks share the same first 3 words, and it only adds a note. | **Confirmed** |
| 6. No niche-specific hook vocabulary | The brain notes are prompt context only. The fallback when a creator has no hook patterns is the same five moves for everyone ("contrarian claim, number drop, confession, direct callout, curiosity gap"). | **Confirmed** |

**Twin's real output (latest hook sets from 8 accounts).** The same shape appears regardless of creator:

- Postpartum coach: "Stop relying on waist wraps…", "A postpartum belly band will not heal your deep core" (closed: the answer is in the hook).
- Dog-bandana seller: "Stop putting stiff iron on vinyl on your dog", "Most people think these dog names are just ironed on".
- Coffee roaster: "The biggest lie about micro roasting is inconsistency", "Small batch does not mean accepting inconsistent coffee" (closed).
- Bible rebinder: "Leaving factory end sheets intact saves your entire Bible spine" (closed).

Contrarian or "stop doing X" hooks dominate for product sellers too. Across all of them, hooks that reveal something to watch are nearly absent.

## 4.2 Real examples: 87 high-reach short-form videos, hand-read

**Source.** Twin's own corpus: 6,535 scraped and labelled videos (`corpus_reads` + `gallery_items` + `reference_transcripts`). Families were derived from the stored mode/goal labels. For each family, the top 20 by reach that have a usable English transcript were each read against one rubric. The rubric covers:
- gap (open, closed or none);
- hook family and stacked triggers;
- word counts per beat;
- whether the ending resolves the hook;
- ending type.

**Correction made during the research.** Ranking by raw reach first pulled long-form YouTube (TED talks, kids' channels) into the coach, educator and entertainer samples. Those were discarded and re-read on TikTok and Instagram only. The run-1 notes are kept out of the repo.

**First, the existing labels are too coarse.** The stored `hook_type` is "bold claim" for 42–73% of every family, so it cannot tell a coach hook from a product hook. That is one reason the corpus has not shaped hook choice.

| | Product seller | Coach / expert | Educator | Community | Entertainer |
|---|---|---|---|---|---|
| Videos read | 20 | 19 | 18 | 17 | 13 |
| **Open gap** | 70% | 74% | 78% | 59% | 77% |
| Closed gap | 25% | 16% | 11% | 18% | 8% |
| Median hook words | 13.5 | 13 | 12.5 | 12 | 10 |
| Hooks stacking ≥2 triggers | 75% | 84% | 72% | 65% | 31% |
| Ending resolves the hook (yes) | 65% | 84% | 72% | 53% | 54% |
| Median total words | 145 | 182 | 122 | 290 | 186 |

### Leading hook families, with real examples

**Product seller**
- Visual or sensory reveal plus a superlative verdict ("This might be the most unique bookmark I've ever seen."; "This is exactly what I'd want in a voice recorder."). The demo answers the "why?".
- Social proof as someone else's result ("This woman came up with a genius business idea.").
- Direct callout to the buyer's situation ("If this is the year you finally want to start sewing your own clothes but you have no idea where to start…").
- Myth-buster: 1 in 20.

**Coach / expert**
- A list promise with a stakes number ("Five service businesses a 22-year-old could start with five grand and make 200 grand a year"; "Never, ever start a business before you understand these five things").
- A contrarian imperative ("Stop creating content, start creating culture."; "You don't get rich by working for someone else.").
- Insider credential ("Tips HR will never tell you"; "From my professional opinion, none of them are genuine").

**Educator**
- A question the body answers straight away ("What really happens if your timing belt snaps while you're driving?").
- Borrowed authority ("…from a millionaire businessman").
- For craft how-tos, opening mid-step on the visual ("First, fill three balloons with wet concrete…").

**Community**
- First-person founder or life confession ("At 13, I started a business that changed my life…"; "I'm starting a business and I have no idea what I'm doing").
- A statement of belief.
- A numbered list of shared experience ("26 more things I love about being single and living alone").
- Endings are a lesson or none, rarely a CTA.

**Entertainer**
- Cold open inside the scene ("Hey, um, who said you could have your phone?").
- A day count or dollar figure as the entire hook ("Day 17 collecting copper until I can buy a car").
- Ends on a punchline. Triggers are rarely stacked.

### What the real data supports and contradicts in the brief's Part 1

- **Supported: open gap (1.2).** Open is the large majority in every family. It is a universal rule, not a per-family one. Twin's closed hooks ("…will not heal your deep core") go against it.
- **Supported, with a correction, for hook length (1.4).** The median real hook is 10–13.5 words, not ~10. Twin's 12 target / 14 max is right. A shorter limit is not justified.
- **Contradicted: the 10/25/30/15 beat split (1.4).** Real videos mostly **skip the problem beat**. Setup was 0–15 words in most videos, and the body carried about 70–85% of the words. Building that budget in would make Twin's scripts less like what performs.
- **Supported: stacking (1.7).** About 3 in 4 hooks stack two or more triggers, except entertainment, where the scene itself does the work.
- **Supported, with nuance, for resolution (1.6).** Most videos close the hook's loop. The close is often a lesson recap, a punchline or nothing, not a CTA. Coaches resolve most consistently (84%).
- **Partly supported: authority by family (1.3, 1.5).**
  - Coaches and educators lean on list promises, contrarian imperatives and credentials. Pure "myth-buster" phrasing is less common than the brief expects.
  - Product sellers lean on **something to watch** plus a verdict or proof.
  - The "1.8x more comments" figure could not be checked: the corpus has no comment counts.

**Limits.** Each family has about 20 videos. The family labels come from an earlier LLM pass. Transcripts were cut at 1,800 characters, which hides some endings. Reach across platforms is not comparable. These numbers set direction for the plan. They are not exact rates.

---

## 4.3 Plan: proposed, not built

### A. Classify each script into a family, per video, not per creator

The same creator can sell one day and teach the next. So the family is chosen per script from signals Twin already has, and it is shown on the page with a one-tap override.

| Family | Rule, in order (first match wins) |
|---|---|
| product | a product is picked **and** goal is sell or leads |
| coach_expert | goal is authority or leads, or focus is expertise **and** her offer is a service, course or coaching |
| educator | goal is educate, or focus is expertise with no offer |
| community | goal is community, conversations, personal_brand or inspire, or focus is story or experience |
| entertainer | goal is entertain |

If nothing matches, use her dominant DNA mode (`corpus_reads`-style mode of her own scraped videos). The function is shared code (`packages/shared/src/script/creatorFamily.ts`), unit-tested on the 8 real accounts above.

### B. A hook playbook per family, grounded in real examples

`packages/shared/src/script/hookPlaybook.ts` gives each family:
- 3–4 named hook families from 4.2 (for example, product: `visual_reveal_verdict`, `social_proof_result`, `buyer_callout`, `list_promise`);
- 2 verbatim real examples for each, taken from the corpus.

The writer's HOOKS section uses the playbook for the script's family. It replaces the one-size fallback list and still takes her own DNA hook patterns first. The schema adds `hook_families: string[]`, one per hook, so the code can check it.

### C. Universal hook rules, checked in code, not only prompted

1. **Open gap.** A hook must not state its own conclusion. A cheap check flags declarative "X does/will not Y" verdicts. The audience test already in the worker gets one extra judgement ("did it answer itself?"). A closed hook is demoted, not deleted.
2. **Distinct set.** The 5 hooks must cover at least 3 different hook families from the playbook. This replaces the first-three-words check as the real distinctness test.
3. **Stacking.** At least 2 triggers per hook is kept, except for the entertainer family.
4. Length stays 12 target / 14 max, which the real data supports.

### D. Structure per family

| Family | Beat shape |
|---|---|
| product | hook (reveal or verdict) → **show it** (body ~70%) → specific reason → where to get it |
| coach_expert | hook (list, contrarian or credential) → numbered points that deliver exactly the promised count → lesson recap or soft offer |
| educator | question hook → answer immediately → steps → recap |
| community | first-person confession or belief → the story → what it meant → invite replies, not a sales CTA |
| entertainer | cold open in the scene → escalation → punchline. No CTA by default. |

**Word discipline, per the real data.**
- Setup is optional and capped at about 15% of words.
- The body carries most of the script.
- The ending is capped at about 15%.
- Each beat gets a word ceiling derived from the target duration (the existing timing math), and a beat over its ceiling is flagged on the page. This addresses the 30.8 s vs 12 s beat.

### E. Resolution check

The schema adds `hook_promise`: one line saying what the hook opened.
- Code checks that a non-CTA beat before the ask pays it off: the promised count, the named story, or the asked question.
- The audience test judges "was the promise kept?".
- An unkept promise is shown on the page.
- The shown-script scorecard gains `promiseKept`.

### F. Integration: upstream of what already works

Classification (A) and the playbook (B) choose **which kinds** of hooks get written. The worker's audience test (already confirmed working) still tests and rewrites them, and orders them best first. Rewrites must keep the hook's family so the set stays distinct. Nothing in the fact guards, ownership guards or shown-script work changes.

### G. Keep the playbooks fed by data

The corpus reader (`worker/src/nicheBrain/reader.ts`) adds `gap` and the new `hook_family` labels to each read. A monthly job recomputes the top patterns per family, so the playbooks track what is working instead of staying frozen.

### Order of work, each one shippable alone

1. A + C.1 + scorecard fields: classification, open-gap check, measurement only.
2. B + C.2: playbooks and the distinct-set rule.
3. D + E: structure, beat ceilings and the resolution check.
4. G: corpus re-labelling.

## 4.4 Success test, defined before building

- **Accounts:** postpartum coach (`7eb1549f…`, coach_expert) and dog-bandana seller (`8940bed4…`, product).
- **Objective:** the same for both (goal sell, its own product or offer).
- **Measured on 3 runs each:**
  1. Hook-family overlap between the two accounts' sets: **≤ 1 shared family out of 5**. Today it is effectively all shared.
  2. **≥ 4 of 5 hooks open-gap.**
  3. Product sets include **≥ 1 visual-reveal or verdict hook**. Coach sets include **≥ 1 list promise with a count** whose body delivers the count.
  4. `promiseKept` is true on every finished script.

The same measurements are logged on every real script afterwards, so this keeps being checked after launch.
