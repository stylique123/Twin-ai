# Generated questions: test account (Sunflower Coffee Roasters)

These are the exact questions the system generated, copied from the log (`question_asks`).
The probe skipped every other question, so the run after a skip shows the "different angle" rotation.
**Probe 1** ran Oct 4, 23:15. **Probe 2** ran Oct 5, 00:01.

**Read this first: there are gaps.**
- **No option reached 10 runs.** After a slot is skipped twice, it rests for 10 runs. Once every required slot is resting, the system stops asking, which is the behaviour you specced. So Launch stopped at 5 runs and Restock at 9.
- **Probe 2 did not start from clean history.** Deleting the old history timed out twice, so probe 2 continued from probe 1's history. That's why Launch has no probe-2 rows.

## Launch vs Restock, side by side

| Run | Launch (asks: who it's for) | Restock (asks: same or changed / what people said) |
|---|---|---|
| 1 | What kind of coffee drinker did you specifically craft this new roast for? *(skipped)* | Did you tweak anything about the roast profile for this batch of beans, or is everything identical to the last roast? *(skipped)* |
| 2 | Who do you picture standing by their coffee maker brewing this each morning? | Did you source from the exact same harvest this time around, or will folks notice any new tasting notes in their cup? |
| 3 | Is this release designed for the pour-over enthusiast, the espresso lover, or someone just looking for a smooth everyday cup? | Is the coffee recipe completely untouched from the first run, or did you update any of the bean components this time? |
| 4 | Which coffee lovers will feel like this bag was roasted just for them? | What was the exact comment or message a customer sent you while this roast was out of stock? |
| 5 | Is this new batch geared toward adventurous palates or folks who want an easy, crowd-pleasing daily mug? *(skipped)* | What did someone say or text you when they realized their favorite bag of beans was completely sold out? *(skipped)* |
| 6 | (resting) | What words did an impatient regular write when begging you to bring this roast back? |
| 7 | (resting) | What did someone tell you they were forced to drink each morning while waiting for this roast to come back? *(skipped)* |
| 8 | (resting) | Did the cherries go through the exact same processing method as before, or did anything change in how they were prepared? |
| 9 | (resting) | Did you partner with the exact same producer for these beans, or are they coming from a different farm this time? *(skipped)* |

Launch and Restock never asked the same thing.

- **Weak spot in Launch:** it only ever asked "who is it for". It never asked what's new or why now, which matter more for a launch. That's because the probe started on the `who_for` slot.
- **Weak spot in Restock:** runs 8–9 went back to "same or changed", which runs 1–3 had already asked.

## Other options (rotation across runs)

**The story behind it** (product)
1. Can you share one specific moment while roasting your beans when something went wrong and taught you an unforgettable lesson?
2. What happened in the exact moment you tasted the test batch that finally became your signature **Barr Coffee Co** roast? ⚠️
3. What unexpected thing happened the first time you tried bagging and sealing your fresh coffee beans for customers?
4. What specific thing went completely wrong—or unexpectedly right—during that defining batch of coffee beans?
5. What unexpected mishap or lucky breakthrough happened while dialing in this particular coffee?
6. What split-second error or lucky twist happened at the roaster while you were creating this roast?
7. What actual glitch or pleasant surprise caught you off guard while working on this coffee, and did it spoil or save it?

**Say why I made it** (product)
1. What specific coffee experience or roast profile was missing on the shelves before you decided to start roasting your own beans?
2. What was missing in your morning cup that finally made you take matters into your own hands and roast your own beans?
3. What couldn't you find in your local coffee scene that convinced you to fill the gap yourself?
4. What was the exact moment or cup of coffee that made you decide you had to start roasting your own beans?
5. Where were you and what tipped the scale right when you committed to actually bringing **Barr Coffee Co** to life? ⚠️
6. What was right in front of you the second you said out loud that you were officially launching a coffee company?
7. What were you doing when the sudden realization hit that you were genuinely going to make this coffee yourself?

**Interest now, buying later** (product)
- 6: What simple step or resource can someone explore right now if they aren't quite ready to buy your coffee yet?
- 7: What practical brewing adjustment can people test on their morning cup today while finishing whatever beans they already own?
- 8: What fun sensory exercise can folks try at their breakfast table this week to start tuning their palate for your roasts?
- 9: What quick deep-clean or maintenance trick can folks do on their home coffee grinder today while waiting on their next bag?

**Turn a DM into a video** (product)
- 1–5 ask for the message: "word for word", "paste the exact words", "type out to you, line for line", "the text bubble", "the original text".
- 6–9 ask for her reply: "what did you actually tell them?", "what exact response…", "what advice…", "what core insight…".

**Idea: something fun to watch** ⚠️ presumes a cart
1. What is one specific, chaotic moment that happened behind **your coffee cart** that made you think, 'nobody warned me about this'?
2. What ridiculous mishap happened mid-rush at **the cart** that had you trying not to laugh in front of customers?
3. What exact split-second disaster caught you off guard at **your cart**, like a runaway wheel or an exploding steam wand?

The **Idea: teach**, **process**, **story** and **answer** options all assume the same thing: "running your coffee cart", "rolled the cart out", "your first events".

**Reference: stay close**
1. Which specific parts of that reference video genuinely match what actually happens during your own coffee roasting mornings?
2. Which statements from that reference video could you say on camera and know they are entirely true for your routine?
3. Watching that clip, which lines feel like they belong to your own roast day without changing a single detail?

## Problems this found, and what I did

| Problem | Cause | Status |
|---|---|---|
| The idea questions presume she runs a coffee cart | The idea title "what nobody tells you about starting a coffee cart" was read as her own venture. Nothing she stated says she has a cart. | **Fixed in PR #1117.** The writer is now told an idea is a topic, not proof she has one. A question saying "your cart", "your studio" and so on is rejected unless her facts name it. |
| "Barr Coffee Co" instead of Sunflower Coffee Roasters | One old stored fact on the test account, "Barr Coffee Co coffee beans", from Sept 27, reached the question writer. | **Open.** It's on the test account only. I have not deleted it; that needs your OK. |
| Launch never asked "what's new" or "why now" | The probe started on `who_for`; skip-twice rotation then rested it. | **Open.** I'll ask the required slots in a fixed order: what's new, then why now. |
| Restock asked "same or changed" again in runs 8–9 | In the probe, an answered question doesn't store a fact, so the slot looks unfilled. | This is a probe artifact, not a live one: a real answer stores a fact, which fills the slot. |
