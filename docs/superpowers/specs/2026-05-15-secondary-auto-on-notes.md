# Secondary subtitle auto-on behavior — open questions

Status: notes / problem statement. A proper design is needed before re-attempting.

## Goal

When the user has "Show secondary subtitle" enabled in the popup, the secondary
overlay should automatically display whenever a watch page loads and the user's
chosen secondary language is meaningfully different from what YouTube is showing
as the primary. The user should not have to open the CC2 menu and pick a track
on every video.

## What was tried (and reverted)

Two changes were committed to address pieces of this, plus an uncommitted
follow-up. All three are being reverted; this note records what they did and
why each fell short.

### Attempt 1 — Gate secondary visibility on YT's CC button (commit `7261da6`)

Approach:

- Read `aria-pressed` on `.ytp-subtitles-button` to know whether YT's native
  captions are on.
- `updateOverlayVisibility()` requires both `secondary.type !== 'off'` AND
  `isCaptionsOn()`.
- `MutationObserver` on the button's `aria-pressed` re-evaluates visibility on
  user toggle.

Motivation: if the user turns YT's CC off, our secondary should disappear too —
otherwise it looks like a stuck overlay.

What broke:

- YouTube's default for many videos is CC off. With the pref enabled but CC
  off on load, the secondary stayed hidden — exactly opposite of the user's
  expectation that "pref on" means "show on load".
- A fix was attempted (Attempt 2 below) but introduced its own issues.

### Attempt 2 — Auto-enable YT CC at setup (part of the uncommitted work)

Approach: in `setupForCurrentPage`, if the pref is on and `isCaptionsOn()` is
false, programmatically click `.ytp-subtitles-button` to turn YT CC on.

What broke:

- Fought the user's intent when they had deliberately turned CC off on a prior
  video. Each navigation re-enabled it.
- Combined with Attempt 3 (below), the auto-click + refine race produced a
  state where the overlay only appeared after the user manually toggled the
  CC button off and back on. Cause not fully diagnosed before revert.

### Attempt 3 — Detect YT's displayed language via timedtext URLs (uncommitted)

Motivation: `pickDefaultSecondary` was comparing the user's pref against the
source track's language. When YT is auto-translating (e.g., source English,
displayed Japanese via `tlang=ja`), our code saw "source en matches pref en →
nothing useful to add → off" and the secondary never appeared. But the user
was seeing Japanese on screen, so showing English as the secondary would
have been useful.

Approach:

- Extend `main-world.content.ts` (which already intercepts `/api/timedtext`
  URLs for the PO-token logic) to also remember `tlang || lang` as the
  "displayed language."
- Add a bridge action `getDisplayedLang`.
- Add `refineFromDisplayedLang(setupId)` in the controller: poll the bridge
  for up to ~6s, and once a displayed language is known, re-pick secondary
  using that as the effective primary language.
- `pickDefaultSecondary` gained a fourth parameter `effectivePrimaryLang` so
  the collision check uses what YT is *displaying* rather than the source
  track.

Further fix: when the new collision check still produced
`{type: 'translate', sourceTrack: X, targetLang: X}` (translating to the
source's own language), surface the source track natively instead — the
URL is identical but the menu label is no longer the confusing
"Auto-translate → English".

What broke:

- Even after the refine successfully re-picked the secondary, no captions
  rendered until the user toggled the CC button off and back on. Likely
  causes (not confirmed):
  - `startSecondary` runs twice in quick succession (initial 'off' pick →
    refined non-off pick); the second invocation tears down nothing and
    sets up a sync, but visibility may still be stuck at false because
    of a stale `isCaptionsOn()` read or a race with the CC observer.
  - The auto-click (Attempt 2) and the refine fire in overlapping windows,
    each calling visibility updates with different assumptions.

## Open questions for the next design

1. **Who decides whether YT CC should be on?** Three coupled toggles exist
   (user's secondary pref, YT's CC button state, our overlay visibility).
   They need explicit rules, not implicit gating via three places that all
   read `aria-pressed`.

2. **What is the contract between `pickDefaultSecondary` and the rest of the
   controller?** Currently `pickDefaultSecondary` runs once at setup with the
   source language, and a refine pass may re-run it later with a different
   effective language. The two-phase pick is what made debugging hard — a
   single deterministic pick (possibly delayed until we have the displayed
   language) would be easier to reason about.

3. **How do we observe the displayed language reliably?** The timedtext-URL
   approach works but is reactive — it only updates when YT fetches captions.
   The player API (`player.getOption('captions', 'track')` plus
   `translationLanguage`) is direct but only available after the captions
   module is loaded. A combination, or just waiting on a single signal
   before the first pick, may be cleaner than a refine pass.

4. **How should the secondary react to mid-video changes?** If the user
   changes YT's CC track or translation target without using our CC2 menu,
   should we re-pick? Currently we don't. The "secondary user override"
   flag stops us from reacting, but it's only set by our own menu.

5. **What's the right default behavior when source language matches the
   secondary pref?** Several possibilities:
   - Off (current pre-revert behavior — the user has to pick manually).
   - Always show the source track regardless of YT's translation state
     (sometimes duplicates the primary, sometimes useful).
   - Fall back to a second-choice language preference.
   - Detect YT's translation state and decide accordingly.

## Files involved

- `lib/subtitles/controller.ts` — `pickDefaultPrimary`, `pickDefaultSecondary`,
  `setupForCurrentPage`, `updateOverlayVisibility`, `startSecondary`.
- `entrypoints/main-world.content.ts` — URL interception, bridge actions.
- `lib/subtitles/bridge.ts` — content↔main-world RPC.
- `lib/subtitles/timedtext-url.ts` — URL parsing helpers.
- `lib/selectors.ts` — `CC_BUTTON`, `NATIVE_CAPTION_WINDOW`.

## What's NOT being reverted

- `c4eb3cd` (drop inject-into-primary path, always render secondary above)
  stays. That refactor is orthogonal to the auto-on problem and is working.
