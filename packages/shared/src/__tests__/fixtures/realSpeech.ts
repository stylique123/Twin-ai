// REAL SENTENCES, HAND-LABELLED. THE RULER FOR `claimStrength`.
//
// ⚠️ WHY THIS FILE EXISTS. `claimStrength` shipped with tests whose sentences I
// wrote myself — in the shapes the pattern already matched. Run against the
// first real transcripts pulled for these creators it classified 31 of 32
// first-person sentences as `discussion`, meaning "carries no claim about this
// person", and in production that wave-through is what licenses a beat to
// speak on coverage-only evidence. A detector nobody measured against real
// speech is a guess with a test suite.
//
// Every line below is VERBATIM from a real YouTube transcript (CarterPCs,
// Jeremy Ray Holst) or a real generated beat from the 112-case matrix. Nothing
// is invented, because invented sentences are what caused the problem.
//
// ⚖️ THE LABELS ARE THE ARGUMENT, so each unobvious one carries its reason.
// The distinction that matters is not "does it contain I" — 58% of real spoken
// sentences do — but WHAT THE SENTENCE COMMITS THE CREATOR TO:
//
//   history     an event in their life. Needs to be on record.
//   position    a stance they hold. Needs to have been heard.
//   discussion  narration, deixis, or a statement about the world. Free.
//
// NARRATION IS THE TRAP. "I'm going to show you three things" is first-person,
// past-tense-adjacent, and commits the creator to nothing — it describes the
// video, not the person. Classifying it as history would block the opening line
// of most scripts in the corpus, which is a worse failure than the one being
// fixed.

export interface LabelledLine {
  text: string
  expect: 'discussion' | 'position' | 'history'
  /** Why, when the label is not self-evident. */
  because?: string
  source: 'transcript' | 'generated'
}

export const REAL_SPEECH: LabelledLine[] = [
  // ── HISTORY: something that happened to them ──────────────────────────────
  { text: 'I bought these $34 drones off of Shein.', expect: 'history', source: 'transcript' },
  { text: 'I did not mean to buy two.', expect: 'history', source: 'transcript' },
  { text: 'I had to slap it down.', expect: 'history', source: 'transcript' },
  { text: 'I woke up early for this.', expect: 'history', source: 'transcript' },
  { text: 'I took out the W cooler and then the CPU was stuck to the bottom of it and I didn\'t know it.', expect: 'history', source: 'transcript' },
  {
    text: 'I told you guys I\'ll give away three PCS if this guy wins.',
    expect: 'history',
    because: 'A promise they actually made. The giveaway is a fact about their channel, not narration of this video.',
    source: 'transcript',
  },
  {
    text: 'all things considered that was probably the best WWDC I\'ve ever seen.',
    expect: 'history',
    because: '"I have ever seen" asserts a span of their viewing life, not merely an opinion held today.',
    source: 'transcript',
  },
  {
    text: 'My 3D prints used to be so brittle, but then I started doing this one thing, and now they\'re consistently strong.',
    expect: 'history',
    because: 'The line that proved the gap: a fabricated personal history the old pattern scored as `discussion`.',
    source: 'generated',
  },
  { text: 'I never expected this fight to get this far honestly.', expect: 'history', source: 'transcript' },
  { text: 'I thought it was over there it should have been over there.', expect: 'history', source: 'transcript' },
  {
    // ⚠️ LABEL CORRECTED FOR CONSISTENCY, NOT TO MAKE A PATTERN PASS. I had
    // this as `history` and the near-identical generated line "Here are 3 items
    // I found…" as `discussion`. Both make the same claim — that the creator
    // did the finding — so one of the two labels was wrong.
    //
    // DISCOVERY NARRATION IS DISCUSSION. Requiring experience-level evidence
    // for "I found these" would block the standard listicle opener for every
    // creator in the corpus, and the claim it carries is thin: it says they did
    // research, not that they lived through something. The risk asymmetry
    // decides it — a missed thin claim costs one weak line, a false block costs
    // the opener of most scripts.
    text: 'And these are all products that I just recently found.',
    expect: 'discussion',
    because: 'Discovery narration. Same claim as "Here are 3 items I found", and labelled the same way.',
    source: 'transcript',
  },
  {
    text: 'I\'ve seen this myself where somebody goes fishing, cast the pole out, and then they sit in the chair and wait and fall asleep.',
    expect: 'history',
    because: '"I have seen this myself" is an explicit appeal to their own experience.',
    source: 'transcript',
  },
  { text: 'I used to struggle with distractions.', expect: 'history', source: 'generated' },
  { text: 'those high-end, wired earbuds I used to swear by', expect: 'history', source: 'generated' },

  // ── POSITION: a stance they hold ──────────────────────────────────────────
  { text: 'I\'m shocked that doesn\'t survive that round.', expect: 'position', source: 'transcript' },
  { text: 'these are no-brainer features but I\'m glad they\'re finally added them.', expect: 'position', source: 'transcript' },
  { text: 'I\'m not terrified for Dustin anymore.', expect: 'position', source: 'transcript' },
  { text: 'this is probably already the best iOS update of all time I\'m not going to lie.', expect: 'position', source: 'transcript' },
  { text: 'I really like the pricing structure they have.', expect: 'position', source: 'transcript' },
  { text: 'I always like to start with a photo first.', expect: 'position', source: 'transcript' },
  { text: 'The reason I like using this simple prompt AI so much is because it actually asks you questions.', expect: 'position', source: 'transcript' },
  { text: 'I like to use Nano Banana.', expect: 'position', source: 'transcript' },
  { text: 'I still think foldables are overrated.', expect: 'position', source: 'generated' },
  { text: 'The first thing I would never do is buy a Fitbit Air.', expect: 'position', source: 'generated' },
  { text: 'I\'d never invest in ultra high-budget gaming PCs beyond a certain point.', expect: 'position', source: 'generated' },

  // ── DISCUSSION: narration, deixis, and claims about the world ─────────────
  // ⚠️ THE FALSE-POSITIVE SET. A widening that catches any of these is worse
  // than the gap it closes: it would block the opening line of most scripts in
  // the corpus and escalate honest beats into questions.
  {
    text: 'In this video, I\'m going to be breaking down and exposing the top seven products to sell this week.',
    expect: 'discussion',
    because: 'Narration. Describes the video, commits the creator to nothing.',
    source: 'transcript',
  },
  {
    text: 'I can\'t show you the actual fight or else this video will get taken down but here\'s my live reaction.',
    expect: 'discussion',
    because: 'Narration about the upload, plus a platform fact. No claim about their life.',
    source: 'transcript',
  },
  {
    text: 'Google does NOT want you to buy these 3 phones, and I\'m going to tell you why.',
    expect: 'discussion',
    because: '"I am going to tell you" is a speech act about this video, not a stance.',
    source: 'generated',
  },
  {
    // ⚠️ LABEL CHANGED DURING TUNING, AND SAYING SO IS THE POINT. I first
    // labelled this `discussion` — "self-introduction plus narration" — and the
    // widened pattern disagreed. The pattern was right. "3 things that I would
    // never do" asserts the creator holds three negative preferences; the
    // introduction wrapped around it does not undo that. Blocking this line for
    // a creator we have never heard state a preference is CORRECT: the honest
    // rewrite is "here are 3 things worth avoiding", which claims nothing about
    // them.
    //
    // Changing a label to make a pattern pass is exactly how a fixture stops
    // being a ruler, so the reason is recorded rather than the edit hidden.
    text: 'I\'m Nathan Espinoza, and I\'m gonna give you 3 things that I would never do when it comes to tech.',
    expect: 'position',
    because: 'Announces three held preferences. The narration wrapper does not neutralise the claim.',
    source: 'generated',
  },
  {
    text: 'I\'m talking about a phone that stands out from the crowd, focusing on unique features.',
    expect: 'discussion',
    because: '"I am talking about X" names a subject. Anyone may name a subject.',
    source: 'generated',
  },
  {
    text: 'I\'ll have the link in the description.',
    expect: 'discussion',
    because: 'A fact about the upload.',
    source: 'transcript',
  },
  {
    text: 'I\'m going to keep it at 1K for the resolution.',
    expect: 'discussion',
    because: 'Narrating a demo happening on screen right now, not recounting a past event.',
    source: 'transcript',
  },
  {
    text: 'Now, I don\'t know if any of you guys have tried to give your dog a bath before, it\'s insanely hard to keep them still.',
    expect: 'discussion',
    because: '"I do not know if YOU have" is about the audience. The claim that follows is about the world.',
    source: 'transcript',
  },
  { text: 'Let\'s talk about what actually changed in this update.', expect: 'discussion', source: 'generated' },
  { text: 'Most people leave Smart HDR on auto.', expect: 'discussion', source: 'generated' },
  { text: 'Wired connections provide a stable, uncompressed signal path.', expect: 'discussion', source: 'generated' },
  {
    // ⚠️ FOUND BY MEASURING THE BLAST RADIUS OF THE WIDENING, before it shipped.
    // "What if I told you…" is one of the most common hooks in short-form and
    // the widened HISTORY pattern read `told you` as a past speech act about
    // their life. Escalating it would have refunded a large share of ordinary
    // scripts — the widening's own crying-wolf failure, caught the same way the
    // sell pattern's was.
    text: 'But what if I told you the secret to staying ahead is understanding the mechanism.',
    expect: 'discussion',
    because: 'A rhetorical frame addressed to the viewer. It recounts nothing.',
    source: 'generated',
  },
  {
    text: 'Here are 3 items I found that are going to make your daily life so much easier.',
    expect: 'discussion',
    because: 'Listicle framing. "Items I found" is discovery narration, not a life event — and it opens a large share of the corpus.',
    source: 'generated',
  },
  {
    text: 'What\'s one tech purchase you regret, and what did you learn from it?',
    expect: 'discussion',
    because: 'An engagement CTA addressed to the viewer. Already a false positive once, in the sell check.',
    source: 'generated',
  },
]
