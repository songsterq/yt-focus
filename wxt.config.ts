import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'YouTube Focus & Learn',
    description:
      'Hide YouTube Shorts & Playables, plus dual subtitles to learn a language while you watch. Focus + fluency, free.',
    permissions: ['storage'],
    icons: {
      16: '/icons/icon16.png',
      32: '/icons/icon32.png',
      48: '/icons/icon48.png',
      128: '/icons/icon128.png',
    },
  },
});
