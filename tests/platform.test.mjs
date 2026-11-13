import test from 'node:test';
import assert from 'node:assert/strict';
import { browserParams, wechatStorage } from '../assets/logic/platform.ts';

test('debug parameters use browser query syntax and default when web APIs are absent', () => {
  const host = { location: { search: '?layout=10v10&babySample=1&mutationSample=%31' }, URLSearchParams };
  const params = browserParams(true, host);
  assert.equal(params.get('layout'), '10v10');
  assert.equal(params.get('babySample'), '1');
  assert.equal(params.get('mutationSample'), '1');
  assert.equal(params.get('unknown'), null);
  for (const missing of [browserParams(false, host), browserParams(true, undefined),
    browserParams(true, { location: host.location }), browserParams(true, { URLSearchParams })]) {
    assert.equal(missing.get('layout'), null);
    assert.equal(missing.get('babySample'), null);
    assert.equal(missing.get('mutationSample'), null);
  }
});

test('WeChat storage treats missing data as null and only removes the requested key', () => {
  const values = new Map([['another-key', 'keep']]);
  const storage = wechatStorage({
    getStorageSync: key => values.get(key) ?? '',
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: key => values.delete(key),
  });
  assert.equal(storage.getItem('progress'), null);
  storage.setItem('progress', '{"version":3}');
  assert.equal(storage.getItem('progress'), '{"version":3}');
  storage.removeItem('progress');
  assert.equal(storage.getItem('progress'), null);
  assert.equal(storage.getItem('another-key'), 'keep');
});
