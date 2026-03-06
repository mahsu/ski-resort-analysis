---
name: Design System Improvements
overview: Systematize spacing, typography, z-index, and color tokens in `style.css` by introducing CSS custom properties and fixing hardcoded values that bypass existing variables.
todos:
  - id: add-vars
    content: Add --space-*, --text-*, --weight-*, --z-*, --resort-*-dim, and --font-family variables to :root; update --resort-a/b colors
    status: pending
  - id: replace-spacing
    content: Replace all padding/margin/gap values with the appropriate --space-* variables
    status: pending
  - id: replace-text
    content: Replace all font-size values with the appropriate --text-* variables
    status: pending
  - id: replace-weight
    content: Replace all font-weight values with the appropriate --weight-* variables
    status: pending
  - id: fix-hardcoded-colors
    content: Replace hardcoded hex colors in gradients with existing color variables, and add --resort-a-dim / --resort-b-dim
    status: pending
  - id: replace-zindex
    content: Replace raw z-index values with --z-* variables
    status: pending
  - id: font-family-body
    content: Set font-family on body via --font-family; remove redundant font-family declarations from tooltip and D3 SVG classes
    status: pending
  - id: update-constants
    content: Update RESORT_COLORS in constants.js to match new resort-a/b values
    status: pending
isProject: false
---

# Design System Improvements

Systematize spacing, typography, z-index, and color tokens in [`src/visualization/style.css`](src/visualization/style.css) by introducing CSS custom properties and fixing hardcoded values that bypass existing variables.

## Variables to add/update in `:root`

- Spacing: `--space-xxs` through `--space-xl` (4px grid)
- Font sizes: `--text-sm`, `--text-md`, `--text-xl`
- Font weights: `--weight-normal`, `--weight-medium`, `--weight-semibold`, `--weight-bold`
- Z-index: `--z-header`, `--z-tooltip`, `--z-dropdown`
- Resort colors: `--resort-a: #4f46e5`, `--resort-b: #db2777`; `--resort-a-dim`, `--resort-b-dim`
- Font family: `--font-family` on body; remove redundant declarations

## Resort color rationale

Resort B was identical to Extreme (`#ea580c`); Resort A was close to accent. New pair: indigo + pink (Option 3).

## Font family

Set once on `body`; remove from `.tooltip`, `.axis text`, `.axis-label`, `.panel-resort-label`.

## Scope

- [`src/visualization/style.css`](src/visualization/style.css) — all variable and value changes
- [`src/visualization/constants.js`](src/visualization/constants.js) — `RESORT_COLORS` updated to `{ A: "#4f46e5", B: "#db2777" }`
