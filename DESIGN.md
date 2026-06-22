# TwinAI — DESIGN.md

> The visual source of truth for TwinAI. Token, rule, and rationale in one file.
> Landing, dashboards, and every new screen stay on-system by following this.
> Aesthetic in one line: **dark cinematic creator tool — warm signature gradient on a void-ink canvas, calm and premium, never "AI-generated."**

---

## 1. Visual Theme & Atmosphere
- **Mood:** confident, editorial, a little cinematic. Premium = *calm*, not busy. Think Linear's precision + ElevenLabs' dark cinema + a warm human gradient.
- **Canvas:** near-black ink (`#07070A`) with a single, slow ambient glow per page (the `Aurora` mesh). Atmosphere is *one* moment, not a halo behind every card.
- **Density:** generous whitespace on marketing; tighter, data-first rhythm on dashboards. Let one element dominate each block (the headline, or the number).
- **Texture:** a faint grain (`.noise`) and hairline borders carry depth — not glows.

## 2. Color Palette & Roles
| Token | Hex | Role |
|---|---|---|
| `ink` | `#07070A` | page canvas |
| `ink2` | `#0C0C11` | raised surface (cards) |
| `ink3` | `#13131A` | input / inset surface |
| `cream` | `#F6F1E9` | primary text, headlines |
| `sand` | `#C9BDAC` | body text |
| `stone` | `#8D8475` | muted / labels / captions |
| `amber` | `#FFB347` | accent 1 (warmth, value) |
| `coral` | `#FF5B7B` | accent 2 (energy, primary CTA) |
| `teal` | `#65E5D8` | accent 3 (success, "for you") |

- **Signature gradient (never re-order):** `amber → coral → teal` at 135°. There is **ONE teal: `#65E5D8`** — never `#70E4D5`.
- **Accent discipline:** at most one gradient-text phrase per page; accents are highlights, not the default for emphasis. Cream type carries hierarchy.

## 3. Typography
- **Display** (`font-display`, weight 800): hero + page H1. `text-4xl → text-6xl`, `tracking-tight`, `leading-[1.1]`.
- **Heading** (`font-heading`, weight 700): section + card titles. `text-base → text-lg`.
- **Body:** Geist, `text-sm`/`text-base`, `text-sand`, `leading-relaxed`.
- **Eyebrow:** uppercase, `letter-spacing eyebrow (0.18em)`, `text-xs`, `text-stone` (`.eyebrow`).
- **Numbers are heroes:** stat values `font-display text-4xl tracking-tight text-cream`; the label demotes to `text-xs text-stone`.
- **Floor:** never ship interactive/legible text below `text-xs` (12px). `[9px]`/`[10px]` only inside decorative device mockups.

## 4. Component Stylings (use the primitives — don't hand-roll)
- **Card:** `.glass` (one primitive everywhere). Hover: lift `-4px`, no scale. Don't invent per-page card variants.
- **Primary button:** `.btn-gradient` (signature gradient, ink text). Hover lift `-2px`.
- **Secondary:** `.btn-ghost` (hairline border, transparent).
- **Pill / filter / tag:** `.chip`. When used as a *control*, min touch height 36px (44px on coarse pointers).
- **Input:** `.field` (ink3 surface, focus ring coral). Inline mini-inputs still inherit field focus treatment.
- **Icons:** Lucide only, `h-[18px] w-[18px]` in 36–44px tap targets. **No emoji as decoration** — ever (use `Trophy`, `Sparkles`, etc.).

## 5. Layout Principles
- Max content width `1180px` (`max-w-content`); app pages `max-w-6xl`.
- **Section rhythm (marketing):** major = `py-28`, minor = `py-20`. Pick one per section, consistently.
- **Eyebrow → H2 → sub:** `mt-3 → mt-4`. Same meter everywhere (Apple's calm = a predictable beat).
- **Grids:** 2-up on mobile, 4-up desktop for stats; cards stack to single column ≤640px.
- Generous gutters (`gap-4`/`gap-5`); never let absolutely-positioned accents collide with content.

## 6. Depth & Elevation
- Depth comes from **hairline borders + one soft shadow**, not glows.
  - Card: `shadow-glass` (inset highlight + soft drop).
  - Hover/primary: `shadow-glow` (coral) or `shadow-glow-teal`.
  - Big lift: `shadow-lift`.
- **Glow budget: ONE ambient glow per page** (Aurora). No `blur-[Npx]` blob behind individual cards.

## 7. Do's & Don'ts
**Do**
- Keep one ambient glow per page; let borders + shadow do the depth.
- Make the number/headline the single hero of each block.
- Use the primitives (`.glass`/`.chip`/`.btn-*`/`.field`) so corners, heights, and focus are consistent.
- Keep motion calm: shared `cubic-bezier(.22,1,.36,1)`, lifts of `-2px`/`-4px`. Static gradients on headlines.

**Don't**
- ❌ Emoji as decoration. ❌ Two teals. ❌ A glow behind every card. ❌ A perpetually-animating headline.
- ❌ Gradient-text on every emphasis. ❌ One-off radii (`rounded-[40px]` for a normal card). ❌ Hardcoded `top-[57px]` magic numbers.
- ❌ Sub-12px interactive text. ❌ Tap targets < 44px on touch.

## 8. Responsive Behavior
- Breakpoints: base (mobile-first) → `sm:640` → `lg:1024`.
- **No overlaps on phones:** sticky header + any dropdown share ONE `sticky top-0` container; respect `env(safe-area-inset-top/bottom)`; gate floating decorative badges to `hidden sm:block`.
- Buttons go `w-full sm:w-auto`; never force a `min-w` that overflows a 320px screen.
- Touch targets ≥ 44px; fixed banners use `bottom-[max(1rem,env(safe-area-inset-bottom))]` and `inset-x-4`.
- Long chip rows: horizontal-scroll (`mask-fade-x`) on mobile rather than ragged wrapping.

## 9. Agent Prompt Guide (reuse for new screens)
> "Build [screen] for TwinAI on the DESIGN.md system: ink canvas, ONE Aurora glow, `.glass` cards, `.btn-gradient` primary, Lucide icons (no emoji), the single teal `#65E5D8`, numbers as `font-display text-4xl` heroes, calm static gradients, section rhythm `py-28/py-20`, mobile-safe (no overlaps, 44px touch, safe-area). Voice: confident, specific, warm, zero hype — outcome-led, never feature-led."

---
*Tokens mirror `tailwind.config.js` + `src/index.css`. When a case isn't covered here, default to: fewer effects, more whitespace, the primitive over the one-off.*
