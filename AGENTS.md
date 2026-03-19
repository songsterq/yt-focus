1→# YouTube Focus - Agent Guide
2→
3→## Commands
4→
5→**Setup:** No package manager. Load unpacked extension in Chrome at `chrome://extensions/`
6→
7→**Build:** N/A (no build step required)
8→
9→**Lint:** N/A (no linter configured)
10→
11→**Test:** N/A (no test framework configured)
12→
13→**Dev Server:** N/A (Chrome extension - reload at `chrome://extensions/` after changes)
14→
15→## Tech Stack & Architecture
16→
17→- **Platform:** Chrome Extension (Manifest V3)
18→- **Language:** Vanilla JavaScript (no framework)
19→- **Structure:** Content script (`content.js`) injects into YouTube pages, popup (`popup.js`) manages settings stored in `chrome.storage.sync`
20→
21→## Code Style
22→
23→- Use 4-space indentation
24→- Prefer `const` over `let`, use descriptive variable names (e.g., `hideShorts`, `playablesElements`)
25→- DOM manipulation via `querySelector`/`querySelectorAll`, use `forEach` for iteration
26→- Arrow functions for callbacks, mutation observers for dynamic content monitoring
27→