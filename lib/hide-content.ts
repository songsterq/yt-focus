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
