// A HELD-OUT SET. TWO CREATORS THE PATTERNS WERE NEVER TUNED ON.
//
// ⚠️ WHAT THIS FILE MEASURED, AND WHY IT IS NOT A PASS/FAIL GATE.
//
// `claimStrength` was widened against 39 real lines from CarterPCs and Jeremy
// Ray Holst and reached 39/39. Run against these 25 lines from Ryan Kennedy
// (long-form reviews) and Justice Buys (product shorts) — neither of whom
// contributed a single line to that tuning — it scores 14/25.
//
// 39/39 in-sample and 56% out-of-sample is the signature of an OVERFITTED
// FIXTURE, and it was found on purpose: the in-sample score was never evidence
// the detector generalises, and reporting it as though it were is the mistake
// this whole thread keeps re-learning at a new level.
//
// ⚖️ THE STRUCTURAL LIMIT IT EXPOSES. Every miss here is under-detection of an
// ordinary sentence — "I've added a Ryzen 7", "I was looking for a laptop",
// "I've talked to their representatives", "I absolutely love it". A verb list
// cannot close over open-class speech; the auxiliary carries the tense, not the
// verb. A structural rule (first person + past/perfect, first person +
// evaluative) scores 20/25 here against the lexical 14/25 — better, and with
// false positives of its own on narration ("I wanted to make a comprehensive
// review"), which is the expensive direction and is why it is not shipped
// unmeasured.
//
// So this is a BENCHMARK WITH A FLOOR, not a target. The floor stops the score
// regressing; raising it is a real change that needs its blast radius measured
// against the stored runs first, exactly as the last widening did.
//
// Labelled by reading, BEFORE the classifier was run on any of them.
export const HELD_OUT_SPEECH: {
  text: string
  expect: 'discussion' | 'position' | 'history'
  note?: string
}[] = [
  // history
  { text: "I'm trying to assemble a computer, so I bought this mainboard.", expect: 'history' },
  { text: 'In fact, if you look inside, I already bought the CPU.', expect: 'history' },
  { text: "I've added a Ryzen 7 because I can afford this one here.", expect: 'history' },
  { text: "for the longest time guys I was looking for a Windows laptop that's going to last me for a long time", expect: 'history' },
  { text: "I've already sort of removed the paper packaging just to make sure that the laptop is charged", expect: 'history' },
  { text: "I've talked to their representatives, they're converting a lot of applications to native arm architecture", expect: 'history' },
  { text: 'this particular version that I have has 16 gigs of RAM and 512 GB of internal storage', expect: 'history' },
  { text: "Guys, I really haven't found a good video talking about Microsoft Copilot Vision and Edge.", expect: 'history' },
  // position
  { text: "What I've noticed right away is that it translates everything into normal human language.", expect: 'position' },
  { text: "I'm really impressed by the fact that it's able to extract information from the map really quickly.", expect: 'position' },
  { text: "I don't care what people say, sometimes I do get to use the touchscreen.", expect: 'position' },
  { text: 'this particular color is called Sapphire and I absolutely love it', expect: 'position' },
  { text: "one of my favorite things is that it has a Sony PlayStation built in", expect: 'position' },
  { text: "I'm not sure how Microsoft has gotten that 22-hour number because there's a little asterisk on it", expect: 'position' },
  { text: 'the touchpad is absolutely wonderful though', expect: 'discussion', note: 'A verdict on the object with no first-person marker. The ladder keys on claims about the PERSON.' },
  // discussion — narration, CTAs, and product description
  { text: 'And in today\'s video, I wanted to make a comprehensive review going from simple use cases to something more complex.', expect: 'discussion' },
  { text: "I'll be doing some testing in a future video and I'll tell you what the battery life is like", expect: 'discussion' },
  { text: 'let me know in the comments, should I use an RTX 5090 with this one here or a 4090?', expect: 'discussion' },
  { text: "I'm really curious to hear what you guys think about this car and I'll see you the next one", expect: 'discussion' },
  { text: 'Okay, so let\'s move on to the next use case.', expect: 'discussion' },
  { text: 'I want to show you what the changes are.', expect: 'discussion' },
  { text: 'Not only does it fit up to 24 batteries at once, it only takes 2 and 1/2 hours to charge.', expect: 'discussion' },
  { text: 'Each battery can be used over 300 times and it\'s basically a personal vending machine.', expect: 'discussion' },
  { text: 'This might look like a regular rice cooker, but when you pour stuff inside, it has a built-in scale.', expect: 'discussion' },
  { text: 'Sony promises that it\'s going to go on US roads by 2026.', expect: 'discussion' },
]
