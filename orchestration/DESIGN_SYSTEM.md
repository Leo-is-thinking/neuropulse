# Design System — Clean Clinical (LOCKED)

Direction: **light, clean, medical-grade.** White surfaces, slate neutrals, teal as the single brand accent, status colors only for clinical flags. Derived from what T3 already shipped (slate + teal + red/amber/emerald rings). All terminals match this.

## Tokens (Tailwind classes — use these, nothing else)
| Role | Class |
|---|---|
| Page background | `bg-slate-50` |
| Card / panel | `bg-white border border-slate-200 rounded-xl shadow-sm` |
| Subtle fill / table header | `bg-slate-100` |
| Primary text | `text-slate-900` ; secondary `text-slate-600` ; muted `text-slate-500` ; faint `text-slate-400` |
| Brand / primary action | `bg-teal-600 hover:bg-teal-700 text-white` ; accent text `text-teal-700` ; tint `bg-teal-50` |
| Alert (critical) | `bg-red-50 text-red-700 border-red-200` ; ring `ring-red-500` |
| Warn (watch) | `bg-amber-50 text-amber-800 border-amber-200` ; ring `ring-amber-400` |
| OK (stable) | `bg-emerald-50 text-emerald-700 border-emerald-200` ; ring `ring-emerald-500` |
| Dividers | `border-slate-200` / `border-slate-100` |

## Visual-only colors (SVG/canvas, T4)
Hex equivalents for SVG fills: slate-900 `#0f172a`, slate-200 `#e2e8f0`, slate-500 `#64748b`, teal-600 `#0d9488`, red-500 `#ef4444`, amber-400 `#fbbf24`, emerald-500 `#10b981`.
Tremor/motor = **red/amber** · Voice/vocal = **teal** · Cardiac = **red** · Sleep/nocturia = **slate** · Adherence/actuation = **amber LED** (`#fbbf24`) then **emerald** when confirmed.

## Type & shape
- Font: system sans (`font-sans`, Inter if already loaded by T3). Numbers in tables/metrics: `tabular-nums`.
- Sizes: page title `text-xl font-semibold`; section title `text-sm font-semibold uppercase tracking-wide text-slate-500`; body `text-sm`; big metric `text-3xl font-semibold tabular-nums`.
- Radius: `rounded-xl` cards, `rounded-lg` buttons/inputs, `rounded-full` avatars/pills. Spacing grid 4px; card padding `p-5`; gap `gap-4`/`gap-6`.
- Icons: `lucide-react` only, `size-4`/`size-5`, stroke default.
- Buttons: primary teal (above); secondary `bg-white border border-slate-200 text-slate-700 hover:bg-slate-50`; destructive never used in demo.
- Flags in tables: pill `rounded-full px-2 py-0.5 text-xs font-medium` using the status classes.

## Motion
- Subtle only. `transition-colors duration-150`. Tremor/vibration animations are CSS keyframes (T4) and must respect `prefers-reduced-motion`.
- No glassmorphism, no gradients (except a flat tint), no neon, no dark mode for the demo.

## 3D visuals (T4) — keep light
CSS 3D (`perspective`, `rotateX/Y`) + inline SVG. No three.js. Card background white, anatomy drawn in slate/teal/red from the palette above.
