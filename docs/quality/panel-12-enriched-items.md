# Panel 12: enriched fixture items

Lists every item appended to `scripts/ops/fixtures/fictional-panel.json` by the richer-fixtures change (PR #1323), so the blind package can name them. All of it is fictional test data.

## Read this before using panel 12 results

- **Panel 12 is an A-vs-B comparison only** (same panel, original fixtures vs enriched fixtures). Its scores are not comparable with panels 5–11, which ran on the original fixtures.
- **The new items were AI-written.** Real creator material is less tidy and less on-message, so any gain panel 12 shows is an **upper bound** on what richer real material would give.
- The `messy` items (Coach Ana, FlowDesk) are a small spoken-style set — filler words, run-ons, self-corrections — to check that untidy input still helps. They are also AI-written.
- Wrong-product scope: Night Owl Espresso now has `size` and label facts that match Harbor Blend's, so those are no longer wrong-product signals. What stays product-specific: Harbor Blend's price ($17) and Tuesday roast/ship step; Night Owl's price ($19) and second-crack espresso roast. `panel.selftest.mjs` asserts this split.

## Item ids

Story ids are `<creator>/story-<n>` (1-based position in that creator's `stories` array). Fact ids are `<creator>/<product key>/<field>`. Only items marked `"fictional": true` (appended) are listed; original items are unchanged.

### Maya (fictional) (`mayas-coffee`)

| id | type | topic |
|---|---|---|
| `mayas-coffee/story-5` | story (experience) | Here's the thing, I once left a bag of Harbor Blend on my own counter… |
| `mayas-coffee/story-6` | story (experience) | The week I bought a proper drum roaster, I roasted my old garage favou… |
| `mayas-coffee/story-7` | story (framework) | To check if your beans are stale, read the roast date, smell a handful… |
| `mayas-coffee/story-8` | story (opinion) | Honestly, I think the roast date on the bag matters more than the coun… |
| `mayas-coffee/nightowl/size` | product fact (Night Owl Espresso) | 12 oz whole-bean bag |
| `mayas-coffee/nightowl/includes` | product fact (Night Owl Espresso) | Each bag has the roast date written on the label by hand |

### Glow Lab (fictional) (`glow-lab`)

| id | type | topic |
|---|---|---|
| `glow-lab/story-5` | story (experience) | In my experience, the batch I threw out taught me more than any good o… |
| `glow-lab/story-6` | story (experience) | Before Calm Cream, I patch-tested each new version on my inner arm for… |
| `glow-lab/story-7` | story (framework) | When I read a label, I look for fragrance, parfum and essential oils f… |
| `glow-lab/story-8` | story (opinion) | I think a short ingredient list is kinder to sensitive skin than a lon… |
| `glow-lab/melt-balm/process_step` | product fact (Melt Balm) | Made in small batches and poured by hand into each tin |

### FlowDesk founder (fictional) (`flowdesk`)

| id | type | topic |
|---|---|---|
| `flowdesk/story-4` | story (experience) | Look. Week one, our first customer's bug was a duplicate email. Same m… |
| `flowdesk/story-5` | story (experience) | We counted. Forty percent of our own support email was the same five q… |
| `flowdesk/story-6` | story (framework) | Stop answering twice. Tag every email for a week. Find the top five re… |
| `flowdesk/story-7` | story (opinion) | Look. Most small shops do not need a help desk. They need fewer repeat… |
| `flowdesk/story-8` | story (experience, messy) | So yeah, um, FlowDesk started because me and my partner kept, like, an… |
| `flowdesk/story-9` | story (experience, messy) | Our first paying customer, um, she found a bug in like the first hour,… |
| `flowdesk/story-10` | story (experience, messy) | I lost a whole Saturday to this ticket, um, and it turned out it was l… |
| `flowdesk/story-11` | story (opinion, messy) | I think, um, most small shops don't actually need a help desk, it's mo… |
| `flowdesk/flowdesk/includes` | product fact (FlowDesk) | Saved replies for the questions your shop gets every week |

### Coach Ana (fictional) (`coach-ana`)

| id | type | topic |
|---|---|---|
| `coach-ana/story-5` | story (experience) | After my deadlift went wrong I spent a whole month with just a broomst… |
| `coach-ana/story-6` | story (experience) | A client learned the hip hinge touching her hips to a wall every morni… |
| `coach-ana/story-7` | story (framework) | Hip hinge at home: stand a foot from a wall, soft knees, push your hip… |
| `coach-ana/story-8` | story (opinion) | Legit, I think a five-minute warm-up does more for beginners than any… |
| `coach-ana/story-9` | story (experience, messy) | So yeah, um, the deadlift thing, I basically just copied some video an… |
| `coach-ana/story-10` | story (experience, messy) | Okay so this client, she had, um, a hallway, like literally just a hal… |
| `coach-ana/story-11` | story (opinion, messy) | I think, um, people don't quit because they're lazy, it's like, the pl… |
| `coach-ana/story-12` | story (framework, messy) | So the warm-up, um, it's like five minutes, march in place, some hip c… |
| `coach-ana/starter/includes` | product fact (Home Strength Starter) | A short warm-up video for every session |

### Clay & Kiln maker (fictional) (`clay-kiln`)

| id | type | topic |
|---|---|---|
| `clay-kiln/story-4` | story (experience) | After that first kiln load I spent a whole evening, mind you, grinding… |
| `clay-kiln/story-5` | story (experience) | I once glazed a Tide Mug all the way down out of stubbornness, and the… |
| `clay-kiln/story-6` | story (framework) | Before glazing I wax the foot, wipe a finger's width above it with a d… |
| `clay-kiln/story-7` | story (opinion) | I think a bare clay foot is honest, mind you, it shows what the mug is… |
| `clay-kiln/bowl/size` | product fact (Moss Bowl) | Holds about 20 oz |
| `clay-kiln/bowl/includes` | product fact (Moss Bowl) | Dishwasher safe, with an unglazed foot |

### Signal Daily (fictional) (`signal-daily`)

| id | type | topic |
|---|---|---|
| `signal-daily/story-4` | story (experience) | Real talk, after the misquote I asked the same tool to show sources, a… |
| `signal-daily/story-5` | story (experience) | I tested three AI summarizers on the same issue of my newsletter, and… |
| `signal-daily/story-6` | story (framework) | Before trusting an AI answer: ask for its sources, open one, find the… |
| `signal-daily/story-7` | story (opinion) | Real talk, I think an AI tool that admits it does not know is worth mo… |
| `signal-daily/newsletter/includes` | product fact (Signal Daily Newsletter) | Each issue ends with the catch: one thing the tool gets wrong |

### Pip and Sprocket (fictional) (`pip-sprocket`)

| id | type | topic |
|---|---|---|
| `pip-sprocket/story-5` | story (experience) | Oh no, at our first sing-along nobody sang, so Sprocket sang alone, ve… |
| `pip-sprocket/story-6` | story (experience) | Backstage, Sprocket's spare arm lives in a sock drawer, and once I gra… |
| `pip-sprocket/story-7` | story (framework) | Our backstage check: spare arm, spare eyes, the lighting cue sheet, an… |
| `pip-sprocket/live-show/process_step` | product fact (Pip and Sprocket Live) | Every show ends with an audience sing-along led by Sprocket |

### Quiet Loom weaver (fictional) (`quiet-loom`)

| id | type | topic |
|---|---|---|
| `quiet-loom/scarf/size` | product fact (Harbor Fog Scarf) | About 180 cm long and 30 cm wide |
| `quiet-loom/scarf/process_step` | product fact (Harbor Fog Scarf) | Woven by hand on a floor loom, then washed and pressed |
| `quiet-loom/scarf/price` | product fact (Harbor Fog Scarf) | $85 per scarf |
