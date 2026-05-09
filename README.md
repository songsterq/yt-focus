# YouTube Focus & Learn

View in [chrome web store](https://chromewebstore.google.com/detail/youtube-focus/dppgailgbpncddkeccgfiplmdonfloja).

A Chrome extension that turns YouTube into a calmer place to watch and learn from long-form content. Hides Shorts and Playables to remove distractions, and overlays a secondary subtitle alongside YouTube's native captions to help with language learning.

## Features

- Hides Shorts and Playables from the YouTube sidebar, main feed, and recommendations.
- Shows a secondary subtitle in your chosen language alongside the native captions, mirroring YouTube's own caption styling and following the caption box when you drag it.
- Works automatically when you visit YouTube.

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the folder containing the extension files
5. The extension should now be active when you visit YouTube

## How it works

The extension uses a content script to detect and hide YouTube Shorts elements from the page. It runs when the page loads and also monitors for dynamic content changes to ensure Shorts remain hidden even when new content is loaded.

## Development

To modify the extension:

1. Make changes to the files
2. Go to `chrome://extensions/`
3. Find the extension and click the refresh icon
4. The changes will be applied after refreshing the YouTube page

## License

MIT 
