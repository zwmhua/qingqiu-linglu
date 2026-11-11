import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const names = ['攻击', '防御', '保护', '召唤', '抓取', '道具', '逃跑', '灵术', '撤退'];
const scene = JSON.parse(readFileSync(new URL('../assets/scene/Battle.scene', import.meta.url)));
const view = scene.find(item => item.battleBackground && item.jadeNormal);

test('nine command icons are 128px RGBA circles with transparent corners', () => {
  for (const name of names) {
    const png = readFileSync(new URL(`../assets/textures/ui/${name}.png`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', name);
    assert.equal(png.readUInt32BE(16), 128, name);
    assert.equal(png.readUInt32BE(20), 128, name);
    assert.equal(png[25], 6, `${name} must be RGBA`);
    const chunks = [];
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      const type = png.toString('ascii', offset + 4, offset + 8);
      if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    const pixels = inflateSync(Buffer.concat(chunks));
    assert.equal(pixels[4], 0, `${name} top-left alpha`);
  }
});

test('scene binds command SpriteFrames in the requested order', () => {
  assert.equal(view.commandIcons.length, names.length);
  names.forEach((name, index) => {
    const meta = JSON.parse(readFileSync(new URL(`../assets/textures/ui/${name}.png.meta`, import.meta.url)));
    assert.equal(view.commandIcons[index].__uuid__, `${meta.uuid}@f9941`, name);
  });
});

test('auto button icons are transparent 128px assets bound to the scene', () => {
  for (const [name, field] of [['icon_auto', 'iconAuto'], ['icon_auto_cancel', 'iconAutoCancel']]) {
    const png = readFileSync(new URL(`../assets/textures/ui/${name}.png`, import.meta.url));
    const meta = JSON.parse(readFileSync(new URL(`../assets/textures/ui/${name}.png.meta`, import.meta.url)));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', name);
    assert.equal(png.readUInt32BE(16), 128, name);
    assert.equal(png.readUInt32BE(20), 128, name);
    assert.equal(png[25], 6, `${name} must be RGBA`);
    const chunks = [];
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
        chunks.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    assert.equal(inflateSync(Buffer.concat(chunks))[4], 0, `${name} top-left alpha`);
    assert.equal(view[field].__uuid__, `${meta.uuid}@f9941`, name);
  }
});
