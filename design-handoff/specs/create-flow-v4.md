# Create Flow: Design Spec v4 (with the owner's later changes)

**Read section A first.** The owner changed some things after writing the spec. Where section A and section B disagree, **section A wins.** The boards `boards/Create.dc.html` and `boards/MCreate.dc.html` already show section A.

---

## A. Changes made after the spec (these win)

1. **Gallery tab: no setup panel.** The Gallery tab shows only the grid. Tapping a video switches to the **"A video I liked"** tab with that video's link filled in and already read ("What Twin found" shows straight away). A small line under the link says "Picked from the Gallery · Pick a different one". (This replaces spec part 2.6 "opens … in a panel".)
2. **The product picker is a list, not chips and "More…".** There's no "More…" button and no "Your business / Your products" labels.
   - The **business itself** sits on top as one row: "Maya's Coffee · The whole business · 5 things".
   - Under it, indented with a thin line, comes **"Or one thing it sells"**: her products as rows (2 columns on desktop, 1 on phone).
   - Then **"Or something you promote for another brand"**: affiliate and sponsored items, with their AFFILIATE or SPONSORED tag.
   - Then **"No product, just me talking"** (hidden in Product mode) and **"+ Add a product"**.
   - Each row has a round radio on the right, plus the "what Twin knows" line (amber when something is missing).
   - **"+ Add a product"** opens a pop-up (a bottom sheet on phone) with these fields: Name, What it is in one line, Price, Link (optional), and "Whose is it?" with two options: "It's mine. I make or sell it." / "I promote it for someone else." Picking the second shows Brand and Deal fields. "Add and use it" saves the product and selects it.
   - **"Edit what Twin knows"** (link at the top right of the section) opens the side panel from the spec.
   (This replaces spec part 2.2's chips and "More" pop-up.)
3. **What to take: plain and functional, no colored bars.**
   - The three options are plain radio rows: title, one line, and "Copies 1 of 4 / 2 of 4 / 4 of 4".
   - No colored part bars, on the cards or in the "What Twin found" panel.
   - Once an option is picked, a link shows: **"See exactly what Twin takes, or change it →"**. It opens a pop-up (a bottom sheet on phone) titled "What Twin takes from their video". It has 4 rows (the opening, the order of ideas, the pace, the closing move). Each row shows **Theirs:** … / **Yours:** … and an on/off switch. At least one must stay on. A "Done" button closes it.
4. **Length in Reference mode** is "Same as theirs · 34s, 60s, 90s". There's no 30s option when the reference is 34s.
5. **Recap bar on the angle screen**: one short line, "Maya's Coffee · Signature Blend · New or back in stock · 60s", then "Change: Product · What it's for · Length".
6. **The general-version caution** (the spec addendum) is built in the board. In the design, the Result banner and "Make it yours" appear at the end of Wait 2. In code they belong on the **Result screen** (`/result/:id`). There's already a `GeneralVersionBanner` component; check it first.

Decisions the owner took for spec Part 10: "What's it for?" is **optional** in Idea mode. "Use my last choices" is **included**. The "Twin's pick" badge **stays**. Voice (mic) is **approved**. The Gallery **stays as a tab**, but it jumps to "A video I liked" (see A1).

---

## B. The original spec (v4)

**Use fictional names in every frame** (Maya's Coffee, @brewbyjo, Northfield Gooseneck Kettle). **Write all screen text in plain, everyday words.**

### Part 0: What's required in each mode

| | Product mode | Idea mode | Reference mode | Gallery mode |
|---|---|---|---|---|
| Main input | A product or the business (**required**) | The idea (**required**) | The video link (**required**) | A picked video (**required**). It now jumps to Reference, see A1 |
| What's it for? | **Required** | **Optional** (if skipped, Twin decides) | n/a: "What to take" (**required**) | Same as Reference |
| Product | The main choice | Optional | Optional | Optional |
| Length | **Required** | **Required** | **Required** | **Required** |

- Nothing is pre-selected. Continue stays grey until every required choice is made. The summary bar says what's still needed.
- A product chosen in Idea, Reference or Gallery is a **mention**. It never turns on selling rules by itself. In Product mode it is the subject.

### Part 1: The flow
```
1. Create screen   every choice on one screen
      ↓ Continue
WAIT 1 Reading     real steps
      ↓
2. Angle screen    3 angle cards; a panel opens under the picked one (A question / B ready / C before we start)
      ↓ Write it
WAIT 2 Making      real steps + practice viewers
      ↓
3. Result
```

### Part 2: Create screen
**Layout, top to bottom, in every mode:** title "What are we making today?" + mode tabs → main input → "What's it for?" (or "What to take") → product section → length → "↺ Use my last choices" link → summary bar + Continue → footer line "Nothing is used until you pick a direction."

**Product mode, "What's it for?" options**
- For a product: Launch it · New or back in stock · Explain what it does · The part people get wrong · Get people to try it · Interest now, buying later · Answer what people keep asking · Turn a message into a video · Why I made it · The story behind it.
- For the business: Why I started · The part people get wrong · Announce something.
- If she changes the subject and the chosen option no longer applies, clear it and say so in a small message.
- Length: 30 · 60 · 90.

**Idea mode**
- A big box ("Say it however it comes out.") with a mic button.
- What's it for? (optional): Tell a story · Teach something · Answer a question · Show how I do it · Something fun · Promote something I sell · Let Twin decide.
- Product (optional), then Length (required).
- Below: "No idea yet? Start from one of these", with three tabs (From your account · Happening now · Working in your niche). Each idea card shows where it came from. Idea titles are topics, never an event that may not have happened.

**Reference mode**
- Link box, then the "What Twin found in this video" panel (thumbnail, handle · 34 seconds · views, title; reading steps "Got the video / Heard what they say / Finding how it's built"; HOW IT'S BUILT vs WHAT YOU'D NEED; "Twin takes how it's built. Every word is yours.").
- Everything below the link is greyed out until the video is read.
- Failures: can't open · private · no one speaks (no override) · not supported. Each offers "Try another link" and "Pick from the Gallery".
- A note if the video's length doesn't fit her chosen length. An option that can't work is greyed out with a reason.

**If she changes things later:** the angle screen's recap bar has Change links. Changing one refreshes only what depends on it, keeps what she typed if it still fits, and shows a small confirmation ("Updated for a restock video").

### Part 3: Wait 1, Reading
Show real steps, not a fake progress bar. In the design, a logo ring with a percentage sits in the center and the steps sit under it.

| Mode | Steps |
|---|---|
| Product | Looking at Signature Blend → "Found 6 things Twin can say" · Checking what's confirmed → "4 confirmed, 1 needs your yes" · Working out what this video needs · Getting three directions ready |
| Idea | Reading your idea → "Reading this as: your story" · Finding what you've told Twin about this → "Found 2 stories" · Getting three directions ready |
| Reference / Gallery | Matching it to what you know → "Found 3 things you can say" · Getting three directions ready |

- Skip the screen if the work is already done.
- Each finished step stays visible for about half a second.
- Slow state: "This is taking longer than usual." with Keep waiting · Try again · Go back. She can leave; her place is saved.

### Part 4 and 5: Angle screen and the angle card
- Recap bar (see A5), "Pick a direction", three cards (stacked on phone, side by side on desktop), and a "Let Twin pick" link.
- **The card, top to bottom:** type label (small capitals) + badge ("Twin's pick", never pre-selected; or "Needs a moment" in amber) → title (max 10 words) → "Feels: …" → a box "THE VIDEO OPENS LIKE THIS" holding a quoted sample line + a source tag ("from your story", "from your comment", "a question about your topic") → "Uses:" chips (max 3) → "Needs:" chips (max 2) or "✓ nothing more".
- **The 8 types:** Tell the moment (personal and warm) · Bust a myth (confident, a little surprising) · Show it working (hands-on, proof) · Answer the question (helpful and direct) · Make the offer (clear and direct) · Take a stand (bold) · Behind the scenes (curious, honest) · Before and after (satisfying).
- **Copy rules:**
  1. No jargon ("hook", "beat", "spine", "arc").
  2. The opening line must come from something she actually said, or be a plain question using only her topic words. If she gave nothing, write "The video opens with a question about [topic]" with no quoted line.
  3. Never invent an event, number, feeling or person.
  4. The three cards must feel different.
  5. At least one card needs no personal story.
- **Card states:** default · hover · selected (coral border, light coral fill, check mark, the others dimmed) · Twin's pick · Needs a moment · loading (skeleton) · refreshing (shimmer) · thin material (2 cards + note "You haven't told Twin much about this yet. These need no personal story.") · none fit (1 card "A short, honest video" + a note).

### Part 6: The panel under the picked angle (a bottom sheet on phone)
Priority: **C first, then A, then B.** Under every panel there's one line: "Using: N things · See all".
- **A, a question:** "ONE QUESTION", the question (25 words max, never assumes something happened), "Why I'm asking: …", "Use a story I told before ▾", a type box with a mic, "Nothing like that happened" (a real answer, never asked again), Skip. At most one question.
- **B, Ready:** "Twin has what it needs." What Twin will use, grouped **From you** (each with ✕ to leave it out of this video) and **Heard in your videos, needs your OK** (switches that start **off**). Footnote: "✕ leaves it out of this video only. To never use something, go to My Twin."
- **C, Before we start:** product basics are missing ("Twin doesn't know what X is yet": one line + Size / Price / How people use it), or facts disagree ("Two origins on file. Which is right?"). Also offers "or make this video about my business instead". **Write it** stays grey until it's fixed.
- Tapping a different angle updates the panel with a short shimmer. Write it with an unanswered question counts as **Skip** (see the addendum).

### Part 7: Wait 2, Making the script
- **Steps:**
  1. Planning the video around your angle
  2. Writing the script
  3. Checking nothing is made up → "All lines come from what you've told Twin" or "Took out 1 line Twin couldn't back up"
  4. Testing the openings with the practice viewers
  5. Fixing weak lines
  6. Building your shots and teleprompter
- **Practice viewers panel:**
  - Groups: Buyers 4 · The curious 3 · Skeptics 2 · Fellow makers 1.
  - Bars for Opening 1 and Opening 2 ("6 of 10 would stop", "← best so far").
  - "Viewers asked: 'Which gear do you use?' → saved to ask you after".
  - "Twin fixed line 3. Before 5 of 10 → After 7 of 10", shown **only** if it really scored higher.
  - "A practice audience, not a promise."
- **Numbers must be real. Never fake them.**
- **Buttons and states:**
  - **Show me the draft:** the early draft, with the banner "Not tested by viewers yet".
  - **Stop and keep my answers.**
  - **Slow:** Keep waiting · Try again · Save and tell me when it's done.
  - **Viewer test fails:** the script still appears, labeled "Not tested by viewers".
  - **She leaves:** it keeps going, and a card on Create says "Making: …".

### Part 8: Edge cases
| Situation | What she sees |
|---|---|
| Idea is "?" or very short | "Say a little more. What's this video about?" Continue stays grey |
| Two products named | "Which one is this about?" (pick one) |
| A product named that isn't hers | Offer to write about it as a recommendation, or No product |
| No products yet | "+ Add your first product" |
| No speech in the reference | "No one speaks in this video, so Twin can't copy it." No override |
| Free videos used up | Continue stays grey + "See plans" note |
| Lost connection | "Your place is saved." + Retry |

### Part 9: Responsive and access
- **Widths:** wide (1440), tablet (~768) and phone (390).
- **Phone layout:**
  - Continue is a sticky bar at the bottom.
  - Panels and pop-ups are bottom sheets.
  - Long chip rows scroll sideways.
- **Access:**
  - Tap targets are at least 44px.
  - Check contrast of grey text on dark cards.
  - Step changes are announced to screen readers (`aria-live`).
  - Respect "reduce motion".

### Addendum: when she skips a question (the "general version" caution)
- **When it shows:** after **Skip**, or **Write it** with the question unanswered. It does **not** show for "Nothing like that happened".
- **How it looks:** a small inline card inside Panel A, not a modal. It replaces the answer boxes.
  - Info icon (not a warning triangle), muted amber (no red), two lines of text at most.
  - The first skip in a session shows the full card. Later skips show a one-line version with the same buttons.
- **Buttons:**
  - **Add one line:** back to the question; what she typed is kept.
  - **Pick an angle that needs no story:** shows only those angles, with a "Show all" link.
  - **Write the general one:** writes it.
- **Three versions.** The server says which one fits this angle:

| Twin can… | Heading | Body | Write button |
|---|---|---|---|
| write a short honest video from her facts | "Without your story, this will be a general version" | "Twin will write a shorter video with no personal story, and say what's missing." | "Write the general one" |
| only write an outline (e.g. Tell the moment) | "This kind of video needs your moment" | "Twin can only write the outline. You'd tell the key part in your own words on camera." | "Write the outline" |
| almost nothing | "Twin doesn't have enough for this one yet" | "Add one line, or pick a different angle." | none |

- Never write "stories" in the caution. Twin does not make up stories.
- **On the Result screen:** a banner "General version: no personal story. Add a moment to make it yours." plus a **Make it yours** box (type / say it / use a saved story). It re-writes the same video. The "where each line came from" panel shows no personal-story lines.
