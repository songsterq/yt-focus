# WXT + TypeScript Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the YouTube Focus Chrome extension from vanilla JS + hand-rolled `release.sh` to WXT + TypeScript, while splitting `content.js` into focused modules and preserving all current behavior.

**Architecture:** Adopt WXT's entrypoint convention (`entrypoints/`) for the content script and popup. Extract shared logic into a `lib/` directory with three focused modules: typed preferences (single source of defaults), centralized YouTube selectors, and composable hide rules. Replace `release.sh` with `npm version` + `wxt zip`.

**Tech Stack:** WXT (latest 0.20.x), TypeScript, npm. No UI framework, no test framework, no linter (matches current minimalism — non-goals from the spec).

**Spec reference:** [/Users/songqian/.claude/plans/i-want-to-adopt-jaunty-starfish.md](/Users/songqian/.claude/plans/i-want-to-adopt-jaunty-starfish.md)

**Note on TDD:** The spec explicitly excludes adding a test framework. This plan substitutes the test step with `tsc --noEmit` + `wxt build` (compile checks) and an explicit end-to-end browser verification phase. Each phase ends with a verification step before commit.

---

## File Structure

After execution, the repo looks like this (matches spec's "Final Repo Layout"):

```
yt-focus/
├── entrypoints/
│   ├── content.ts
│   └── popup/
│       ├── index.html
│       └── main.ts
├── lib/
│   ├── preferences.ts
│   ├── selectors.ts
│   └── hide-content.ts
├── public/
│   └── icons/                  (moved from /icons)
├── wxt.config.ts
├── package.json
├── tsconfig.json
├── .gitignore                  (updated)
├── README.md                   (updated)
├── AGENTS.md                   (updated)
├── CLAUDE.md                   (updated)
└── docs/superpowers/
    ├── specs/                  (link to brainstorm spec lives in /Users/songqian/.claude/plans/)
    └── plans/2026-05-02-wxt-typescript-migration.md  (this file)
```

**Files deleted:** `content.js`, `popup.js`, `popup.html`, `manifest.json`, `release.sh`, `build/`.

---

## Phase 1: Bootstrap WXT + TypeScript

Goal: get a working WXT skeleton in the repo. After this phase, `npm run dev` launches a Chromium with an empty extension loaded; we haven't ported the YouTube logic yet.

### Task 1: Create `package.json`

**Files:**
- Create: `/Users/songqian/code/songsterq/yt-focus/package.json`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "yt-focus",
  "version": "1.0.4",
  "description": "Hide YouTube Shorts and Playables to reduce distractions and focus on long-form content that matters to you.",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "compile": "wxt build --debug && tsc --noEmit",
    "zip": "wxt zip",
    "postinstall": "wxt prepare"
  },
  "devDependencies": {
    "wxt": "^0.20.0",
    "typescript": "^5.5.0",
    "@types/chrome": "^0.0.270"
  }
}
```

Notes:
- Version `1.0.4` matches the current `manifest.json` so existing CWS users see no version regression.
- `postinstall: wxt prepare` regenerates `.wxt/tsconfig.json` after every install — required for TS to resolve WXT's auto-imports.
- `private: true` prevents accidental publish to npm.

### Task 2: Create `wxt.config.ts`

**Files:**
- Create: `/Users/songqian/code/songsterq/yt-focus/wxt.config.ts`

- [ ] **Step 1: Write `wxt.config.ts`**

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'YouTube Focus',
    description:
      'Hide YouTube Shorts and Playables to reduce distractions and focus on long-form content that matters to you.',
    permissions: ['storage'],
    icons: {
      16: '/icons/icon16.png',
      32: '/icons/icon32.png',
      48: '/icons/icon48.png',
      128: '/icons/icon128.png',
    },
  },
});
```

Notes:
- `version` is auto-injected by WXT from `package.json` — do NOT set it here.
- Icon paths are absolute (`/icons/...`) because anything under `public/` is served at root.
- `permissions: ['storage']` matches current manifest exactly.

### Task 3: Create `tsconfig.json`

**Files:**
- Create: `/Users/songqian/code/songsterq/yt-focus/tsconfig.json`

- [ ] **Step 1: Write `tsconfig.json`**

```json
{
  "extends": "./.wxt/tsconfig.json"
}
```

Notes: WXT generates `.wxt/tsconfig.json` (with paths, lib, types, etc.) on `wxt prepare`. Our root tsconfig just extends it.

### Task 4: Update `.gitignore`

**Files:**
- Modify: `/Users/songqian/code/songsterq/yt-focus/.gitignore`

- [ ] **Step 1: Append WXT/Node ignores**

After the existing content, append:

```
# Node
node_modules/

# WXT
.output/
.wxt/
```

Final `.gitignore`:

```
# macOS system files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Chrome Extension development
*.pem
*.crx

# Build output
build/

# Node
node_modules/

# WXT
.output/
.wxt/
```

(Keep the `build/` line — old build dir gets deleted in Phase 3 but the ignore is harmless.)

### Task 5: Install dependencies

- [ ] **Step 1: Run install**

```sh
cd /Users/songqian/code/songsterq/yt-focus
npm install
```

Expected: `node_modules/` created, `package-lock.json` created, `postinstall` runs `wxt prepare` which creates `.wxt/` directory with generated `tsconfig.json`.

- [ ] **Step 2: Verify WXT prepared correctly**

```sh
ls -la .wxt/
test -f .wxt/tsconfig.json && echo "OK"
```

Expected: `OK`. The `.wxt/` directory exists with `tsconfig.json` inside.

- [ ] **Step 3: Verify TypeScript compiles (empty project still passes)**

```sh
npx tsc --noEmit
```

Expected: no output, exit 0. (No TS files yet, so nothing to fail.)

### Task 6: Smoke-test WXT dev mode

- [ ] **Step 1: Verify `wxt build` runs end-to-end**

```sh
npm run build
```

Expected: build completes, `.output/chrome-mv3/` exists with a `manifest.json`. Inspect it to confirm `"version": "1.0.4"` was injected from package.json. Note: the manifest at this point won't have content_scripts or action.popup yet (no entrypoints exist) — that's fine, this is a skeleton check.

```sh
cat .output/chrome-mv3/manifest.json
```

### Task 7: Commit Phase 1

- [ ] **Step 1: Commit**

```sh
cd /Users/songqian/code/songsterq/yt-focus
git add package.json package-lock.json wxt.config.ts tsconfig.json .gitignore
git commit -m "chore: bootstrap WXT + TypeScript

Replace plain HTML/JS structure with WXT framework. Adds
package.json with dev/build/zip/compile scripts, wxt.config.ts
holding the manifest, tsconfig.json extending WXT's generated
config, and .gitignore entries for node_modules/.output/.wxt.

The manifest.json, content.js, popup.* files still live at the
repo root and remain authoritative — they're removed in a
later commit once the WXT entrypoints are in place."
```

---

## Phase 2: Port shared `lib/` modules

Goal: create the three TypeScript modules that the entrypoints will consume. After this phase, the modules exist and `tsc --noEmit` passes, but nothing imports them yet.

### Task 8: Create `lib/selectors.ts`

**Files:**
- Create: `/Users/songqian/code/songsterq/yt-focus/lib/selectors.ts`

- [ ] **Step 1: Write the file**

```ts
export const SHORTS_SIDEBAR_LINK =
  'a[title="Shorts"], ytd-mini-guide-entry-renderer[aria-label="Shorts"]';
export const PLAYABLES_SIDEBAR_LINK = 'a[href^="/playables"]';
export const SIDEBAR_ENTRY_CONTAINER =
  'ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer';
export const REEL_SHELF = 'ytd-reel-shelf-renderer';
export const RICH_SHELF = 'ytd-rich-shelf-renderer';
export const RICH_SHELF_TITLE = 'span#title, yt-formatted-string#title';
```

These selectors are copied verbatim from the current `content.js`. When YouTube changes their DOM, this is the only file to update.

### Task 9: Create `lib/preferences.ts`

**Files:**
- Create: `/Users/songqian/code/songsterq/yt-focus/lib/preferences.ts`

- [ ] **Step 1: Write the file**

```ts
import { storage } from '#imports';

export const hideShortsPref = storage.defineItem<boolean>('sync:hideShorts', {
  fallback: true,
});

export const hidePlayablesPref = storage.defineItem<boolean>('sync:hidePlayables', {
  fallback: true,
});

export type Preferences = {
  hideShorts: boolean;
  hidePlayables: boolean;
};

export async function getPreferences(): Promise<Preferences> {
  return {
    hideShorts: await hideShortsPref.getValue(),
    hidePlayables: await hidePlayablesPref.getValue(),
  };
}

export function watchPreferences(
  cb: (prefs: Preferences) => void,
): () => void {
  const u1 = hideShortsPref.watch(() => {
    void getPreferences().then(cb);
  });
  const u2 = hidePlayablesPref.watch(() => {
    void getPreferences().then(cb);
  });
  return () => {
    u1();
    u2();
  };
}
```

Why this works:
- `'sync:hideShorts'` and `'sync:hidePlayables'` map to `chrome.storage.sync` keys `hideShorts` / `hidePlayables` — same keys the old `popup.js` and `content.js` used. Existing user prefs survive the upgrade.
- `fallback: true` is the *only* place defaults are defined (fixes the bug `CLAUDE.md` flagged).
- `#imports` is WXT's auto-import alias — `.wxt/tsconfig.json` wires it up.

**Compatibility note:** if the installed WXT version doesn't expose `storage` via `#imports`, swap the import to `import { storage } from 'wxt/storage'`. Verify by running `tsc --noEmit` after writing this file.

### Task 10: Create `lib/hide-content.ts`

**Files:**
- Create: `/Users/songqian/code/songsterq/yt-focus/lib/hide-content.ts`

- [ ] **Step 1: Write the file**

```ts
import type { Preferences } from './preferences';
import * as sel from './selectors';

function setHidden(el: Element, hidden: boolean) {
  (el as HTMLElement).style.display = hidden ? 'none' : '';
}

function applySidebarRule(linkSelector: string, hide: boolean) {
  for (const link of document.querySelectorAll(linkSelector)) {
    const container = link.closest(sel.SIDEBAR_ENTRY_CONTAINER);
    if (container) setHidden(container, hide);
  }
}

function applyReelShelves(hide: boolean) {
  if (!hide) return; // preserves current one-way hide behavior
  for (const el of document.querySelectorAll(sel.REEL_SHELF)) {
    setHidden(el, true);
  }
}

function applyRichShelves(prefs: Preferences) {
  for (const shelf of document.querySelectorAll(sel.RICH_SHELF)) {
    const title = shelf.querySelector(sel.RICH_SHELF_TITLE);
    if (!title) continue;
    const isShorts = title.textContent?.includes('Shorts') ?? false;
    const hasPlayablesLink = !!shelf.querySelector(sel.PLAYABLES_SIDEBAR_LINK);
    const shouldHide =
      (isShorts && prefs.hideShorts) ||
      (hasPlayablesLink && prefs.hidePlayables);
    setHidden(shelf, shouldHide);
  }
}

export function applyHiding(prefs: Preferences): void {
  applySidebarRule(sel.SHORTS_SIDEBAR_LINK, prefs.hideShorts);
  applySidebarRule(sel.PLAYABLES_SIDEBAR_LINK, prefs.hidePlayables);
  applyReelShelves(prefs.hideShorts);
  applyRichShelves(prefs);
}
```

Behavior preservation: `applyReelShelves` keeps the existing one-way hide (matches old `content.js` line 32-37). The rich-shelf logic mirrors the original `hideRichShelfElement` exactly.

### Task 11: Verify lib compiles

- [ ] **Step 1: Compile check**

```sh
cd /Users/songqian/code/songsterq/yt-focus
npx tsc --noEmit
```

Expected: exit 0, no errors.

If `#imports` errors with "module not found", run `npm run postinstall` (re-runs `wxt prepare`) and try again. If still failing, swap to `import { storage } from 'wxt/storage'` in `lib/preferences.ts`.

### Task 12: Commit Phase 2

- [ ] **Step 1: Commit**

```sh
git add lib/
git commit -m "refactor: extract preferences, selectors, and hide-content into lib/

Three TS modules ready for the entrypoints to consume:

- lib/preferences.ts: typed wrappers over chrome.storage.sync,
  with defaults defined exactly once. Replaces the duplicated
  defaults that lived in both content.js and popup.js.
- lib/selectors.ts: all YouTube CSS selectors centralized so
  future DOM changes hit one file.
- lib/hide-content.ts: the hide rules, split into per-rule
  helpers composed by applyHiding(prefs). Behavior-identical
  to the old hideContent() in content.js, including the
  one-way hide on reel shelves.

Nothing imports these yet; the old content.js/popup.js still
run."
```

---

## Phase 3: Port entrypoints + remove legacy files

Goal: complete the migration. After this phase, the WXT entrypoints fully replace `content.js`/`popup.html`/`popup.js`/`manifest.json`/`release.sh` and the build produces a working extension.

### Task 13: Create `entrypoints/content.ts`

**Files:**
- Create: `/Users/songqian/code/songsterq/yt-focus/entrypoints/content.ts`

- [ ] **Step 1: Write the file**

```ts
import { defineContentScript } from '#imports';
import { applyHiding } from '@/lib/hide-content';
import {
  getPreferences,
  watchPreferences,
  type Preferences,
} from '@/lib/preferences';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  async main() {
    let prefs: Preferences = await getPreferences();
    applyHiding(prefs);

    watchPreferences((next) => {
      prefs = next;
      applyHiding(prefs);
    });

    new MutationObserver(() => applyHiding(prefs)).observe(document.body, {
      childList: true,
      subtree: true,
    });
  },
});
```

Two improvements over the old `content.js`:
1. The MutationObserver no longer hits storage on every callback — it reads the cached `prefs` closure variable updated by `watchPreferences`.
2. `chrome.storage.onChanged` filtering is replaced by `watchPreferences`, which only fires for the prefs we care about.

Compatibility note: if `defineContentScript` isn't available via `#imports` in the installed WXT, use `import { defineContentScript } from 'wxt/sandbox'` (older versions) or check WXT's current docs.

### Task 14: Create `entrypoints/popup/index.html`

**Files:**
- Create: `/Users/songqian/code/songsterq/yt-focus/entrypoints/popup/index.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html>
<head>
  <title>YouTube Focus</title>
  <style>
    body {
      width: 200px;
      padding: 15px;
      font-family: Arial, sans-serif;
    }
    h2 {
      font-size: 16px;
      margin: 0 0 15px 0;
    }
    .option {
      margin: 8px 0;
      display: flex;
      align-items: center;
    }
    label {
      cursor: pointer;
      user-select: none;
      font-size: 14px;
    }
    input[type="checkbox"] {
      margin-right: 8px;
    }
    #status {
      font-size: 12px;
      color: green;
      margin-top: 10px;
      height: 15px;
    }
  </style>
</head>
<body>
  <h2>YouTube Focus</h2>
  <div class="option">
    <label>
      <input type="checkbox" id="hideShorts" checked>
      Hide Shorts
    </label>
  </div>
  <div class="option">
    <label>
      <input type="checkbox" id="hidePlayables" checked>
      Hide Playables
    </label>
  </div>
  <div id="status"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

Identical to old `popup.html` except: `<script src="popup.js">` → `<script type="module" src="./main.ts">`. WXT/Vite handles the bundling.

### Task 15: Create `entrypoints/popup/main.ts`

**Files:**
- Create: `/Users/songqian/code/songsterq/yt-focus/entrypoints/popup/main.ts`

- [ ] **Step 1: Write the file**

```ts
import { hideShortsPref, hidePlayablesPref } from '@/lib/preferences';

const shortsCheckbox = document.querySelector<HTMLInputElement>('#hideShorts')!;
const playablesCheckbox =
  document.querySelector<HTMLInputElement>('#hidePlayables')!;
const status = document.querySelector<HTMLElement>('#status')!;

function flashStatus() {
  status.textContent = 'Settings saved';
  setTimeout(() => {
    status.textContent = '';
  }, 1500);
}

async function init() {
  shortsCheckbox.checked = await hideShortsPref.getValue();
  playablesCheckbox.checked = await hidePlayablesPref.getValue();
}

shortsCheckbox.addEventListener('change', async () => {
  await hideShortsPref.setValue(shortsCheckbox.checked);
  flashStatus();
});

playablesCheckbox.addEventListener('change', async () => {
  await hidePlayablesPref.setValue(playablesCheckbox.checked);
  flashStatus();
});

void init();
```

Same behavior as old `popup.js` (read prefs on load, write on toggle, flash "Settings saved" for 1.5s).

### Task 16: Move icons to `public/`

- [ ] **Step 1: Move with git**

```sh
cd /Users/songqian/code/songsterq/yt-focus
mkdir -p public
git mv icons public/icons
```

Expected: `public/icons/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` exist; `icons/` no longer exists at the repo root.

### Task 17: Verify build with new entrypoints

- [ ] **Step 1: Build**

```sh
npm run compile
```

Expected: `wxt build --debug` succeeds, then `tsc --noEmit` exits 0.

- [ ] **Step 2: Inspect generated manifest**

```sh
cat .output/chrome-mv3/manifest.json
```

Expected JSON contains:
- `"version": "1.0.4"`
- `"name": "YouTube Focus"`
- `"permissions": ["storage"]`
- `"content_scripts"` with `matches: ["*://*.youtube.com/*"]`
- `"action"` with a popup HTML reference
- `"icons"` with 16/32/48/128 entries

If any field is missing, fix the entrypoint or `wxt.config.ts` before continuing.

### Task 18: Delete legacy files

- [ ] **Step 1: Remove old source files**

```sh
cd /Users/songqian/code/songsterq/yt-focus
git rm content.js popup.js popup.html manifest.json release.sh
rm -rf build/
```

Note: `build/` is gitignored so `git rm` doesn't apply; just `rm -rf` it. (It's recreated as `.output/` by WXT, also gitignored.)

- [ ] **Step 2: Verify the repo only has WXT-shaped sources**

```sh
ls -1
```

Expected (top-level visible files/dirs): `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/`, `entrypoints/`, `icons/` should be GONE, `lib/`, `package.json`, `package-lock.json`, `public/`, `tsconfig.json`, `wxt.config.ts`. Plus hidden: `.git/`, `.gitignore`, `.output/`, `.wxt/`, `.claude/`, `.superpowers/`, `node_modules/`.

- [ ] **Step 3: Re-verify build still passes after deletes**

```sh
npm run compile
```

Expected: still passes. (If a stale reference to a deleted file existed it would surface here.)

### Task 19: Commit Phase 3

- [ ] **Step 1: Commit**

```sh
git add entrypoints/ public/
git commit -m "feat: migrate to WXT entrypoints, remove legacy files

Move the content script and popup into WXT's entrypoints/
convention, consuming the lib/ modules added in the prior
commit. Move icons to public/ so WXT serves them. Delete
the now-redundant root-level manifest.json, content.js,
popup.js, popup.html, release.sh, and build/.

User-visible behavior is preserved exactly (storage keys
unchanged, hide rules identical including the one-way reel
shelf hide, popup UI identical). The MutationObserver in
the content script no longer hits chrome.storage on every
callback — it reads from a cached preferences closure
updated by watchPreferences."
```

---

## Phase 4: End-to-end browser verification

Goal: confirm the rebuilt extension behaves identically to the old one. This is the equivalent of integration tests for this codebase. **No commit at the end of this phase unless a fix was needed.**

### Task 20: Run dev mode and verify hide rules

- [ ] **Step 1: Start dev mode**

```sh
cd /Users/songqian/code/songsterq/yt-focus
npm run dev
```

Expected: Chromium launches with the extension auto-loaded.

- [ ] **Step 2: Visit youtube.com and verify each hide scenario**

Navigate to `https://www.youtube.com` in the dev Chromium and confirm:

- [ ] Shorts link in the left sidebar is hidden (expanded sidebar)
- [ ] Shorts in the collapsed/mini sidebar is hidden
- [ ] Playables link in the left sidebar is hidden
- [ ] "Shorts" rich shelf on the homepage is hidden
- [ ] Playables rich shelf on the homepage is hidden (if one appears in the feed)
- [ ] Reel shelves on the homepage are hidden
- [ ] Reel shelves on a video watch page (recommendations sidebar) are hidden

If any scenario fails, the most likely culprit is a selector mismatch — check `lib/selectors.ts` against the current YouTube DOM and update if needed.

### Task 21: Verify popup interaction

- [ ] **Step 1: Open the popup**

Click the extension icon in the dev Chromium toolbar.

- [ ] **Step 2: Verify initial state**

Both checkboxes should be checked (the defaults).

- [ ] **Step 3: Toggle "Hide Shorts" off**

- [ ] Sidebar Shorts link reappears immediately
- [ ] Shorts rich shelves reappear immediately
- [ ] Reel shelves remain hidden (preserved one-way hide behavior — this is intentional)
- [ ] Status text "Settings saved" flashes for ~1.5s

- [ ] **Step 4: Toggle "Hide Shorts" back on**

- [ ] Sidebar Shorts link hides again
- [ ] Shorts rich shelves hide again

- [ ] **Step 5: Repeat steps 3-4 for "Hide Playables"**

### Task 22: Verify persistence

- [ ] **Step 1: Toggle a preference off, close popup, reload the YouTube tab**

- [ ] After reload, the preference is still off (state was saved to `chrome.storage.sync`)

### Task 23: Verify production build

- [ ] **Step 1: Build production output**

```sh
# stop dev mode (Ctrl-C)
npm run build
```

- [ ] **Step 2: Load the production build manually**

In a regular Chrome (not the dev Chromium), go to `chrome://extensions/`, enable Developer mode, click "Load unpacked", and select `/Users/songqian/code/songsterq/yt-focus/.output/chrome-mv3`.

- [ ] **Step 3: Re-verify Tasks 20-22 with the production build**

Same scenarios, but using the production build. Confirms that the dev-mode bundling didn't hide any production-only issues.

### Task 24: Verify upgrade preserves user preferences

This is the key check that the `'sync:hideShorts'` / `'sync:hidePlayables'` keys in `defineItem` map to the same `chrome.storage.sync` keys the old extension used.

- [ ] **Step 1: Set up an "old version" baseline**

Before installing the new build:
- Install or keep the production v1.0.4 from the Chrome Web Store (or load the old unpacked from a prior git commit).
- Open the popup, toggle "Hide Shorts" OFF.
- Verify it's off (Shorts return on YouTube).

- [ ] **Step 2: Install the new build over the old**

Remove the old v1.0.4 extension from `chrome://extensions/`. Load the new unpacked build from `.output/chrome-mv3/`.

- [ ] **Step 3: Verify the preference carried over**

Open the popup. "Hide Shorts" should still be unchecked. Visit YouTube — Shorts should still be visible (preference preserved).

If this check fails, the storage keys diverge between old and new. Inspect with `chrome.storage.sync.get(null, console.log)` in the popup devtools to see what keys exist.

### Task 25: Conditional commit if any fix was applied during verification

- [ ] **Step 1: Commit any fixes**

If you needed to update selectors, fix a bug, or adjust an entrypoint during Tasks 20-24, commit it now:

```sh
git add -p
git commit -m "fix: <describe the fix found during verification>"
```

If no fixes were needed, skip this commit.

---

## Phase 5: Documentation updates

Goal: update the human-/agent-facing docs to reflect the new workflow.

### Task 26: Update `README.md`

**Files:**
- Modify: `/Users/songqian/code/songsterq/yt-focus/README.md`

The README currently has two sections that mention loading the extension: `## Installation` (steps 1-5, treating the repo root as the unpacked extension directory) and `## Development` (steps 1-4, "make changes then refresh in chrome://extensions/"). Both must be replaced.

- [ ] **Step 1: Replace the `## Installation` section**

Replace the entire block from `## Installation` up to (but not including) `## How it works` with:

```markdown
## Installation

End users: install from the [Chrome Web Store](https://chromewebstore.google.com/detail/youtube-focus/dppgailgbpncddkeccgfiplmdonfloja).

To install from source:

```sh
npm install
npm run build
```

Then open `chrome://extensions/`, enable "Developer mode" in the top right, click "Load unpacked", and select the `.output/chrome-mv3/` directory.
```

- [ ] **Step 2: Replace the `## Development` section**

Replace the entire block from `## Development` up to (but not including) `## License` with:

```markdown
## Development

Requires Node.js 18+. Built with [WXT](https://wxt.dev) + TypeScript.

```sh
npm install
npm run dev
```

`npm run dev` launches a Chromium instance with the extension auto-loaded and HMR enabled — code changes reload automatically without a manual refresh.

Other useful scripts:

```sh
npm run build       # production bundle in .output/chrome-mv3/
npm run compile     # type-check only (wxt build --debug + tsc --noEmit)
npm run zip         # zip for the Chrome Web Store: .output/yt-focus-<version>-chrome.zip
```
```

Keep `## Features`, `## How it works`, and `## License` as-is.

### Task 27: Rewrite `AGENTS.md`

**Files:**
- Modify: `/Users/songqian/code/songsterq/yt-focus/AGENTS.md`

The file is short (~26 lines, three sections). Easier to replace it wholesale than chase line numbers that shifted during prior phases.

- [ ] **Step 1: Overwrite the entire file with the new content**

Replace the full contents of `AGENTS.md` with:

```markdown
# YouTube Focus - Agent Guide

## Commands

**Setup:** `npm install`

**Build:** `npm run build` (outputs to `.output/chrome-mv3/`)

**Lint:** N/A (no linter configured)

**Test:** N/A (no test framework configured)

**Compile-check:** `npm run compile` (runs `wxt build --debug && tsc --noEmit`)

**Dev Server:** `npm run dev` (launches Chromium with HMR)

**Release:** `npm version patch && npm run zip` (then upload `.output/yt-focus-<version>-chrome.zip` to the Chrome Web Store dashboard, then `git push --follow-tags`)

## Tech Stack & Architecture

- **Platform:** Chrome Extension (Manifest V3), built with WXT
- **Language:** TypeScript
- **Structure:**
  - `entrypoints/content.ts` — content script injected into YouTube pages
  - `entrypoints/popup/` — popup UI (vanilla TS + HTML)
  - `lib/preferences.ts` — typed wrappers over `chrome.storage.sync`, single source for defaults
  - `lib/selectors.ts` — centralized YouTube CSS selectors
  - `lib/hide-content.ts` — hide rules composed from per-rule helpers
  - `wxt.config.ts` — manifest config (version comes from `package.json`)
  - `public/icons/` — extension icons

## Code Style

- Use 2-space indentation (TypeScript convention)
- Prefer `const` over `let`, descriptive variable names
- Use WXT's typed `storage.defineItem` for new preferences (don't reach for `chrome.storage` directly)
- Add new YouTube selectors to `lib/selectors.ts`, not inline
- Prefer `for...of` over `forEach` for DOM iteration (better stack traces)
```

### Task 28: Update `CLAUDE.md`

**Files:**
- Modify: `/Users/songqian/code/songsterq/yt-focus/CLAUDE.md`

- [ ] **Step 1: Rewrite the Development section**

Replace the "Development" section with:

```markdown
## Development

Built with WXT (Vite-based extension framework) and TypeScript.

**Setup:** `npm install`

**Dev:** `npm run dev` — launches Chromium with the extension loaded and HMR enabled.

**Build:** `npm run build` — outputs to `.output/chrome-mv3/`.

**Compile-check:** `npm run compile` — runs `wxt build --debug && tsc --noEmit`. Use this to verify TS soundness without launching a browser.

**Zip for Chrome Web Store:** `npm run zip` — outputs `.output/yt-focus-<version>-chrome.zip`.
```

- [ ] **Step 2: Rewrite the Architecture section**

Replace the "Architecture" section with:

```markdown
## Architecture

WXT entrypoints (`entrypoints/`) and shared library modules (`lib/`):

- **`wxt.config.ts`** — Manifest V3 config (name, description, permissions, icons). The version field is auto-injected from `package.json`.
- **`entrypoints/content.ts`** — Content script for `*://*.youtube.com/*`. Reads preferences once, then `applyHiding(prefs)` is invoked on initial load, on preference change (via `watchPreferences`), and on every DOM mutation (via `MutationObserver` on `document.body`).
- **`entrypoints/popup/index.html` + `main.ts`** — Popup UI. Three checkboxes wired to the typed prefs.
- **`lib/preferences.ts`** — Typed `storage.defineItem` wrappers over `chrome.storage.sync`. Defaults are defined exactly once here (`fallback: true`), eliminating the duplicated-defaults bug the old vanilla-JS structure had.
- **`lib/selectors.ts`** — All YouTube CSS selectors. When YouTube changes their DOM, this is the file to update.
- **`lib/hide-content.ts`** — Hide rules split into per-rule helpers (`applySidebarRule`, `applyReelShelves`, `applyRichShelves`) composed by `applyHiding(prefs)`.

The MutationObserver reads preferences from a closure variable (refreshed by `watchPreferences`), not by hitting `chrome.storage` on every callback.
```

- [ ] **Step 3: Rewrite the Key Patterns section**

Replace the "Key Patterns" section with:

```markdown
## Key Patterns

- **Adding a new preference:** add a new `storage.defineItem` in `lib/preferences.ts`, extend the `Preferences` type and `getPreferences`/`watchPreferences`, add the matching checkbox in `popup/index.html` + `main.ts`. The default lives in `defineItem`'s `fallback` and nowhere else.
- **YouTube DOM brittleness:** All selectors live in `lib/selectors.ts`. When YouTube's structure changes, fix selectors there. The hide rules in `lib/hide-content.ts` shouldn't need updating unless the rule logic itself changes.
- **One-way reel shelf hide:** `applyReelShelves` only hides; it never restores. This is intentional and matches behavior from the original implementation.
```

- [ ] **Step 4: Update the Releasing section**

Replace the "Releasing" section with:

```markdown
## Releasing

Version is the `version` field in `package.json` (WXT auto-injects it into the generated manifest). To cut a release:

```sh
npm version patch     # or minor / major — bumps version, commits, tags
npm run zip           # creates .output/yt-focus-<version>-chrome.zip
# upload the zip to the Chrome Web Store dashboard manually
git push --follow-tags
```

`npm version` will refuse to run on a dirty working tree.
```

### Task 29: Verify docs are accurate

- [ ] **Step 1: Read each updated file**

```sh
cat README.md
cat AGENTS.md
cat CLAUDE.md
```

- [ ] **Step 2: Sanity-check every command in the docs**

For each `npm run X` mentioned in the docs, confirm it exists in `package.json` scripts. They should all match: `dev`, `build`, `compile`, `zip`, `postinstall`.

### Task 30: Commit Phase 5

- [ ] **Step 1: Commit**

```sh
git add README.md AGENTS.md CLAUDE.md
git commit -m "docs: update for WXT + TypeScript workflow

Rewrite Development, Architecture, Key Patterns, and
Releasing sections in CLAUDE.md and the equivalents in
README.md and AGENTS.md to reflect the new structure
(entrypoints/, lib/, wxt.config.ts, npm scripts) and the
two-command release flow that replaces release.sh."
```

---

## Phase 6: Release dry-run verification

Goal: prove the new release workflow produces a valid CWS-uploadable zip with a correctly bumped version. **No commits in this phase.**

### Task 31: Verify `wxt zip` output at current version

- [ ] **Step 1: Produce the zip**

```sh
cd /Users/songqian/code/songsterq/yt-focus
npm run zip
```

Expected: `.output/yt-focus-1.0.4-chrome.zip` exists.

- [ ] **Step 2: Inspect zip contents**

```sh
unzip -l .output/yt-focus-1.0.4-chrome.zip
```

Expected: contains `manifest.json`, content script bundle, popup HTML/JS, and `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, `icons/icon128.png`.

- [ ] **Step 3: Verify the manifest in the zip has the right version**

```sh
unzip -p .output/yt-focus-1.0.4-chrome.zip manifest.json | grep '"version"'
```

Expected: `"version": "1.0.4"`.

### Task 32: Dry-run `npm version` on a scratch branch

- [ ] **Step 1: Create scratch branch from current HEAD**

```sh
git checkout -b scratch/release-dry-run
```

- [ ] **Step 2: Bump patch version**

```sh
npm version patch
```

Expected:
- `package.json` version becomes `1.0.5`.
- A commit is created (`v1.0.5`).
- A git tag `v1.0.5` is created pointing at that commit.

- [ ] **Step 3: Build the zip**

```sh
npm run zip
```

Expected: `.output/yt-focus-1.0.5-chrome.zip` exists. Verify:

```sh
unzip -p .output/yt-focus-1.0.5-chrome.zip manifest.json | grep '"version"'
```

Expected: `"version": "1.0.5"`.

- [ ] **Step 4: Reset the scratch branch (do NOT push the dummy tag)**

```sh
git checkout main
git tag -d v1.0.5
git branch -D scratch/release-dry-run
rm -f .output/yt-focus-1.0.5-chrome.zip
```

Expected: tag and branch removed; main is clean and on `1.0.4`.

- [ ] **Step 5: Confirm clean main**

```sh
git log --oneline -5
git tag -l 'v1.0.*'
cat package.json | grep version
```

Expected: log shows the documentation commit on top, no `v1.0.5` tag exists, package.json still says `1.0.4`.

---

## Final State

After all phases complete:
- Repo is fully migrated to WXT + TypeScript.
- Four commits added to main: `chore: bootstrap WXT...`, `refactor: extract preferences...`, `feat: migrate to WXT entrypoints...`, `docs: update for WXT...`. (Plus optionally a `fix:` commit from Phase 4.)
- All current behavior preserved. User preferences persist across the upgrade.
- Release flow is `npm version <bump> && npm run zip`; no `release.sh` to maintain.
- The `lib/` split gives future feature work somewhere to land.
