# YouTube Focus — Agent Guide

## Project Overview

YouTube Focus is a Chrome Extension (Manifest V3) that hides YouTube Shorts and Playables to help users focus on long-form content. Published on the [Chrome Web Store](https://chromewebstore.google.com/detail/youtube-focus/dppgailgbpncddkeccgfiplmdonfloja).

## Commands

**Setup:** `npm install`

**Dev:** `npm run dev` — launches a Chromium with the extension auto-loaded and HMR enabled.

**Build:** `npm run build` — outputs the unpacked extension to `.output/chrome-mv3/`. Load that path via `chrome://extensions/` → "Load unpacked" to test the production bundle.

**Compile-check:** `npm run compile` — runs `wxt build --debug && tsc --noEmit`. Verifies TS soundness without launching a browser.

**Zip for Chrome Web Store:** `npm run zip` — outputs `.output/yt-focus-<version>-chrome.zip`.

**Lint:** N/A (no linter configured).

**Test:** N/A (no test framework configured).

## Tech Stack & Architecture

- **Platform:** Chrome Extension (Manifest V3), built with [WXT](https://wxt.dev) (Vite-based).
- **Language:** TypeScript (strict, via WXT's generated tsconfig).
- **Package manager:** npm.

WXT entrypoints (`entrypoints/`) plus shared modules (`lib/`):

- **`wxt.config.ts`** — Manifest config (name, description, permissions, icons). Version is auto-injected from `package.json`.
- **`entrypoints/content.ts`** — Content script for `*://*.youtube.com/*`. Reads preferences into a closure variable, calls `applyHiding(prefs)` on initial load, on preference changes (via `watchPreferences`), and on every DOM mutation (via `MutationObserver` on `document.body`). Registers cleanup via `ctx.onInvalidated` so HMR doesn't leak listeners.
- **`entrypoints/popup/index.html` + `main.ts`** — Popup UI: two checkboxes wired to the typed prefs, with a "Settings saved" status flash.
- **`lib/preferences.ts`** — Typed `storage.defineItem` wrappers over `chrome.storage.sync`. Defaults defined exactly once (`fallback: true`). Storage keys are `'sync:hideShorts'` and `'sync:hidePlayables'` — these map to `chrome.storage.sync` keys `hideShorts` / `hidePlayables`, matching legacy keys for upgrade preservation.
- **`lib/selectors.ts`** — All YouTube CSS selectors centralized.
- **`lib/hide-content.ts`** — Hide rules split into per-rule helpers (`applySidebarRule`, `applyReelShelves`, `applyRichShelves`) composed by `applyHiding(prefs)`.
- **`public/icons/`** — Extension icons (auto-served by WXT).

The MutationObserver reads preferences from the closure variable (refreshed by `watchPreferences`) instead of hitting `chrome.storage` on every callback.

## Key Patterns

- **Adding a new preference:** add a new `storage.defineItem` in `lib/preferences.ts`, extend the `Preferences` type and `getPreferences`/`watchPreferences`, add the matching checkbox in `entrypoints/popup/index.html` + `main.ts`. The default lives in `defineItem`'s `fallback` and nowhere else.
- **Storage key preservation:** never rename the literal keys passed to `defineItem`. They map directly to `chrome.storage.sync` keys, and renaming would orphan existing users' preferences.
- **YouTube DOM brittleness:** all selectors live in `lib/selectors.ts`. When YouTube's structure changes, fix selectors there. Hide rules in `lib/hide-content.ts` shouldn't need updating unless the rule logic itself changes.
- **One-way reel shelf hide:** `applyReelShelves` only hides; it never restores. Intentional, preserved from the original implementation.

## Releasing

Version is the `version` field in `package.json` (WXT auto-injects it into the generated manifest). To cut a release:

```sh
npm version patch    # or minor / major — bumps version, commits, tags
npm run zip          # creates .output/yt-focus-<version>-chrome.zip
# upload the zip to the Chrome Web Store dashboard manually
git push --follow-tags
```

`npm version` will refuse to run on a dirty working tree.

## Code Style

- 2-space indentation (TypeScript convention).
- Prefer `const` over `let`; descriptive variable names.
- Use WXT's typed `storage.defineItem` for new preferences (don't reach for `chrome.storage` directly).
- Add new YouTube selectors to `lib/selectors.ts`, not inline in hide logic.
- Prefer `for...of` over `forEach` for DOM iteration (better stack traces).
- Comments only when the *why* is non-obvious.
