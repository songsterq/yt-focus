# Hidden-Count Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a numeric pill on the right edge of the "Hide Shorts" and "Hide Playables" rows in the popup, displaying the all-time count of shelves the extension has hidden on this device.

**Architecture:** A new `lib/hidden-counter.ts` module owns two `chrome.storage.local` integers and a per-content-script counter that uses a `WeakSet<Element>` to dedupe re-counted shelves and a 1-second debounce to flush pending increments. `applyHiding` is changed to return the elements it transitioned from visible to hidden. The content script feeds those elements into the counter. The popup reads the stored values, formats with `Number.toLocaleString()`, and subscribes to live updates via `storage.onChanged`.

**Tech Stack:** TypeScript, WXT, `chrome.storage.local` (via WXT's `storage.defineItem`), no test framework (manual verification + `npm run compile`).

**Spec:** `docs/superpowers/specs/2026-05-09-hidden-count-pill-design.md`

**Note on TDD:** This project has no test framework (per `AGENTS.md`). Tasks use bite-sized steps, frequent commits, `npm run compile` for type-soundness, and a final manual verification checklist instead of automated tests.

---

## File Map

- **Create** `lib/hidden-counter.ts` — storage items, `getHiddenCounts`, `watchHiddenCounts`, `createHiddenCounter` factory.
- **Modify** `lib/hide-content.ts` — change `applyHiding` to return `{ shortsShelves, playablesShelves }` of newly-hidden elements; add transition tracking inside `applyReelShelves` and `applyRichShelves`.
- **Modify** `entrypoints/content.ts` — instantiate the counter, pass returned shelves to `recordHidden`, flush on `pagehide` / `visibilitychange='hidden'` / `ctx.onInvalidated`.
- **Modify** `entrypoints/popup/index.html` — add two `<span class="count-pill">` elements and the `.count-pill` CSS rule.
- **Modify** `entrypoints/popup/main.ts` — read counts on load, render with `toLocaleString`, toggle pill visibility based on each pref's checked state, subscribe to `watchHiddenCounts` for live updates.

---

## Task 1: Add read API to `lib/hidden-counter.ts`

Builds the module's "read side" first: storage items, type, `getHiddenCounts`, `watchHiddenCounts`. The write side (`createHiddenCounter`) comes in Task 2. Splitting lets us land each piece independently and keeps each diff small.

**Files:**
- Create: `lib/hidden-counter.ts`

- [ ] **Step 1: Create `lib/hidden-counter.ts` with the read API.**

```ts
import { storage } from '#imports';

export type HiddenCounts = { shorts: number; playables: number };

export const shortsHiddenCountPref = storage.defineItem<number>(
  'local:shortsHiddenCount',
  { fallback: 0 },
);

export const playablesHiddenCountPref = storage.defineItem<number>(
  'local:playablesHiddenCount',
  { fallback: 0 },
);

function safeInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

export async function getHiddenCounts(): Promise<HiddenCounts> {
  const [shorts, playables] = await Promise.all([
    shortsHiddenCountPref.getValue(),
    playablesHiddenCountPref.getValue(),
  ]);
  return { shorts: safeInt(shorts), playables: safeInt(playables) };
}

export function watchHiddenCounts(
  cb: (counts: HiddenCounts) => void,
): () => void {
  const refresh = () => {
    void getHiddenCounts().then(cb);
  };
  const u1 = shortsHiddenCountPref.watch(refresh);
  const u2 = playablesHiddenCountPref.watch(refresh);
  return () => {
    u1();
    u2();
  };
}
```

- [ ] **Step 2: Verify TS compiles.**

Run: `npm run compile`
Expected: exits 0 with no errors. Both `shortsHiddenCountPref` and `playablesHiddenCountPref` are exported and unused — that's fine, Task 2 will use them and the project has no `noUnusedLocals` enforcement on exported symbols.

- [ ] **Step 3: Commit.**

```bash
git add lib/hidden-counter.ts
git commit -m "feat(counter): add read API for hidden-shelf counters"
```

---

## Task 2: Add `createHiddenCounter` (write API) to `lib/hidden-counter.ts`

Adds the per-content-script counter factory: WeakSet-based dedup, debounced flush via read-modify-write, immediate flush on demand.

**Files:**
- Modify: `lib/hidden-counter.ts`

- [ ] **Step 1: Append the write API to `lib/hidden-counter.ts`.**

Add at the bottom of the file:

```ts
export type HiddenCounter = {
  recordHidden(kind: 'shorts' | 'playables', els: Iterable<Element>): void;
  flush(): Promise<void>;
};

const FLUSH_DEBOUNCE_MS = 1000;

export function createHiddenCounter(): HiddenCounter {
  const seen = {
    shorts: new WeakSet<Element>(),
    playables: new WeakSet<Element>(),
  };
  const pending = { shorts: 0, playables: 0 };
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function doFlush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const dShorts = pending.shorts;
    const dPlayables = pending.playables;
    if (dShorts === 0 && dPlayables === 0) return;
    pending.shorts = 0;
    pending.playables = 0;
    const tasks: Promise<void>[] = [];
    if (dShorts > 0) {
      tasks.push(
        shortsHiddenCountPref.getValue().then((cur) =>
          shortsHiddenCountPref.setValue(safeInt(cur) + dShorts),
        ),
      );
    }
    if (dPlayables > 0) {
      tasks.push(
        playablesHiddenCountPref.getValue().then((cur) =>
          playablesHiddenCountPref.setValue(safeInt(cur) + dPlayables),
        ),
      );
    }
    await Promise.all(tasks);
  }

  function scheduleFlush() {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void doFlush();
    }, FLUSH_DEBOUNCE_MS);
  }

  return {
    recordHidden(kind, els) {
      let added = 0;
      for (const el of els) {
        if (seen[kind].has(el)) continue;
        seen[kind].add(el);
        added++;
      }
      if (added === 0) return;
      pending[kind] += added;
      scheduleFlush();
    },
    flush: doFlush,
  };
}
```

- [ ] **Step 2: Verify TS compiles.**

Run: `npm run compile`
Expected: exits 0 with no errors.

- [ ] **Step 3: Commit.**

```bash
git add lib/hidden-counter.ts
git commit -m "feat(counter): add createHiddenCounter with debounced flush"
```

---

## Task 3: Change `applyHiding` to return newly-hidden shelves

Updates `lib/hide-content.ts` so the function returns `{ shortsShelves, playablesShelves }` containing only elements that transitioned from visible (`display !== 'none'`) to hidden (`display === 'none'`) during this call.

**Files:**
- Modify: `lib/hide-content.ts`

- [ ] **Step 1: Replace the contents of `lib/hide-content.ts`.**

```ts
import type { Preferences } from './preferences';
import * as sel from './selectors';

export type HiddenShelves = {
  shortsShelves: Element[];
  playablesShelves: Element[];
};

function isHidden(el: Element): boolean {
  return (el as HTMLElement).style.display === 'none';
}

function setHidden(el: Element, hidden: boolean) {
  (el as HTMLElement).style.display = hidden ? 'none' : '';
}

function applySidebarRule(linkSelector: string, hide: boolean) {
  for (const link of document.querySelectorAll(linkSelector)) {
    const container = link.closest(sel.SIDEBAR_ENTRY_CONTAINER);
    if (container) setHidden(container, hide);
  }
}

function applyReelShelves(hide: boolean): Element[] {
  if (!hide) return [];
  const transitioned: Element[] = [];
  for (const el of document.querySelectorAll(sel.REEL_SHELF)) {
    if (isHidden(el)) continue;
    setHidden(el, true);
    transitioned.push(el);
  }
  return transitioned;
}

function applyRichShelves(prefs: Preferences): {
  shorts: Element[];
  playables: Element[];
} {
  const shortsHits: Element[] = [];
  const playablesHits: Element[] = [];
  for (const shelf of document.querySelectorAll(sel.RICH_SHELF)) {
    const title = shelf.querySelector(sel.RICH_SHELF_TITLE);
    if (!title) continue;
    const isShorts = title.textContent?.includes('Shorts') ?? false;
    // Note: PLAYABLES_SIDEBAR_LINK is reused here as a presence probe inside
    // the shelf — same selector, different context from the sidebar usage.
    const hasPlayables = !!shelf.querySelector(sel.PLAYABLES_SIDEBAR_LINK);
    const shouldHideAsShorts = isShorts && prefs.hideShorts;
    const shouldHideAsPlayables = hasPlayables && prefs.hidePlayables;
    const shouldHide = shouldHideAsShorts || shouldHideAsPlayables;
    const wasHidden = isHidden(shelf);
    setHidden(shelf, shouldHide);
    if (shouldHide && !wasHidden) {
      // Prefer shorts categorization when both apply (a Shorts-titled shelf
      // could in theory contain a playables link).
      if (shouldHideAsShorts) shortsHits.push(shelf);
      else playablesHits.push(shelf);
    }
  }
  return { shorts: shortsHits, playables: playablesHits };
}

export function applyHiding(prefs: Preferences): HiddenShelves {
  applySidebarRule(sel.SHORTS_SIDEBAR_LINK, prefs.hideShorts);
  applySidebarRule(sel.PLAYABLES_SIDEBAR_LINK, prefs.hidePlayables);
  const reelShorts = applyReelShelves(prefs.hideShorts);
  const rich = applyRichShelves(prefs);
  return {
    shortsShelves: [...reelShorts, ...rich.shorts],
    playablesShelves: rich.playables,
  };
}
```

- [ ] **Step 2: Verify TS compiles.**

Run: `npm run compile`
Expected: exits 0 with no errors. (The caller in `entrypoints/content.ts` ignores the return value as a plain expression statement, so the new return type does not break it.)

- [ ] **Step 3: Commit.**

```bash
git add lib/hide-content.ts
git commit -m "feat(hide): return newly-hidden shelves from applyHiding"
```

---

## Task 4: Wire counter into the content script

Instantiates the counter, pipes hidden shelves into `recordHidden` on every `applyHiding` call, and flushes pending deltas on tab-hidden / unload / context invalidation.

**Files:**
- Modify: `entrypoints/content.ts`

- [ ] **Step 1: Replace the contents of `entrypoints/content.ts`.**

```ts
import { defineContentScript } from '#imports';
import { applyHiding } from '@/lib/hide-content';
import { createHiddenCounter } from '@/lib/hidden-counter';
import {
  getPreferences,
  watchPreferences,
  type Preferences,
} from '@/lib/preferences';
import { startDualSubtitles } from '@/lib/subtitles/controller';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  async main(ctx) {
    let prefs: Preferences = await getPreferences();
    console.log('[yt-focus][content] loaded', prefs);

    const counter = createHiddenCounter();

    const runHide = () => {
      const { shortsShelves, playablesShelves } = applyHiding(prefs);
      counter.recordHidden('shorts', shortsShelves);
      counter.recordHidden('playables', playablesShelves);
    };

    runHide();

    const dual = startDualSubtitles(ctx, prefs);

    const unwatch = watchPreferences((next) => {
      prefs = next;
      runHide();
      dual.updatePrefs(prefs);
    });
    ctx.onInvalidated(unwatch);

    const observer = new MutationObserver(runHide);
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => observer.disconnect());

    const flushOnHide = () => {
      void counter.flush();
    };
    addEventListener('pagehide', flushOnHide);
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    };
    document.addEventListener('visibilitychange', onVisChange);
    ctx.onInvalidated(() => {
      removeEventListener('pagehide', flushOnHide);
      document.removeEventListener('visibilitychange', onVisChange);
      void counter.flush();
    });
  },
});
```

- [ ] **Step 2: Verify TS compiles.**

Run: `npm run compile`
Expected: exits 0 with no errors.

- [ ] **Step 3: Commit.**

```bash
git add entrypoints/content.ts
git commit -m "feat(content): increment hidden counters on hide events"
```

---

## Task 5: Add pill markup and CSS to popup HTML

Adds the two `<span class="count-pill">` elements next to the Shorts/Playables labels and the `.count-pill` CSS rule. No behavior wiring yet — that's Task 6. Pills start hidden via the `hidden` attribute so the popup looks unchanged until Task 6 lands.

**Files:**
- Modify: `entrypoints/popup/index.html`

- [ ] **Step 1: Add the `.count-pill` CSS rule.**

In `entrypoints/popup/index.html`, locate the `#status` block in the `<style>` section (around lines 117-124) and insert the following rule **immediately before** it:

```css
    .count-pill {
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--fg-muted);
      background: var(--hover-bg);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 1px 8px;
      min-width: 24px;
      text-align: center;
      user-select: none;
    }
```

- [ ] **Step 2: Add pill spans to the two option rows.**

Replace the two option rows in the "Reduce Distractions" section (currently around lines 189-196) so they contain the pill spans:

```html
    <div class="option">
      <input type="checkbox" id="hideShorts">
      <label for="hideShorts">Hide Shorts</label>
      <span class="count-pill" id="shortsHiddenCount" hidden>0</span>
    </div>
    <div class="option">
      <input type="checkbox" id="hidePlayables">
      <label for="hidePlayables">Hide Playables</label>
      <span class="count-pill" id="playablesHiddenCount" hidden>0</span>
    </div>
```

- [ ] **Step 3: Verify TS compiles.**

Run: `npm run compile`
Expected: exits 0 with no errors. (HTML changes alone won't break TS, but compile also runs `wxt build --debug` which validates the HTML entrypoint exists and parses.)

- [ ] **Step 4: Commit.**

```bash
git add entrypoints/popup/index.html
git commit -m "feat(popup): add hidden-count pill markup and styles"
```

---

## Task 6: Render pills and subscribe to live updates in popup

Wires the popup script to read counts on load, render with `Number.toLocaleString()`, toggle pill visibility based on each pref's checked state, update visibility when checkboxes are toggled, and subscribe to `watchHiddenCounts` for live updates while open.

**Files:**
- Modify: `entrypoints/popup/main.ts`

- [ ] **Step 1: Update imports and add element refs.**

In `entrypoints/popup/main.ts`, replace the existing import block (lines 1-6) and the existing DOM-ref block (lines 8-20) with:

```ts
import {
  hideShortsPref,
  hidePlayablesPref,
  dualSubtitlesEnabledPref,
  secondaryLanguagePref,
} from '@/lib/preferences';
import {
  getHiddenCounts,
  watchHiddenCounts,
  type HiddenCounts,
} from '@/lib/hidden-counter';

const shortsCheckbox = document.querySelector<HTMLInputElement>('#hideShorts')!;
const playablesCheckbox =
  document.querySelector<HTMLInputElement>('#hidePlayables')!;
const dualCheckbox = document.querySelector<HTMLInputElement>(
  '#dualSubtitlesEnabled',
)!;
const secondarySelect = document.querySelector<HTMLSelectElement>(
  '#secondaryLanguage',
)!;
const secondaryOther = document.querySelector<HTMLInputElement>(
  '#secondaryLanguageOther',
)!;
const status = document.querySelector<HTMLElement>('#status')!;
const shortsPill = document.querySelector<HTMLSpanElement>('#shortsHiddenCount')!;
const playablesPill = document.querySelector<HTMLSpanElement>(
  '#playablesHiddenCount',
)!;
```

- [ ] **Step 2: Add pill render/visibility helpers.**

In `entrypoints/popup/main.ts`, insert these helpers immediately after the existing `showOtherInput` function (around line 37):

```ts
function renderCounts(counts: HiddenCounts) {
  shortsPill.textContent = counts.shorts.toLocaleString();
  playablesPill.textContent = counts.playables.toLocaleString();
}

function setPillVisible(pill: HTMLSpanElement, visible: boolean) {
  pill.hidden = !visible;
}
```

- [ ] **Step 3: Render counts and apply visibility on init.**

In `entrypoints/popup/main.ts`, modify the `init` function so it also reads counts and applies pill visibility from the loaded prefs. Replace the existing `init` function with:

```ts
async function init() {
  shortsCheckbox.checked = await hideShortsPref.getValue();
  playablesCheckbox.checked = await hidePlayablesPref.getValue();
  dualCheckbox.checked = await dualSubtitlesEnabledPref.getValue();
  const lang = await secondaryLanguagePref.getValue();
  if (KNOWN_LANGS.has(lang)) {
    secondarySelect.value = lang;
    showOtherInput(false);
  } else {
    secondarySelect.value = '__other__';
    secondaryOther.value = lang;
    showOtherInput(true);
  }
  const counts = await getHiddenCounts();
  renderCounts(counts);
  setPillVisible(shortsPill, shortsCheckbox.checked);
  setPillVisible(playablesPill, playablesCheckbox.checked);
}
```

- [ ] **Step 4: Toggle pill visibility from checkbox handlers.**

In `entrypoints/popup/main.ts`, modify the two existing checkbox change handlers so they also flip pill visibility. Replace the `shortsCheckbox` and `playablesCheckbox` `change` listeners with:

```ts
shortsCheckbox.addEventListener('change', async () => {
  await hideShortsPref.setValue(shortsCheckbox.checked);
  setPillVisible(shortsPill, shortsCheckbox.checked);
  flashStatus();
});

playablesCheckbox.addEventListener('change', async () => {
  await hidePlayablesPref.setValue(playablesCheckbox.checked);
  setPillVisible(playablesPill, playablesCheckbox.checked);
  flashStatus();
});
```

- [ ] **Step 5: Subscribe to live count updates.**

At the bottom of `entrypoints/popup/main.ts` (just before the existing `void init();` line), add:

```ts
watchHiddenCounts(renderCounts);
```

The popup tears down on close; we don't need to call the unwatcher (the listener is bound to a transient document and chrome cleans it up).

- [ ] **Step 6: Verify TS compiles.**

Run: `npm run compile`
Expected: exits 0 with no errors.

- [ ] **Step 7: Commit.**

```bash
git add entrypoints/popup/main.ts
git commit -m "feat(popup): render and live-update hidden-count pills"
```

---

## Task 7: Manual verification

End-to-end test of the feature in a real browser. No code changes; this is the gate before declaring done.

**Files:** none (verification only).

- [ ] **Step 1: Start dev mode.**

Run: `npm run dev`
Expected: Chromium opens with the extension loaded.

- [ ] **Step 2: Initial render.**

In the launched Chromium, navigate to `https://www.youtube.com/`. Open the extension popup.
Expected:
- "Hide Shorts" row shows a pill with `0` on its right edge.
- "Hide Playables" row shows a pill with `0` on its right edge.
- Pills are fully rounded, content center-aligned, colored with the muted/border palette.

- [ ] **Step 3: Counter increments.**

Close the popup. Scroll the YouTube home page. Confirm Shorts shelves are hidden as you scroll. Wait ~2 seconds (debounce). Reopen the popup.
Expected: Shorts pill count is greater than `0`.

- [ ] **Step 4: Live update while popup is open.**

Open the popup. While it's open, click into the YouTube tab and scroll further so new shelves render and get hidden. Watch the popup.
Expected: Shorts pill count updates in real time (within ~1-2 seconds of the new shelf being hidden), without needing to reopen the popup.

- [ ] **Step 5: Pill hides when pref is unchecked.**

In the popup, uncheck "Hide Shorts".
Expected: Shorts pill disappears immediately. Shorts shelves on the page reappear (existing behavior).

- [ ] **Step 6: Pill reappears with previous count when re-checked.**

Re-check "Hide Shorts".
Expected: Shorts pill reappears showing the same count as before. Shelves get re-hidden; count keeps incrementing on further scrolling.

- [ ] **Step 7: Counts persist across browser restart.**

Note the current counts. Quit Chromium completely. Re-run `npm run dev`. Open the popup on YouTube.
Expected: Pills show the same counts as before the restart (or higher, if scrolling occurred during launch).

- [ ] **Step 8: Dark mode visual check.**

Switch system appearance to Dark mode (macOS: System Settings → Appearance). Open the popup.
Expected: Pill background, border, and text use the dark-mode palette and remain legible against the dark popup background.

- [ ] **Step 9: Locale formatting (optional, sanity).**

Open DevTools console on the popup (right-click in popup → Inspect). Run:
```js
document.querySelector('#shortsHiddenCount').textContent
```
Expected: matches `(1234).toLocaleString()` format for the browser's locale (e.g. `1,234` in en-US).

- [ ] **Step 10: Multi-tab sanity.**

Open YouTube in two tabs. Scroll both. Wait ~2 seconds. Reopen popup.
Expected: count increased from both tabs' contributions. (Off-by-a-handful is acceptable per the spec's race-condition note.)

- [ ] **Step 11: Playables (if observable).**

If the YouTube account being tested shows Playables shelves, repeat steps 3-6 for the Playables pill. If Playables don't appear naturally, skip this step and confirm the Playables pill still renders `0` and behaves correctly on the visibility toggle.

- [ ] **Step 12: All steps pass — declare done.**

If any step fails, do not commit a "fix" without re-running the spec/plan diff. Most failures here will trace to one of: a selector mismatch, a missing flush, or a debounce timing bug.

---

## Out of scope (not implemented in this plan)

Per the spec's "Out of scope" section: reset UI, cross-device sync, time-windowed stats, individual-video counting. Do not add these in this implementation.
