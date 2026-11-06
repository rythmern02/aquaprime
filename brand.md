# Brand — AquaPrime

_Status: active_

**Concept — "Bioluminescent Abyss."** Capital is a living liquid. It glows, moves and works, but never leaves
its vessel (the user's wallet). Everything on screen either *flows* (liquidity, quotes, keepers) or *holds*
(custody, collateral, humans).

## Palette (dark only)
| Token | Hex | Use |
|---|---|---|
| `abyss` | `#03050A` | page background |
| `deep` | `#070B14` | raised surfaces |
| `trench` | `#0C1322` | cards |
| `line` | `#1A2438` | hairlines |
| `tide` (primary) | `#5CF2E6` | liquidity, primary actions, healthy |
| `pulse` (secondary) | `#8B5CFF` | SwapVM / custom opcodes, World ID |
| `bloom` (accent) | `#C8FF5A` | verified human, success |
| `ember` (danger) | `#FF4D6D` | insolvency, denied |
| `amber` (warning) | `#FFB547` | grace window, test-mode labels |
| text | `#E8EEF8` / muted `#93A1B8` | body copy (AA on `abyss`) |

## Type
- Display: **Unbounded** (wide, confident, Gen-Z) — headlines only.
- UI: **Inter**.
- Numbers / bytecode: **JetBrains Mono** with tabular figures.

## Motion
Liquid easing `cubic-bezier(.22,1,.36,1)`; 150–250 ms for UI, 600–900 ms for reveals. Every ambient
animation (shader, orb, marquee) stops under `prefers-reduced-motion`.

## Voice
Short, confident, concrete numbers. "Your capital never leaves." not "We enable non-custodial liquidity."
