# React Bits Pro (vendored)

This directory holds component source vendored from the **React Bits Pro**
registry (https://pro.reactbits.dev/, registry `@reactbits-pro`). The library
distributes code you own: files are copied into the repo, so they are plain
project source — read them, bend them, keep them.

## Provenance

- `scripts/fetch_reactbits.py` downloads registry items with the license key
  (`REACTBITS_LICENSE_KEY`, stored in `.env.local`, git-ignored) and writes the
  original file contents here, plus a `<item>.json` manifest recording the
  registry path of every file.
- `scripts/adapt_reactbits_tokens.py` then rewrites the blocks' hardcoded
  neutral Tailwind palette (`bg-white dark:bg-neutral-950`, `text-neutral-900
  dark:text-neutral-100`, …) onto the app's semantic `--color-rb-*` utilities
  defined in `src/app/globals.css`, so every block follows this app's theme
  presets and dark mode. Re-running fetch + adapt restores a clean vendored
  state; the script is idempotent on pristine input.

## Layout

- `*.tsx` — the vendored blocks (adapted tokens, otherwise upstream code).
- `*.json` — per-item manifests (registry name, type, original file paths).
- Excluded from Biome (`biome.json`) like `src/components/ui`: upstream code
  style is preserved as shipped.

The application does not import these files directly. `src/components/rb/`
holds the wired components (app shell, navbar, sidebar, search palette, auth
card, dashboard kit) that reuse these blocks' design tokens and patterns with
real app data.

## Adding more blocks

1. Add the registry item name to `ITEMS` in `scripts/fetch_reactbits.py`.
2. Run `python3 scripts/fetch_reactbits.py && python3 scripts/adapt_reactbits_tokens.py`.
3. Wire it from `src/components/rb/`.

Install via the shadcn CLI is also configured (`components.json` registries +
`npx shadcn@latest add @reactbits-pro/<name>`), but the scripts above are the
path this repo uses so the vendored state stays reproducible.
