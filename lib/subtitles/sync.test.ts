import assert from 'node:assert/strict';
import test from 'node:test';

import { clipOverlappingCues, findActive } from './sync';
import type { Cue } from './types';

// Shape of YouTube's auto-generated json3: two-row roll-up where each line's
// duration runs until the line after next begins.
const starts = [1280, 3600, 6100, 8400, 10900, 13300];
const rollUp: Cue[] = starts.map((s, i) => ({
  startMs: s,
  endMs: starts[i + 2] ?? s + 4500,
  text: `L${i + 1}`,
}));

test('clipOverlappingCues cuts each cue off where the next one starts', () => {
  const clipped = clipOverlappingCues(rollUp);
  for (let i = 0; i < clipped.length - 1; i++) {
    assert.equal(clipped[i].endMs, clipped[i + 1].startMs);
  }
  assert.equal(clipped.at(-1)!.endMs, 13300 + 4500);
});

test('clipOverlappingCues leaves gaps and non-overlapping cues alone', () => {
  const cues: Cue[] = [
    { startMs: 0, endMs: 1000, text: 'a' },
    { startMs: 2000, endMs: 3000, text: 'b' },
  ];
  assert.deepEqual(clipOverlappingCues(cues), cues);
});

test('findActive returns the most recently started cue even when cues overlap', () => {
  for (let t = 1280; t < 18000; t += 50) {
    let expected: Cue | null = null;
    for (const c of rollUp) if (t >= c.startMs && t < c.endMs) expected = c;
    assert.equal(findActive(rollUp, t), expected, `t=${t}`);
  }
});

test('findActive returns null before the first cue and inside gaps', () => {
  const cues: Cue[] = [
    { startMs: 1000, endMs: 2000, text: 'a' },
    { startMs: 5000, endMs: 6000, text: 'b' },
  ];
  assert.equal(findActive(cues, 500), null);
  assert.equal(findActive(cues, 3000), null);
  assert.equal(findActive(cues, 1000)?.text, 'a');
  assert.equal(findActive(cues, 1999)?.text, 'a');
  assert.equal(findActive(cues, 2000), null);
  assert.equal(findActive(cues, 5500)?.text, 'b');
  assert.equal(findActive([], 0), null);
});
