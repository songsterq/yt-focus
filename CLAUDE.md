# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouTube Focus is a Chrome Extension (Manifest V3) that hides YouTube Shorts and Playables to help users focus on long-form content, and can shorten ads. Published on the Chrome Web Store.

## Development

No build step, package manager, or test framework. The extension is plain HTML/JS with no dependencies.

To test changes: load the extension via `chrome://extensions/` with "Developer mode" enabled using "Load unpacked", then refresh the YouTube page after making changes.

## Architecture

Three source files, all at the repo root:

- **`manifest.json`** — Manifest V3 config. Declares `storage` permission and injects `content.js` on `youtube.com`. Popup UI is `popup.html`.
- **`content.js`** — Content script injected into YouTube pages. Contains `hideContent()` for DOM hiding and `AdSkipManager` (IIFE module) for ad skipping. A `MutationObserver` on `document.body` re-runs both on DOM changes to handle YouTube's dynamic SPA navigation. Also listens to `chrome.storage.onChanged` to react to preference toggles in real-time.
- **`popup.js` + `popup.html`** — Extension popup UI with checkboxes (Hide Shorts, Hide Playables, Shorten Ads). Preferences are persisted to `chrome.storage.sync` on every toggle. All default to `true` (enabled).

## Key Patterns

- **DOM hiding strategy**: Elements are found via CSS selectors targeting YouTube's custom elements (`ytd-guide-entry-renderer`, `ytd-rich-shelf-renderer`, `ytd-reel-shelf-renderer`) and attributes (`a[title="Shorts"]`, `a[href^="/playables"]`). When YouTube changes their DOM structure, these selectors may need updating.
- **Preferences**: Both `content.js` and `popup.js` independently define default values (`hideShorts: true`, `hidePlayables: true`, `autoSkipAds: true`) when calling `chrome.storage.sync.get`. These must stay in sync.
- **Ad skipping strategy**: YouTube checks `event.isTrusted` on click events, so programmatic `.click()` / `dispatchEvent()` calls on skip buttons are unreliable. The primary skip mechanism is seeking the ad video to its end (`video.currentTime = video.duration`). `AdSkipManager` watches `.ytp-ad-module` via a dedicated MutationObserver and polls every 500ms while an ad is active.

## Releasing

Version is in `manifest.json`. The extension is published to the Chrome Web Store.
