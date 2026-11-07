# Brand — AquaPrime

_Status: active_

**Concept — "Open Water."** Capital as the sea: everywhere at once, owned by no pool. The page is a descent —
open sky and a living ocean at the top, a liquidity *field* in the middle, the deep sea at the footer.
Light, calm and exact; motion is the ocean's, never decoration for its own sake.

## Palette (source of truth: `frontend/src/lib/theme.ts`)
| Token | Hex | Use |
|---|---|---|
| `bg` | `#F4F9FE` | page (sky-white) |
| `panel` / `raised` | `#FFFFFF` / `#EAF3FC` | cards, active rows |
| `rule` / `rule-2` | `#D9E7F3` / `#BFD5E9` | hairlines, inputs |
| `fg` → `fg-4` | `#06223D` `#284863` `#4F6B85` `#7F97AC` | deep-sea ink; `fg-4` for labels only |
| `ocean` | `#0B7FE8` | action, highlights, custom opcodes |
| `ocean-deep` | `#0A4A85` | footer, hover, serif emphasis |
| `ocean-aqua` | `#1FC2E3` | glints, the brand-mark slice |
| `signal` | `#E8473B` | **danger only**: insolvency, denied, errors |
| `ok` / `warn` | `#0E9467` / `#C27400` | verified / grace window |

## Type
Instrument Sans (UI, display at −0.035em) · Instrument Serif italic for one emphasis word · IBM Plex Mono for every number and label.

## Signature pieces
- **Ocean** (`fx/Ocean.tsx`): GPU Gerstner sea, Fresnel sky reflection, sun glitter, foam, cursor wake. SVG-wave fallback.
- **Higgs field** (`fx/HiggsField.tsx`): a lattice that gains mass where a trade passes — Aqua's virtual liquidity made visible.
- **Waves** (`fx/Waves.tsx`): layered swell for dividers and the deep-sea footer.

## Rules
Pill buttons (navy primary, ocean for the main CTA); soft blue shadows; no gradient text; motion ≤ 1 s and off under
`prefers-reduced-motion`; WebGL always has a fallback and survives context loss.
