# Brand — AquaPrime

_Status: active_

**Concept — "Graphite / Signal."** A precise financial instrument, not a crypto toy. The page reads like an
engineering drawing: warm near-black paper, bone ink, hairline rules, and exactly one colour that means
*look here*. Everything else is typography and spacing.

## Palette (dark only)
| Token | Hex | Use |
|---|---|---|
| `bg` | `#0B0B0A` | page |
| `panel` | `#111110` | framed surfaces |
| `raised` | `#191917` | hover / active rows |
| `rule` / `rule-2` | `#24231F` / `#34332E` | hairlines, input borders |
| `fg` | `#EDEBE5` | primary text, primary buttons, healthy values |
| `fg-2` / `fg-3` / `fg-4` | `#BDB9B0` / `#8C887F` / `#66635C` | body / secondary / labels only |
| `signal` | `#FF5B24` | the one accent: live dots, opcode 0xf0, insolvency, the sold slice |
| `ok` | `#55C48C` | done, approved, verified |
| `warn` | `#E3A63C` | grace window, near-liquidation |

Rules: no gradient text, no glows, no glassmorphism. `signal` appears at most a few times per screen.

## Type
- **Instrument Sans** (400/500/600): UI and headlines, tracking −0.035em on display sizes.
- **Instrument Serif italic**: one emphasis word per headline at most ("*never* leaves").
- **IBM Plex Mono**: every number (tabular), labels in 11px uppercase with +0.08em tracking.

## Shape and layout
- Radii 2–8 px. Buttons are 6 px rectangles; primary = bone fill, black text.
- 12-column editorial grid; each section opens with a hairline and an index (`01 / Mechanism`).
- Panels are split by 1 px gaps on a `rule` background rather than separate cards.

## Motion
Short fades (≤ 600 ms, ease `(.2,.8,.2,1)`), no blur-ins or bounces. All motion off under `prefers-reduced-motion`.

## Voice
Plain and specific. Short sentences. Numbers over adjectives.
