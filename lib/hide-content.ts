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
    // Note: PLAYABLES_SIDEBAR_LINK is reused here as a presence probe inside
    // the shelf — same selector, different context from the sidebar usage.
    const shouldHide =
      (isShorts && prefs.hideShorts) ||
      (prefs.hidePlayables &&
        !!shelf.querySelector(sel.PLAYABLES_SIDEBAR_LINK));
    setHidden(shelf, shouldHide);
  }
}

export function applyHiding(prefs: Preferences): void {
  applySidebarRule(sel.SHORTS_SIDEBAR_LINK, prefs.hideShorts);
  applySidebarRule(sel.PLAYABLES_SIDEBAR_LINK, prefs.hidePlayables);
  applyReelShelves(prefs.hideShorts);
  applyRichShelves(prefs);
}
