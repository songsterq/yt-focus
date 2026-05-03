import { defineContentScript } from '#imports';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  main() {
    // Stub. Real implementation lands in Phase 3 of the migration.
  },
});
