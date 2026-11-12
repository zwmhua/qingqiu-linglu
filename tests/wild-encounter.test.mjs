import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !specifier.endsWith('.ts')
    ? `${specifier}.ts` : specifier, context);
} });
const { Battle } = await import('../assets/scripts/Battle.ts');
const { captureChance } = await import('../assets/logic/capture.ts');
const { wildCombat } = await import('../assets/logic/wild-encounter.ts');
const { petPanel } = await import('../assets/logic/pet-panel.ts');

const sequence = (...values) => () => {
  assert.ok(values.length, 'unexpected extra random roll');
  return values.shift();
};
const panel = unit => [unit.maxHp, unit.attack, unit.defense, unit.speed];
const identity = ({ species, level, isBaby, isMutated, aptitudes, growth, baseStats }) =>
  ({ species, level, isBaby, isMutated, aptitudes, growth, baseStats });
const speciesCases = [
  ['tingwa', '汀蛙', 0, [33, 10, 9, 9], [49, 12, 11, 11],
    [[918, 1080], [714, 840], [2295, 2700], [1020, 1200], [867, 1020], [1122, 1320]], [0.882, 0.900, 0.918]],
  ['pangui', '磐龟', 1 / 3, [45, 9, 13, 7], [69, 11, 17, 9],
    [[816, 960], [816, 960], [3060, 3600], [1020, 1200], [1122, 1320], [714, 840]], [0.882, 0.900, 0.918]],
  ['maomaochong', '毛毛虫', 2 / 3, [26, 14, 7, 10], [38, 16, 9, 12],
    [[1224, 1440], [765, 900], [2040, 2400], [1020, 1200], [1020, 1200], [1122, 1320]], [0.994, 1.012, 1.030]],
];
const make = (count, encounter, baby = () => 1, mutation = () => 1,
  aptitude = () => 0, growth = () => 0, battleRoll = () => 0, previous) =>
  new Battle(battleRoll, count, 0, previous, baby, aptitude, growth, () => 0.6, mutation, encounter);

test('count and independent species selection honor exact boundaries without a guaranteed species', () => {
  for (const [roll, count] of [[0, 1], [0.499999, 1], [0.50, 2], [0.849999, 2], [0.85, 3], [0.999999, 3]]) {
    assert.equal(make(undefined, () => 0, undefined, undefined, undefined, undefined, () => roll).enemies.length, count);
  }
  for (const [roll, expected] of [[0, 'tingwa'], [1 / 3 - 1e-6, 'tingwa'], [1 / 3, 'pangui'],
    [2 / 3 - 1e-6, 'pangui'], [2 / 3, 'maomaochong'], [0.999999, 'maomaochong']]) {
    assert.deepEqual(make(3, () => roll).enemies.map(unit => unit.species), Array(3).fill(expected));
  }
  const battle = make(undefined, undefined, undefined, undefined, undefined, undefined,
    sequence(0.85, 2 / 3, 0.8, 0, 0, 1 / 3, 0.4));
  assert.deepEqual(battle.enemies.map(unit => [unit.species, unit.level]),
    [['maomaochong', 5], ['tingwa', 1], ['pangui', 3]]);
});

test('each ordinary level has a 20% interval and baby and mutation rolls are independent', () => {
  for (const [index, low] of [0, 0.2, 0.4, 0.6, 0.8].entries()) {
    for (const roll of [low, low + 0.199999]) {
      assert.equal(make(1, sequence(0, roll)).enemies[0].level, index + 1);
    }
  }
  const battle = make(3, sequence(0, 1 / 3, 0.8, 2 / 3),
    sequence(0.049999, 0.05, 0), sequence(0.249999, 0, 0.25));
  assert.deepEqual(battle.enemies.map(unit => [unit.level, unit.combatLevel, unit.isBaby, unit.isMutated]),
    [[0, 1, true, true], [5, 5, false, true], [0, 1, true, false]]);
});

test('all three enemy panels use the confirmed level 0, 1 and 5 values', () => {
  for (const [species, name, roll, low, high] of speciesCases) {
    for (const [level, levelRoll, expected] of [[0, 0, low], [1, 0, low], [5, 0.8, high]]) {
      const battle = make(1, sequence(...(level === 0 ? [roll] : [roll, levelRoll])), () => level ? 1 : 0);
      const unit = battle.enemies[0];
      assert.deepEqual([unit.species, unit.name, unit.level, unit.hp],
        [species, level === 0 ? `${name}宝宝` : `野外${name}`, level, expected[0]]);
      assert.deepEqual(panel(unit), expected);
      assert.equal(captureChance(unit.hp, unit.maxHp), 0.20);
      for (const pet of battle.roster.entries) {
        assert.deepEqual([pet.species, pet.level, ...panel(pet)], ['tingwa', 1, ...panel(petPanel(pet))]);
      }
    }
  }
});

test('all species reuse two aptitude rolls per stat, baby ranges, growth precision and base points', () => {
  for (const [, , roll, , , ranges, growthRange] of speciesCases) {
    for (const isBaby of [false, true]) {
      for (const [first, second] of [[0, 0], [0, 1], [1, 1]]) {
        let rolls = 0;
        const battle = make(1, sequence(...(isBaby ? [roll] : [roll, 0.8])), () => isBaby ? 0 : 1,
          () => first ? 0 : 1, () => rolls++ % 2 === 0 ? first : second, () => second);
        const wild = battle.enemies[0];
        assert.equal(rolls, 36);
        assert.deepEqual(Object.values(wild.aptitudes), ranges.map(([min, max]) => {
          const low = isBaby ? Math.ceil((min + max) / 2) : min;
          const mean = Math.round(((first ? max : low) + (second ? max : low)) / 2);
          return first ? Math.round(mean * 1.18) : mean;
        }));
        const expectedGrowth = growthRange[second ? 2 : Number(isBaby)];
        assert.equal(wild.growth, expectedGrowth);
        assert.equal(wild.growth.toFixed(3), expectedGrowth.toFixed(3));
        const values = Object.values(wild.baseStats);
        assert.equal(values.reduce((sum, value) => sum + value, 0), isBaby ? 50 : 100);
        assert.ok(values.every(value => value >= 1));
      }
    }
  }
});

test('capture and summon preserve every species and individual identity across battles', () => {
  for (const [species, name, roll] of speciesCases) {
    for (const isBaby of [false, true]) {
      const battle = make(1, sequence(...(isBaby ? [roll] : [roll, 0.8])), () => isBaby ? 0 : 1,
        sequence(isBaby ? 0 : 0.25));
      const wild = battle.enemies[0];
      const original = structuredClone(identity(wild));
      battle.command('hero', 'capture', wild.id);
      battle.command('pet', 'defend');
      const caught = battle.roster.entries[2];
      assert.deepEqual([caught.species, caught.name], [species, isBaby ? `${name}宝宝` : name]);
      assert.deepEqual(identity(caught), original);
      const next = make(1, sequence(0, 0), undefined, undefined, undefined, undefined, undefined, battle.roster);
      assert.deepEqual(identity(next.roster.entries[2]), original);
      next.command('hero', 'summon', caught.id);
      next.command('pet', 'defend');
      const summoned = next.pets.find(unit => unit.deployed);
      assert.equal(summoned.name, caught.name);
      assert.deepEqual(identity(summoned), original);
    }
  }
});

test('redirected capture uses the living target identity and failures never reroll it', () => {
  for (const captureRoll of [0, 0.99]) {
    const battle = make(2, sequence(0, 0, 1 / 3), sequence(0.05, 0), sequence(0.25, 0),
      undefined, undefined, sequence(0, 0, captureRoll, 0, 0));
    const [fallen, turtle] = battle.enemies;
    assert.deepEqual([fallen.species, turtle.species], ['tingwa', 'pangui']);
    fallen.hp = 1;
    battle.pets[0].speed = 10;
    const original = structuredClone(identity(turtle));
    battle.command('hero', 'capture', fallen.id);
    battle.command('pet', 'attack', fallen.id);
    assert.equal(fallen.hp, 0);
    assert.deepEqual(identity(turtle), original);
    const result = battle.events.find(event => event.kind.startsWith('capture'));
    assert.deepEqual([result.kind, result.targetId], [captureRoll ? 'captureFail' : 'captureSuccess', turtle.id]);
    if (captureRoll) assert.equal(battle.roster.entries.length, 2);
    else assert.deepEqual(identity(battle.roster.entries[2]), original);
  }
});

for (const [species, , speciesRoll, low, high] of speciesCases) {
  for (const level of [0, 1, 5]) {
    test(`${species} Lv.${level} uses its formal panel after capture, swaps and recovery`, () => {
      const isBaby = level === 0;
      const expectedPanel = level === 5 ? high : low;
      for (const isMutated of [false, true]) {
        const encounter = isBaby ? [speciesRoll] : [speciesRoll, level === 5 ? 0.8 : 0];
        const first = make(2, sequence(...encounter, 0, 0), sequence(isBaby ? 0 : 1, 1),
          sequence(isMutated ? 0 : 1, 1));
        const [wild] = first.enemies;
        assert.deepEqual([wild.species, wild.level, wild.isBaby, wild.isMutated],
          [species, level, isBaby, isMutated]);
        assert.deepEqual(panel(wildCombat(species, level)), expectedPanel);
        assert.deepEqual(panel(wild), expectedPanel);

        first.command('hero', 'defend');
        first.command('pet', 'attack', wild.id);
        assert.ok(wild.hp > 0 && wild.hp < wild.maxHp);
        const formal = panel(petPanel(wild));
        const injuredHp = Math.min(wild.hp, formal[0]);
        const originalIdentity = structuredClone(identity(wild));
        first.command('hero', 'capture', wild.id);
        first.command('pet', 'defend');
        const caught = first.roster.entries[2];
        assert.equal(caught.origin, 'captured');
        assert.deepEqual(identity(caught), originalIdentity);
        assert.deepEqual(panel(caught), formal);
        assert.equal(caught.hp, injuredHp);
        if (isBaby) assert.equal(Object.values(caught.baseStats).reduce((sum, value) => sum + value, 0), 50);

        function assertCombatPet(unit, expectedHp) {
          assert.equal(unit.name, caught.name);
          assert.deepEqual(identity(unit), originalIdentity);
          assert.deepEqual(panel(unit), formal);
          assert.equal(unit.combatLevel, Math.max(1, level));
          assert.equal(unit.hp, expectedHp);
        }
        function swap(battle, from, to) {
          battle.command('hero', 'summon', to);
          battle.command(from, 'defend');
          assert.deepEqual(battle.pets.filter(pet => pet.deployed).map(pet => pet.id), [to]);
        }

        const sameBattlePet = first.summonTargets().find(pet => pet.id === caught.id);
        assertCombatPet(sameBattlePet, injuredHp);
        swap(first, 'pet', caught.id);
        assertCombatPet(sameBattlePet, injuredHp);
        swap(first, caught.id, 'pet-2');
        assertCombatPet(sameBattlePet, injuredHp);
        swap(first, 'pet-2', caught.id);
        assertCombatPet(sameBattlePet, injuredHp);
        first.command('hero', 'flee');
        first.command(caught.id, 'retreat');
        assert.equal(first.winner, 'enemy');

        const next = make(1, sequence(...encounter), () => isBaby ? 0 : 1, () => 1,
          () => 1, () => 1, () => 0, first.roster);
        assert.deepEqual(panel(next.enemies[0]), expectedPanel);
        assert.deepEqual(next.roster.entries[2], { ...caught, hp: formal[0] });
        assert.deepEqual(next.pets.filter(pet => pet.deployed).map(pet => pet.id), ['pet']);
        const recovered = next.summonTargets().find(pet => pet.id === caught.id);
        assertCombatPet(recovered, formal[0]);
        swap(next, 'pet', caught.id);
        assertCombatPet(recovered, formal[0]);
        assert.equal(sameBattlePet.hp, injuredHp);
      }
    });
  }
}

test('initial and captured Tingwa keep their formal panels after swapping and restarting', () => {
  const first = make(2, sequence(0, 0, 0, 0));
  first.command('hero', 'capture', 'enemy-0');
  first.command('pet', 'defend');
  first.command('hero', 'summon', 'pet-2');
  first.command('pet', 'defend');
  assert.deepEqual(first.pets.filter(pet => pet.deployed).map(pet => pet.id), ['pet-2']);
  first.command('hero', 'summon', 'pet');
  first.command('pet-2', 'defend');
  assert.deepEqual(first.pets.filter(pet => pet.deployed).map(pet => pet.id), ['pet']);

  const next = make(1, sequence(0, 0), undefined, undefined, undefined, undefined, undefined, first.roster);
  next.command('hero', 'summon', 'pet-2');
  next.command('pet', 'defend');
  for (const battle of [first, next]) {
    assert.deepEqual(battle.roster.entries.map(pet => [pet.name, pet.origin, pet.level]), [
      ['汀蛙', 'initial', 1], ['汀蛙', 'initial', 1], ['汀蛙', 'captured', 1],
    ]);
    for (const pets of [battle.pets, battle.roster.entries]) {
      assert.deepEqual(pets.map(panel), first.roster.entries.map(pet => panel(petPanel(pet))));
    }
  }
});
