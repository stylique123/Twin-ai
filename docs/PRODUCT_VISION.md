# TwinAI Creative Studio — Product Vision & UX Principles
_Single source of guidance for the Creative Studio redesign. Practical and buildable — not theory._

---

## 1. Product positioning
TwinAI is **ChatGPT meets CapCut**, not ChatGPT meets Notion. It turns a reference video, product idea, or raw clip into a finished short-form video — fast. The user is **making a video**, never reading a report. Every screen moves them toward a downloadable, publishable clip.

## 2. Core promise
**"From idea to finished short in minutes — TwinAI recommends, you tap, it edits."**
- Smart defaults the moment you arrive.
- One tap to change any recommendation.
- One connected plan that becomes the actual video — no re-deciding the same thing twice.

## 3. Target users
- **Beginners / aspiring** — never edited; want "just make me a good video," simple words, obvious next step.
- **Working & pro creators** — want speed, control, and advanced detail on demand.
- **Founders / B2B & agencies** — want credible output, brand consistency, and volume.
One flow serves all three through **progressive disclosure**: simple by default, powerful when expanded.

## 4. Beginner vs professional needs
| Beginner needs | Professional needs |
|---|---|
| Plain language | Speed + keyboard/efficiency |
| One clear next step | Control over every recommendation |
| Reassurance it's working | Expandable "Advanced" detail |
| Defaults that just work | Override in one tap, no menus |
| No filmmaking jargon | Precise scene-level editing |
**Rule:** never make a beginner read pro detail to proceed; never make a pro click through beginner hand-holding to get control.

## 5. Main UX problems today
1. Flow feels **long and document-like** — reads like a report, not a video tool.
2. **Script, teleprompter, editor, loading, publishing are mixed** on screens.
3. **Mobile breakage** — horizontal overflow, screens that don't fit.
4. **No shared structure** — script, teleprompter, editor, captions each guess their own scenes → duplicate hooks, wrong scene counts, repeated captions, mismatched cuts.
5. **Too much at once** — too many options, theory before action.
6. **Teleprompter shown after editing**, editing options shown during recording — wrong tools for the stage.

## 6. New product principles
1. Feel like making a video, not reading a report.
2. AI recommends by default; user changes in **one tap**.
3. One **primary job + one main CTA** per screen.
4. **Never mix** recording controls with editing settings.
5. **Never** show teleprompter after the final edit; never show retention theory before the user knows what to do.
6. Keep momentum — **don't add steps**; ~5 screens total.
7. Plain creator language, always.
8. Mobile-first, no horizontal overflow, sticky bottom CTA, safe back on every screen (work never lost).

## 7. The reduced 5-screen journey
1. **Create / Remix Input** — paste a link, describe an idea, or upload a clip. One field, one button.
2. **AI Building / Loading** — live, explained steps + skeleton preview of the plan forming.
3. **Video Plan** — hook + script + record choice, shown as a **scene plan**, each with a recommended pick and a one-tap change.
4. **Teleprompter or Upload** — record scene-by-scene, or upload footage mapped to the same scenes.
5. **Editing + Final Review** — auto-edited video from the plan; review, tweak, download, publish.
**Philosophy:** each screen has one job, hands off cleanly to the next, and never re-asks a decision already made. Back is always safe.

## 8. ⭐ Scene Timeline — the single source of truth
**TwinAI must NOT generate separate disconnected outputs for script, teleprompter, editor, captions, B-roll, and publishing.** It generates **one master Scene Timeline**, and every module reads from it. No module independently guesses scene boundaries later.

The Scene Timeline is the single object that drives: Script · Hook · Shot guide · Teleprompter · Recording pauses · Editor cuts · Captions · B-roll placement · Music & effects · Final video · Publishing copy.

**Scene schema (each scene):**
```
{
  scene_number,
  scene_type,        // talking_head | b_roll | screen_recording | product_demo | cta
  purpose,           // plain-language why this scene exists
  dialogue,          // exact spoken words, or null
  duration_sec,
  camera_framing,    // creator language e.g. "Chest-up shot"
  background,        // setting guidance
  movement,          // expression / motion cue
  caption_text,      // what burns on screen for this scene
  broll_instruction, // "Show this while talking", or null
  cut_point,         // clean cut marker at scene end
  transition,        // to next scene
  pause_after,       // teleprompter pause after this scene
  show_in_teleprompter // true for spoken scenes; false for silent B-roll
}
```
**Why it matters:** because all modules share one structure, scene counts, hooks, captions, and cuts can never disagree. The teleprompter pauses where the editor cuts where the captions reset — by construction, not by luck.

## 9. System consistency rules (enforced by the Scene Timeline)
1. If the script has 8 talking scenes + 3 B-roll moments, teleprompter, editor, and captions use that **same** structure.
2. B-roll is **not** a spoken teleprompter scene unless voiceover is attached.
3. The selected hook appears **exactly once** at the start (unless the user opts to repeat).
4. Teleprompter never duplicates the hook.
5. Editor never duplicates captions.
6. Every talking scene ends with a **clean cut marker**.
7. Teleprompter **pauses after each talking scene** and shows "Next Scene."
8. Editor cuts at the **same scene boundary**.
9. Captions reset to scene timing.
10. **No module re-guesses scene boundaries** downstream.

## 10. Recommendation-first AI behavior
Every major choice has **one recommended option, pre-selected**, with **one short plain reason**, and a one-tap change. Recommend: hook · script angle · edit style · caption style · thumbnail frame · platform caption.
> Example: _"Recommended because it starts with a painful money question — works well for brand owners."_
Long explanations live only inside an expandable **Advanced** section.

## 11. Teleprompter principles
- Shows **one scene at a time**; never the whole script as a wall.
- Speed in **WPM presets**, never pixels/sec: **Slow 130 · Natural 150 (recommended) · Fast 165 · Creator 180**.
- After each scene, stop and show: **Scene complete · Next scene name · Estimated seconds · Continue**.
- Controls: Pause · Back · Replay scene · Next scene · Finish recording · Speed · Text size · Mirror · **Exit safely (no lost work)**.
- Only shows scenes where `show_in_teleprompter = true`. **Never shown after the final edit.**

## 12. Editing principles
- The edit is **built from the Scene Timeline** — cuts at `cut_point`, captions from `caption_text`, B-roll at `broll_instruction`, music/effects per scene.
- **Never mixed with recording controls.** Editing is its own stage.
- Recommended edit style pre-applied; every change is one tap (caption style, music on/off, B-roll swap, per-scene punch).
- Plain language: "Fast captions," "Show this while talking," "Change the shot."
- Fail-safe: if any auto step (captions, beat-sync, B-roll) can't run, it degrades gracefully — the video still renders.

## 13. Loading principles
- **Explain what the AI is doing**, don't just spin: "Reading your reference… Writing your hook… Planning 8 scenes… Matching B-roll."
- **Skeleton preview** of the plan forming, **live step updates** to make waiting feel short.
- Never a blank or frozen-looking screen.

## 14. Final review principles
- Feels **complete and calm**, not like the workflow restarted.
- One screen: play the video, see scene-level tweaks, **Download** and **Publish** as the primary actions.
- Tweaks are quiet/secondary; the finished video is the hero.
- Back returns to editing without losing the render.

## 15. Language principles (replace jargon)
| Say this | Not this |
|---|---|
| Chest-up shot | Medium close-up |
| Show this while talking | B-roll insert |
| Change the shot | Pattern interrupt |
| Why people keep watching | Retention pattern |
| Final action | CTA |
| Fast captions | Kinetic captions |
| Tell it quickly | Timeline compression |
| Step-by-step story | Chronological escalation |

## 16. Visual design principles
- **Mobile-first; no horizontal overflow**, ever.
- Large readable cards; clear spacing; soft premium background.
- **Sticky bottom CTA**; one main action per screen; secondary actions visually quieter.
- **Back on every main screen**, work preserved.
- Progress states, skeletons, live updates during loading.

## 17. Things the product must NEVER do
- Generate a giant report or document.
- Add unnecessary steps or endless scrolling.
- Repeat hooks or produce mismatched scene counts.
- Mix teleprompter with editor, or editing options during recording.
- Show teleprompter after the final edit.
- Show advanced retention analysis before the user knows what to do.
- Use confusing filmmaking words or pixels-per-second.
- Show buttons that don't match the current stage.
- Let any module independently re-guess scene boundaries.
- Lose the user's work on Back/Exit.

## 18. Definition of done
The redesign is done when:
1. The full journey is **≤5 screens**, each with one job + one primary CTA.
2. A **single Scene Timeline** drives script, teleprompter, editor, captions, B-roll, music, and publishing copy — verified that scene counts, hooks, and captions never disagree.
3. Hook appears **once**; teleprompter never duplicates it; editor never duplicates captions.
4. Teleprompter shows **one scene at a time** with WPM presets and pause/Next-Scene between scenes; never appears post-edit.
5. Editor cuts at scene boundaries; recording and editing controls are **never on the same screen**.
6. Every major choice has a **pre-selected recommendation + one-line reason + one-tap change**.
7. Loading **explains itself** with live steps + skeleton.
8. Final screen feels **complete**, with Download + Publish primary.
9. **Mobile: zero horizontal overflow**, sticky CTA, safe Back everywhere, no lost work.
10. All copy uses **creator language**, not filmmaking jargon.

---

## Appendix — saved backlog (tracked as tasks #19–22)
- **#19 Auto-upsell:** always-on remixes-left meter + at-80%/at-0 upgrade nudges.
- **#20 Simpler packages:** merge Pro+Studio → 5 named persona-tiers.
- **#21 Enterprise $600–$1,500 + public API:** REST façade over the existing `jobs` queue (API keys, async + webhooks, Edge Function), SSO, licensed music; usage-based overage.
- **#22 Reduce Studio options:** smart defaults + "Advanced ▸" collapse (now folded into this redesign).
