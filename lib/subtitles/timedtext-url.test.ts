import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTimedTextUrl, timedTextContextFromUrl } from './timedtext-url';

const track = {
  baseUrl:
    'https://www.youtube.com/api/timedtext?v=abc123&exp=xpe&key=yt8&lang=ar&tlang=fr',
  languageCode: 'ar',
  languageName: 'Arabic',
  vssId: 'a.ar',
};

test('adds subtitle proof-of-origin and WEB client parameters', () => {
  const url = buildTimedTextUrl(track, 'json3', {
    translateTo: 'en',
    timedTextContext: {
      poToken: 'token+/=',
      clientName: 'WEB',
      clientVersion: '2.20260503.00.00',
      browserName: 'Chrome',
      browserVersion: '137.0.0.0',
      osName: 'Macintosh',
      osVersion: '15.5',
      platform: 'DESKTOP',
    },
  });

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('fmt'), 'json3');
  assert.equal(parsed.searchParams.get('tlang'), 'en');
  assert.equal(parsed.searchParams.get('potc'), '1');
  assert.equal(parsed.searchParams.get('pot'), 'token+/=');
  assert.equal(parsed.searchParams.get('c'), 'WEB');
  assert.equal(parsed.searchParams.get('cver'), '2.20260503.00.00');
  assert.equal(parsed.searchParams.get('cbr'), 'Chrome');
  assert.equal(parsed.searchParams.get('cbrver'), '137.0.0.0');
  assert.equal(parsed.searchParams.get('cos'), 'Macintosh');
  assert.equal(parsed.searchParams.get('cosver'), '15.5');
  assert.equal(parsed.searchParams.get('cplatform'), 'DESKTOP');
  assert.equal(parsed.searchParams.get('cplayer'), 'UNIPLAYER');
  assert.equal(parsed.searchParams.get('xorb'), '2');
  assert.equal(parsed.searchParams.get('xobt'), '3');
  assert.equal(parsed.searchParams.get('xovt'), '3');
});

test('removes translation and format parameters when not requested', () => {
  const url = buildTimedTextUrl(track, null);

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('lang'), 'ar');
  assert.equal(parsed.searchParams.has('tlang'), false);
  assert.equal(parsed.searchParams.has('fmt'), false);
  assert.equal(parsed.searchParams.has('pot'), false);
});

test('extracts subtitle proof-of-origin context from a timedtext request', () => {
  const context = timedTextContextFromUrl(
    'https://www.youtube.com/api/timedtext?v=abc123&fmt=json3&potc=1&pot=token%2B%2F%3D&c=WEB&cver=2.20260503.00.00&cbr=Chrome&cbrver=137.0.0.0&cos=Macintosh&cosver=15.5&cplatform=DESKTOP',
  );

  assert.deepEqual(context, {
    poToken: 'token+/=',
    clientName: 'WEB',
    clientVersion: '2.20260503.00.00',
    browserName: 'Chrome',
    browserVersion: '137.0.0.0',
    osName: 'Macintosh',
    osVersion: '15.5',
    platform: 'DESKTOP',
  });
});

test('ignores timedtext requests without a proof-of-origin token', () => {
  assert.equal(
    timedTextContextFromUrl(
      'https://www.youtube.com/api/timedtext?v=abc123&fmt=json3&c=WEB',
    ),
    null,
  );
});
