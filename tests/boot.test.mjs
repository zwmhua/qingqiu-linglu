import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('both builds start in Boot and include Battle as a separate scene', () => {
  const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
  const boot = json('../assets/boot/Boot.scene.meta').uuid;
  const battle = json('../assets/battle/scenes/Battle.scene.meta').uuid;
  for (const name of ['wechat', 'web-mobile']) {
    const config = json(`../settings/${name}-build.json`);
    assert.equal(config.startScene, boot);
    assert.deepEqual(config.scenes.map(scene => scene.uuid), [boot, battle]);
  }
});

test('Creator config routes the battle bundle to a local WeChat subpackage', () => {
  const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
  const { isBundle, bundleName, bundleConfigID } = json('../assets/battle.meta').userData;
  const { configs } = json('../settings/v2/packages/builder.json').bundleConfig.custom[bundleConfigID];
  assert.equal(isBundle, true);
  assert.equal(bundleName, 'battle');
  assert.deepEqual(configs.miniGame.overwriteSettings.wechatgame, { isRemote: false, compressionType: 'subpackage' });
  assert.equal(configs.miniGame.configMode, 'overwrite');
  assert.equal(configs.web.preferredOptions.isRemote, false);
  assert.equal(json('../settings/wechat-build.json').packages.wechatgame.separateEngine, true);
});
