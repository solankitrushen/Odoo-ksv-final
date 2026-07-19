# DESIGN.md — Rental Customer Portal

## Scene

A renter comparing options on a phone in daylight, and an office manager reserving
event gear on a laptop. Bright ambient light, decisions about money and dates.
→ **Light theme.** Airy, high-contrast ink on near-white. No dark mode this pass.

## Color strategy — Restrained

Near-monochrome, deliberately. 60/30/10:
- **60% surface:** near-white, tinted a hair warm (stone), never `#fff`.
- **30% ink:** near-black, same warm hue at very low chroma, never `#000`.
- **10% accent:** a mid neutral gray for structure, borders, secondary text.

All neutrals share one warm-stone hue (~75) at chroma 0.004–0.008. The only
non-neutral hues are semantic status colors (success/warn/danger) used sparingly
for order state, deposit, and late-fee signals — never decorative.

### Tokens (OKLCH, defined in globals.css)

| Role | OKLCH | Use |
|---|---|---|
| surface        | `0.992 0.004 75` | page background (60%) |
| surface-raised | `0.985 0.004 75` | subtle sections |
| card           | `1.0 0 0` clamped → `0.998 0.003 75` | product cards, panels |
| ink            | `0.185 0.006 75` | primary text, buttons (30%) |
| ink-soft       | `0.44 0.006 75`  | secondary text |
| line           | `0.90 0.005 75`  | borders / hairlines (10%) |
| line-strong    | `0.82 0.005 75`  | emphasized dividers |
| muted-surface  | `0.955 0.004 75` | input bg, chips |
| success        | `0.62 0.11 155`  | deposit returned, on-time |
| warn           | `0.75 0.12 75`   | due soon |
| danger         | `0.58 0.16 27`   | overdue, late fee, deposit deduction |

Accent for primary actions is **ink itself** (near-black button, white label):
the 10% "color" budget is spent on neutral gray structure, per the mandate.

## Typography

- **Display / headings:** a grotesque or transitional serif for editorial weight.
  Chosen: `"Fraunces"` (variable serif) for marketing display; falls back to system serif.
- **UI / body:** `"Inter"` variable, the workhorse for app surfaces and body.
- Scale ratio ≥1.25. Steps: 12 / 14 / 16 / 20 / 26 / 34 / 46 / 62.
- Body max width 68ch. Tabular-nums for all money and dates.

## Layout & rhythm

- 12-col fluid grid, generous gutters. Content max ~1200px; marketing hero can bleed.
- Vary vertical rhythm: tight within components, wide between sections (96–128px on
  marketing, 48–64px in app).
- Cards used only for genuinely card-like objects (a product, an order). Never nested.
- Hairline borders (`line`) over shadows. Elevation is rare and soft.

## Motion

- Ease-out-expo / quart only. Durations 150–320ms. No bounce.
- Animate transform/opacity only. Reveal-on-scroll for marketing sections, subtle.
- Respect `prefers-reduced-motion`.

## Radius & density

- Radius: `--radius: 0.625rem` (10px) base; sm/md/lg derived. Buttons slightly tighter.
- Comfortable touch targets (≥44px) on interactive controls.
