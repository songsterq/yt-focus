# Hidden-Count Pill — Design

A small numeric pill, anchored to the right of each "Hide Shorts" / "Hide Playables" row in the popup, displaying the all-time number of shelves the extension has hidden on this device.

## Goals

- Surface a satisfying, persistent stat that reinforces what the extension does for the user.
- Add the feature symmetrically to both Shorts and Playables.
- Keep the cost on the YouTube content script negligible.

## Non-goals

- Resetting the count via UI.
- Cross-device aggregation (count is per-device).
- Per-time-period breakdowns (today / this week / all time).
- Counting individual short videos. The unit is **a shelf hidden**.

## Decisions

| Decision | Choice | Notes |
|---|---|---|
| Time window | All-time cumulative | Persists across browser restarts. |
| Counting unit | One hidden shelf = 1 | Simpler dedup, smaller numbers but honest. Includes both reel shelves and rich shelves whose contents trigger the hide. Sidebar entries are not counted. |
| Symmetry | Both Shorts and Playables get a pill | Same code path, different selectors. |
| Visibility when count is 0 | Pill visible, shows `0` | Signals where the number will go. |
| Visibility when pref is off | Pill hidden | Stale count under an inactive toggle would be confusing. |
| Storage backend | `chrome.storage.local` | No write-rate quota; counter is per-device by design. |
| Number format | Integer with locale-aware thousands separator (`Number.toLocaleString()`) | Skip `1.2k` compaction; the big number is the point. |
| Reset UI | None | YAGNI; can be added later. |

## Architecture

```
┌─────────────────────────┐
│ content.ts (per tab)    │
│                          │
│  applyHiding(prefs)      │──returns──▶ { shortsShelves, playablesShelves }
│        │                 │              (the elements just hidden)
│        ▼                 │
│  HiddenCounter           │              ┌──────────────────────┐
│   ├─ WeakSet<Element>    │──debounced──▶│ chrome.storage.local │
│   │   per kind           │   1s flush   │ shortsHiddenCount    │
│   └─ pending deltas      │              │ playablesHiddenCount │
└─────────────────────────┘               └──────────────────────┘
                                                   ▲
┌─────────────────────────┐                        │
│ popup/main.ts            │──reads on open────────┤
│                          │──storage.onChanged────┘
│  renders pills, applies  │  (live updates while popup is open)
│  visibility from prefs   │
└─────────────────────────┘
```

## Module structure

### New: `lib/hidden-counter.ts`

```ts
export type HiddenCounts = { shorts: number; playables: number };

export const shortsHiddenCountPref: WxtStorageItem<number, ...>;
export const playablesHiddenCountPref: WxtStorageItem<number, ...>;

export function getHiddenCounts(): Promise<HiddenCounts>;

export function watchHiddenCounts(cb: (counts: HiddenCounts) => void): () => void;

export function createHiddenCounter(): {
  recordHidden(kind: 'shorts' | 'playables', els: Iterable<Element>): void;
  flush(): Promise<void>;
};
```

Internals:

- Two `WeakSet<Element>` (one per kind), owned by the counter instance — auto-cleared when YouTube's SPA recycles DOM nodes.
- Two integer pending counters per kind. `recordHidden` checks the WeakSet for each element, and for new ones increments the pending counter and adds to the set.
- `setTimeout`-based 1000ms debounce to flush pending deltas via read-modify-write to `chrome.storage.local`.
- `flush()` cancels any pending timer and writes immediately. Idempotent if pending is 0.
- All reads guard with `Number.isFinite(v) ? v : 0` to tolerate corrupted storage.

### Modified: `lib/hide-content.ts`

`applyHiding`'s signature changes:

```ts
export function applyHiding(prefs: Preferences): {
  shortsShelves: Element[];
  playablesShelves: Element[];
};
```

It now returns the shelf elements it transitioned from visible to hidden in this call. "Transitioned" means: before the call, `el.style.display !== 'none'`; after, `el.style.display === 'none'`. Elements that were already hidden are not returned. Sidebar entries are excluded from the return value (they are not counted). The counting decision is made by the caller, not by `hide-content.ts`.

Internal helpers (`applyReelShelves`, `applyRichShelves`) check the pre-call display state of each candidate before flipping it, and accumulate transitioned elements into the appropriate bucket. A rich shelf classified as Shorts goes into `shortsShelves`; one classified as Playables goes into `playablesShelves`. Reel shelves always go into `shortsShelves`. `applySidebarRule` is unchanged in behavior; it just doesn't contribute to either bucket.

### Modified: `entrypoints/content.ts`

```ts
const counter = createHiddenCounter();

const runHide = (p: Preferences) => {
  const { shortsShelves, playablesShelves } = applyHiding(p);
  counter.recordHidden('shorts', shortsShelves);
  counter.recordHidden('playables', playablesShelves);
};

runHide(prefs);
// ...inside watchPreferences callback: runHide(prefs);
// ...inside MutationObserver callback: runHide(prefs);

// Flush on tab close / hidden so we don't lose pending deltas.
const onHide = () => { void counter.flush(); };
addEventListener('pagehide', onHide);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') onHide();
});
ctx.onInvalidated(() => {
  removeEventListener('pagehide', onHide);
  void counter.flush();
});
```

### Modified: `entrypoints/popup/index.html`

Append a `<span class="count-pill">` to each of the two option rows. Initial state has `hidden` attribute, content `0`. Add the `.count-pill` CSS rule.

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

```css
.count-pill {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--fg-muted);
  background: var(--hover-bg);
  border: 1px solid var(--border);
  border-radius: 999px;   /* fully rounded on both ends */
  padding: 1px 8px;
  min-width: 24px;
  text-align: center;     /* number center-aligned */
  user-select: none;
}
```

### Modified: `entrypoints/popup/main.ts`

On load:

1. `getHiddenCounts()` → set both pills' `textContent` via `Number.toLocaleString()`.
2. Apply visibility per pref: if pref is on, remove `hidden`; if off, set `hidden`.

On checkbox change: toggle the corresponding pill's `hidden` attribute alongside writing the pref.

Subscribe `watchHiddenCounts((counts) => { ... })` for live updates while the popup is open. Unsubscribe on unload (popup teardown) for cleanliness.

## Layout (popup)

```
┌────────────────────────────────────────────┐
│ REDUCE DISTRACTIONS                        │
│ ┌──┐                                       │
│ │☑ │ Hide Shorts              ┌────────┐  │
│ └──┘                          │  1,247 │  │
│                                └────────┘  │
│ ┌──┐                                       │
│ │☑ │ Hide Playables           ┌────────┐  │
│ └──┘                          │     12 │  │
│                                └────────┘  │
└────────────────────────────────────────────┘
```

The existing `.option` rule (`display: flex; align-items: center; gap: 8px`) and the label's `flex: 1` naturally anchor the pill to the right edge. No changes to row layout needed.

## Data flow

1. **Hide event.** `MutationObserver` on `document.body` fires → `applyHiding(prefs)` runs → returns the elements just hidden.
2. **Record.** Content script calls `counter.recordHidden('shorts', shortsShelves)` and the same for playables. The counter checks each element against its WeakSet, increments pending counts for new ones, and schedules a debounced flush.
3. **Flush.** After 1s of quiescence, the counter reads the current `chrome.storage.local` values, adds the pending deltas, writes back, and zeroes the pending counters.
4. **Popup display.** When the popup opens, `getHiddenCounts()` reads both stored values and renders. `watchHiddenCounts` subscribes to `storage.onChanged` and re-renders on writes (so an active YouTube tab in the background updates the visible pill in real time).

## Risks and mitigations

1. **Multi-tab race.** Two tabs flushing the same instant: last-write-wins, can drop a few increments. Mitigated by reading just before writing. Off-by-a-few is acceptable for a fun stat.
2. **Counter inflation from SPA re-mounts.** YouTube sometimes recreates a shelf as a new DOM node; the WeakSet won't recognize it and will count it again. Accepted: the alternative (video-ID parsing across navigations) drifts back into the more expensive Approach A. Document the count as "shelves rendered & hidden," not "unique shelves."
3. **Storage write volume.** With 1s debounce + WeakSet dedup, real-world write rate is a few per minute during active scrolling. Far below `chrome.storage.local` quotas.
4. **Lost pending deltas on tab close.** Mitigated by `pagehide` and `visibilitychange='hidden'` flush handlers; worst case loses <1s of increments.
5. **Corrupted storage values.** `getHiddenCounts` and the counter's read step both guard with `Number.isFinite(v) ? v : 0`.

## Verification

Manual (no test framework in this project):

- `npm run compile` clean.
- `npm run dev` → YouTube home → open popup → confirm both pills render with starting count.
- Scroll YouTube → reopen popup → confirm counts incremented.
- Uncheck "Hide Shorts" → corresponding pill hidden; uncheck "Hide Playables" → same. Re-check → pills reappear with previous values.
- Two YouTube tabs scrolling concurrently → counts grow approximately right.
- Close & reopen browser → counts persist.
- Toggle system dark mode → pill styling looks right in both themes.
- 280px popup width is preserved; long localized numbers (`1 247`, `1.247`) fit without wrapping.

## Out of scope (potential follow-ups)

- Reset button or right-click reset.
- Cross-device aggregation via `chrome.storage.sync` with rate limiting.
- Time-windowed stats (today / week / all time toggle).
- Counting individual short videos inside shelves.
