import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('pet panels share compact, transparent artwork at the same display dimensions', () => {
  const scene = JSON.parse(readFileSync(new URL('../assets/scenes/Battle.scene', import.meta.url)));
  const view = scene.find(entry => entry?.frogArt && entry?.characterBasicArt);
  for (const page of ['Basic', 'Points']) {
    const path = new URL(`../assets/textures/ui/pet-${page.toLowerCase()}.png`, import.meta.url);
    const png = readFileSync(path);
    const frame = JSON.parse(readFileSync(new URL(`${path.href}.meta`))).subMetas.f9941;
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [864, 648]);
    assert.ok(png.length <= 300_000);
    assert.ok(png.includes(Buffer.from('tRNS')));
    assert.equal(view[`pet${page}Art`].__uuid__, frame.uuid);
  }
});
