import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { PET_SKILLS, SKILL_POOLS, generateSkills, validSkills, skillDescription } = await import('../assets/battle/logic/pet-skills.ts');

test('skill pools survive array-only spread lowering used by the Creator build', () => {
  const ts = createRequire(import.meta.url)(process.env.COCOS_TYPESCRIPT);
  const source = readFileSync(new URL('../assets/battle/logic/pet-skills.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS, downlevelIteration: false } });
  const context = { exports: {} };
  runInNewContext(outputText, context);
  for (const species of Object.keys(SKILL_POOLS)) {
    const ids = context.exports.generateSkills(species, true, () => 1);
    assert.deepEqual(Array.from(ids), generateSkills(species, true, () => 1));
  }
});

test('natural skills cover count endpoints, uniqueness, innate slots and book-only exclusions', () => {
  for (const species of Object.keys(SKILL_POOLS)) {
    for (const mutated of [false, true]) {
      for (const [roll, count] of [[0, 0], [1 / 3, 1], [2 / 3, 2], [1, 2]]) {
        const ids = generateSkills(species, mutated, () => roll);
        assert.equal(ids.length, count + Number(mutated) + SKILL_POOLS[species].innate.length);
        assert.equal(new Set(ids).size, ids.length);
        assert.ok(validSkills(species, ids));
        assert.ok(!ids.includes('thunder') && !ids.includes('fireball'));
      }
    }
    assert.equal(validSkills(species, ['unknown']), false);
    assert.equal(validSkills(species, ['armor', 'armor']), false);
  }
  assert.ok(validSkills('tingwa', ['thunder', 'fireball']));
  assert.equal(validSkills('pangui', []), false);
  assert.throws(() => generateSkills('tingwa', false, () => NaN));
});

test('all twelve descriptions use live config and innate status follows the species', () => {
  const expected = {
    crit: '物理攻击的暴击率提高10%，暴击时造成2倍伤害。',
    combo: '普通攻击有45%概率连续攻击2次，每次伤害降低25%。未触发时伤害不降低。',
    lifesteal: '普通物理攻击造成实际伤害后，回复相当于实际伤害25%的气血，不超过气血上限。',
    counter: '受到普通物理攻击并失血后，若双方仍存活，有30%概率反击，造成普通物理伤害的50%。反应伤害不会再次触发物理被动技能。',
    reflect: '受到普通物理攻击并失血后，若双方仍存活，有30%概率返还自身实际所受伤害的25%。反应伤害不会再次触发物理被动技能。',
    power: '攻击提高“自身等级×0.4”。',
    armor: '防御提高“自身等级×0.6”。',
    swift: '速度提高10%。',
    regen: '每回合开始时，在场且存活则回复“自身等级÷2”点气血，向下取整，不超过气血上限。',
    thunder: '对一个敌人释放雷击，伤害随等级与双方灵力变化。消耗5点法力。',
    fireball: '对一个敌人释放火球，伤害随等级与双方灵力变化。消耗5点法力。',
    waterarrow: '对一个敌人释放水箭，伤害随等级与双方灵力变化。消耗5点法力。',
  };
  assert.equal(Object.keys(PET_SKILLS).length, 12);
  for (const [id, skill] of Object.entries(PET_SKILLS)) {
    assert.equal(skillDescription(id, 'tingwa'), expected[id]);
    assert.ok(skill.family && skill.tier === 1);
  }
  const previous = PET_SKILLS.waterarrow.params.mana;
  try {
    PET_SKILLS.waterarrow.params.mana = 7;
    assert.match(skillDescription('waterarrow', 'tingwa'), /消耗7点法力/);
  } finally { PET_SKILLS.waterarrow.params.mana = previous; }
  assert.match(skillDescription('armor', 'pangui'), /天生技能，无法被顶替/);
  assert.doesNotMatch(skillDescription('armor', 'tingwa'), /天生技能/);
  assert.match(skillDescription('counter', 'pangui'), /反应伤害不会再次触发物理被动技能/);
});
