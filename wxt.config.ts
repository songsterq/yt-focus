import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'YouTube Focus',
    description:
      'Hide YouTube Shorts and Playables to reduce distractions and focus on long-form content that matters to you.',
    permissions: ['storage'],
    icons: {
      16: '/icons/icon16.png',
      32: '/icons/icon32.png',
      48: '/icons/icon48.png',
      128: '/icons/icon128.png',
    },
  },
});
