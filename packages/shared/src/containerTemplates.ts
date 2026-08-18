// THE SHAPE, WITH ITS HOLES NAMED.
//
// ⚠️ `CONTAINER_TYPES` NAMES FIFTEEN SHAPES AND DESCRIBES NONE OF THEM. The
// transcript pass can already tell you a reference is a `mistakes` video; that
// is a label, and a label cannot be filled in. What turns "this is a mistakes
// video" into a script is knowing that a mistakes video needs a recognisable
// first mistake, a more surprising second, a re-hook before the third, and a
// what-to-do-instead at the end — and that each of those is a HOLE somebody has
// to supply something for.
//
// ⚖️ SO A TEMPLATE IS A LIST OF SLOTS, NOT A LIST OF SENTENCES. Nothing in this
// file is prose and nothing in it reaches a viewer: it is the difference between
// "write a mistakes video" (which is what a model does badly) and "here are five
// positions, here is what each one is for, and here is what has been supplied
// for it" (which is a filling-in job).
//
// ⚠️ AND THE ORDER OF THE ITEMS CARRIES THE CRAFT. Three interchangeable items
// is a list; recognisable → surprising → strongest is a video somebody watches
// to the end. That ordering is the reusable part of a reference, and dropping it
// would leave a shape with the shape taken out.
//
// ⚖️ FIFTEEN CONTAINERS, ONE TEMPLATE EACH, AND NO UNIVERSAL ONTOLOGY. This is a
// working vocabulary, not a theory of narrative — every entry earns its place by
// being a shape real short-form videos actually use.

import type { BeatRole, ContainerType, ContentSlotKind } from './referenceContentProfile'

/** One position in a container, and what has to go in it. */
export interface TemplateBeat {
  role: BeatRole
  /** A stable name for this position — `first_mistake`, `strongest_pick`. Used
   *  as the slot label so a card can say "surprising_item → your course". */
  label: string
  /** What this beat is FOR, in plain English. Reaches the creator in the
   *  drawer, so it is written for them and not for the model. */
  purpose: string
  /** ⚠️ WHICH BEATS NEED SOMETHING SUPPLIED, AND WHAT KIND. A hook needs
   *  writing; an item in a round-up needs a THING. Null means the writer can
   *  produce this beat from the decisions alone. */
  needs: ContentSlotKind | null
}

export interface ContainerTemplate {
  container: ContainerType
  /** One line a creator could read to know whether this is the video they want. */
  summary: string
  beats: readonly TemplateBeat[]
}

const hook = (purpose: string): TemplateBeat =>
  ({ role: 'hook', label: 'hook', purpose, needs: null })
const cta = (): TemplateBeat =>
  ({ role: 'cta', label: 'cta', purpose: 'What the viewer should do next.', needs: null })
/** ⚖️ THE RE-HOOK IS A REAL BEAT, NOT A FLOURISH. It is the line that buys the
 *  second half of the video, and the teleprompter used to delete it. */
const rehook = (purpose: string): TemplateBeat =>
  ({ role: 'rehook', label: 'rehook', purpose, needs: null })

const TEMPLATES: readonly ContainerTemplate[] = [
  {
    container: 'mistakes',
    summary: 'Three things people get wrong, and what to do instead.',
    beats: [
      hook('Name the mistake people make, so the viewer checks themselves against it.'),
      { role: 'item', label: 'first_mistake', purpose: 'The most recognisable one — the viewer nods.', needs: 'claim' },
      { role: 'item', label: 'second_mistake', purpose: 'Less obvious, so the video earns the next thirty seconds.', needs: 'claim' },
      rehook('Say the most important one is still coming.'),
      { role: 'item', label: 'worst_mistake', purpose: 'The strongest insight, saved for last.', needs: 'claim' },
      { role: 'payoff', label: 'what_to_do', purpose: 'What to do instead — the reason the video was worth watching.', needs: 'claim' },
      cta(),
    ],
  },
  {
    container: 'numbered_list',
    summary: 'A counted list — three things, five signs, seven rules.',
    beats: [
      hook('Promise the count and the payoff in one line.'),
      { role: 'item', label: 'relatable_item', purpose: 'Start where the viewer already agrees.', needs: 'example' },
      { role: 'item', label: 'surprising_item', purpose: 'The one they did not expect — this is what gets shared.', needs: 'example' },
      rehook('Signal the best is last so nobody leaves at item two.'),
      { role: 'item', label: 'strongest_item', purpose: 'The most useful one, held back deliberately.', needs: 'example' },
      { role: 'payoff', label: 'payoff', purpose: 'Tie the list together into one takeaway.', needs: null },
      cta(),
    ],
  },
  {
    container: 'recommendation',
    summary: 'Things worth using, and why each one earns its place.',
    beats: [
      hook('Name who this is for and what it saves them.'),
      { role: 'item', label: 'first_pick', purpose: 'The safe pick that establishes taste.', needs: 'product' },
      { role: 'item', label: 'surprising_pick', purpose: 'The unexpected one that proves it is not a sponsored list.', needs: 'product' },
      rehook('The one you actually use every day is next.'),
      { role: 'item', label: 'strongest_pick', purpose: 'The one worth the whole video.', needs: 'product' },
      { role: 'payoff', label: 'payoff', purpose: 'How to choose between them.', needs: null },
      cta(),
    ],
  },
  {
    container: 'comparison',
    summary: 'Two options, and which one to pick.',
    beats: [
      hook('State the choice the viewer is stuck on.'),
      { role: 'item', label: 'option_a', purpose: 'The first option, described fairly.', needs: 'product' },
      { role: 'item', label: 'option_b', purpose: 'The second, on the same terms.', needs: 'product' },
      { role: 'evidence', label: 'the_difference', purpose: 'The one difference that actually decides it.', needs: 'claim' },
      { role: 'payoff', label: 'verdict', purpose: 'Which to pick, and for whom.', needs: 'claim' },
      cta(),
    ],
  },
  {
    container: 'tutorial',
    summary: 'How to do one specific thing, start to finish.',
    beats: [
      hook('Show the finished result first, so the steps have a destination.'),
      { role: 'setup', label: 'what_you_need', purpose: 'What the viewer needs before starting.', needs: null },
      { role: 'item', label: 'step_1', purpose: 'The first step, in one action.', needs: 'example' },
      { role: 'item', label: 'step_2', purpose: 'The step people usually get wrong.', needs: 'example' },
      { role: 'item', label: 'step_3', purpose: 'The finishing step.', needs: 'example' },
      { role: 'payoff', label: 'result', purpose: 'The result, and how to tell it worked.', needs: null },
      cta(),
    ],
  },
  {
    container: 'problem_solution',
    summary: 'A problem the viewer has, and the fix.',
    beats: [
      hook('Name the problem in the viewer’s own words.'),
      { role: 'setup', label: 'why_it_happens', purpose: 'The cause, briefly — enough to make the fix make sense.', needs: 'claim' },
      { role: 'item', label: 'the_fix', purpose: 'What to do about it.', needs: 'claim' },
      { role: 'evidence', label: 'proof', purpose: 'Why this works — an example, a number, a result.', needs: 'current_fact' },
      { role: 'payoff', label: 'payoff', purpose: 'What changes once they do it.', needs: null },
      cta(),
    ],
  },
  {
    container: 'myth_busting',
    summary: 'A widely believed thing that is wrong.',
    beats: [
      hook('State the myth as the viewer believes it.'),
      { role: 'turn', label: 'the_correction', purpose: 'Say plainly that it is wrong.', needs: 'claim' },
      { role: 'evidence', label: 'why', purpose: 'The evidence — this beat is where the video is won or lost.', needs: 'current_fact' },
      { role: 'payoff', label: 'what_is_true', purpose: 'What to believe instead.', needs: 'claim' },
      cta(),
    ],
  },
  {
    container: 'unpopular_opinion',
    summary: 'A take most people in this niche disagree with.',
    beats: [
      hook('State the opinion flatly, without hedging.'),
      { role: 'setup', label: 'the_common_view', purpose: 'What most people think, stated fairly.', needs: null },
      { role: 'evidence', label: 'why_i_think_this', purpose: 'The reasoning — an opinion with no argument is a complaint.', needs: 'claim' },
      { role: 'payoff', label: 'what_it_means', purpose: 'What the viewer should do differently.', needs: 'claim' },
      cta(),
    ],
  },
  {
    container: 'story',
    summary: 'Something that happened, and what it taught.',
    beats: [
      hook('Open in the middle of the moment, not at the background.'),
      { role: 'setup', label: 'the_situation', purpose: 'Just enough context to follow.', needs: 'personal_experience' },
      { role: 'turn', label: 'the_turn', purpose: 'The moment it changed.', needs: 'personal_experience' },
      { role: 'payoff', label: 'the_lesson', purpose: 'What it means for the viewer, not just for you.', needs: 'claim' },
      cta(),
    ],
  },
  {
    container: 'confession',
    summary: 'Something you got wrong, admitted first-hand.',
    beats: [
      hook('Admit it in the first line — the admission IS the hook.'),
      { role: 'setup', label: 'what_i_did', purpose: 'What you actually did.', needs: 'personal_experience' },
      { role: 'turn', label: 'what_it_cost', purpose: 'The consequence, concretely.', needs: 'personal_experience' },
      { role: 'payoff', label: 'what_i_do_now', purpose: 'What you changed, so it is useful rather than confessional.', needs: 'claim' },
      cta(),
    ],
  },
  {
    container: 'before_after',
    summary: 'What it was like, and what it is like now.',
    beats: [
      hook('Show the after first, then rewind.'),
      { role: 'setup', label: 'before', purpose: 'The starting state, honestly.', needs: 'personal_experience' },
      { role: 'item', label: 'what_changed', purpose: 'The specific thing that made the difference.', needs: 'claim' },
      { role: 'payoff', label: 'after', purpose: 'The result, with something concrete in it.', needs: 'current_fact' },
      cta(),
    ],
  },
  {
    container: 'framework',
    summary: 'A repeatable way of thinking about something.',
    beats: [
      hook('Name the framework and what it decides.'),
      { role: 'item', label: 'part_1', purpose: 'First part, in one sentence.', needs: 'claim' },
      { role: 'item', label: 'part_2', purpose: 'Second part.', needs: 'claim' },
      { role: 'item', label: 'part_3', purpose: 'Third part.', needs: 'claim' },
      { role: 'evidence', label: 'worked_example', purpose: 'One real example run through it — without this it is a list of words.', needs: 'example' },
      cta(),
    ],
  },
  {
    container: 'prediction',
    summary: 'What is about to change, and what to do now.',
    beats: [
      hook('State the prediction with a timeframe.'),
      { role: 'evidence', label: 'the_signal', purpose: 'What is already happening that supports it.', needs: 'current_fact' },
      { role: 'item', label: 'what_it_means', purpose: 'The consequence for this viewer specifically.', needs: 'claim' },
      { role: 'payoff', label: 'what_to_do', purpose: 'The action to take before it happens.', needs: 'claim' },
      cta(),
    ],
  },
  {
    container: 'reaction',
    summary: 'Responding to something somebody else said or did.',
    beats: [
      hook('Show or quote the thing being reacted to.'),
      { role: 'turn', label: 'the_take', purpose: 'Your position on it, stated early.', needs: 'claim' },
      { role: 'evidence', label: 'why', purpose: 'The reasoning, so it is a view rather than a mood.', needs: 'claim' },
      { role: 'payoff', label: 'the_lesson', purpose: 'What the viewer takes away independent of the original.', needs: 'claim' },
      cta(),
    ],
  },
]

/** ⚠️ `other` HAS NO TEMPLATE ON PURPOSE. It is the honest answer for a shape
 *  this vocabulary does not cover, and inventing a generic hook/point/payoff for
 *  it would turn "we do not recognise this" into a confident structure — the
 *  fabricated-certainty failure, one layer up from the fields. */
const BY_CONTAINER = new Map(TEMPLATES.map((t) => [t.container, t]))

export function templateFor(container: ContainerType | null): ContainerTemplate | null {
  if (container === null) return null
  return BY_CONTAINER.get(container) ?? null
}

/** Which beats of this container need something supplied, in order. */
export function requiredSlots(t: ContainerTemplate): readonly TemplateBeat[] {
  return t.beats.filter((b) => b.needs !== null)
}

export const CONTAINER_TEMPLATES = TEMPLATES
