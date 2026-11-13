import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

test('character panel uses compressed blank artwork bound to the battle scene', () => {
  const scene = JSON.parse(readFileSync(new URL('../assets/battle/scenes/Battle.scene', import.meta.url)));
  const view = scene.find(entry => entry?.heroArt && entry?.frogArt);
  for (const [property, filename] of [
    ['characterBasicArt', 'character-basic.png'],
    ['characterPointsArt', 'character-points.png'],
  ]) {
    const path = new URL(`../assets/battle/textures/ui/${filename}`, import.meta.url);
    const image = readFileSync(path);
    const meta = JSON.parse(readFileSync(new URL(`${path.href}.meta`)));
    const frame = meta.subMetas.f9941;
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(statSync(path).size < 500_000);
    if (property === 'characterPointsArt') assert.ok(image.length <= 300_000);
    assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], [1334, 750]);
    assert.deepEqual([frame.userData.rawWidth, frame.userData.rawHeight], [1334, 750]);
    assert.ok(view[property].__uuid__.endsWith('@f9941'));
    assert.equal(view[property].__uuid__, frame.uuid);
    assert.equal(view[property].__expectedType__, 'cc.SpriteFrame');
  }
});
