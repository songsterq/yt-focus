import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'YouTube Focus & Learn',
    description:
      'Focus on long-form YouTube and learn from it: hide Shorts and Playables, and show a secondary subtitle in the language you are learning.',
    permissions: ['storage'],
    icons: {
      16: '/icons/icon16.png',
      32: '/icons/icon32.png',
      48: '/icons/icon48.png',
      128: '/icons/icon128.png',
    },
  },
});
