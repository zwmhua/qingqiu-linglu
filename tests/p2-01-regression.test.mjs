import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !specifier.endsWith('.ts')
    ? `${specifier}.ts` : specifier, context);
} });

const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const { initialHero } = await import('../assets/battle/logic/hero-progress.ts');
const { loadSessionProgress, readProgress } = await import('../assets/battle/logic/local-progress.ts');

const cycle = (...rolls) => {
  let next = 0;
  return () => rolls[next++ % rolls.length];
};

test('fixed encounter, combat, capture and experience match the 3f64cb5 baseline', () => {
  const battle = new Battle(cycle(0.6, 0.1, 0.8, 0.15, 0.4), undefined, 0, undefined,
    cycle(0.02, 0.8), cycle(0.1, 0.9, 0.4, 0.7), cycle(0.2, 0.8, 0.4),
    cycle(0.03, 0.25, 0.48, 0.67, 0.96), cycle(0.1, 0.9), cycle(0.4, 0.85, 0.64),
    { hero: initialHero(), petRandom: cycle(0.05, 0.31) });

  assert.deepEqual(battle.enemies.map(({ species, level, isBaby, isMutated }) =>
    [species, level, isBaby, isMutated]), [['pangui', 0, true, true], ['maomaochong', 4, false, false]]);
  battle.command('hero', 'protect', 'pet');
  battle.command('pet', 'attack', 'enemy-1');
  assert.deepEqual(battle.attackEvents.map(({ actorId, targetId, damage, targetDamage, guardDamage }) =>
    [actorId, targetId, damage, targetDamage, guardDamage]),
  [['pet', 'enemy-1', 10, 10, undefined], ['enemy-1', 'pet', 8, 4, 4], ['enemy-0', 'hero', 3, 3, undefined]]);
  assert.equal(battle.heroRage, 7);

  battle.command('hero', 'capture', 'enemy-0');
  battle.command('pet', 'defend');
  assert.deepEqual(battle.events.at(-1), { kind: 'captureSuccess', actorId: 'hero', targetId: 'enemy-0' });
  const captured = battle.roster.entries.at(-1);
  assert.deepEqual(captured, {
    id: 'caught-1', species: 'pangui', name: '磐龟宝宝', hp: 45, maxHp: 59, level: 0,
    attack: 12, defense: 14, speed: 10, skill: undefined, isBaby: true,
    aptitudes: { attack: 1090, defense: 1095, stamina: 4089, mana: 1369, dodge: 1500, speed: 958 },
    growth: 0.907, baseStats: { constitution: 10, mana: 10, strength: 10, endurance: 10, agility: 10 },
    isMutated: true, origin: 'captured', sourceEnemyId: 'enemy-0', exp: 0, potential: 0,
  });

  for (let turn = 0; turn < 2 && !battle.winner; turn++) {
    for (const unit of battle.pending) battle.command(unit.id, 'attack', 'enemy-1');
  }
  assert.deepEqual([battle.winner, battle.round, battle.earnedExp, battle.levelsGained], ['ally', 4, 26, 1]);
  assert.deepEqual(battle.heroProgress, {
    level: 1, exp: 16, potential: 5,
    stats: { constitution: 11, mana: 11, strength: 11, endurance: 11, agility: 11 },
  });
  assert.deepEqual(battle.roster.entries.map(({ id, level, exp, potential }) => [id, level, exp, potential]),
    [['pet', 2, 6, 5], ['pet-2', 2, 0, 0], ['caught-1', 0, 0, 0]]);
});

test('old v1 and v2 snapshots read as v3 with the same progress and formal pet panel', () => {
  const hero = { level: 0, exp: 0, potential: 0,
    stats: { constitution: 10, mana: 10, strength: 10, endurance: 10, agility: 10 } };
  const pets = ['pet', 'pet-2'].map(id => ({
    id, name: '汀蛙', species: 'tingwa', hp: 33, maxHp: 33, level: 1, attack: 10, defense: 9,
    speed: 9, skill: '露珠弹', isBaby: false, isMutated: false, origin: 'initial', growth: 0.882,
    aptitudes: { attack: 918, defense: 714, stamina: 2295, mana: 1020, dodge: 867, speed: 1122 },
    baseStats: { constitution: 12, mana: 12, strength: 12, endurance: 12, agility: 12 },
  }));
  const selectedPetId = 'pet-2';
  for (const version of [1, 2]) {
    const legacyPets = version === 1 ? pets : pets.map(pet => ({ ...pet, exp: 0, potential: 0 }));
    const raw = JSON.stringify({ version, hero, pets: legacyPets, selectedPetId });
    const storage = new Map([['qingqiu-linglu:test-progress', raw]]);
    assert.deepEqual(readProgress({ getItem: key => storage.get(key) ?? null }), {
      version: 3, hero, selectedPetId,
      pets: pets.map(pet => ({ ...pet, exp: 0, potential: 0, hp: 66, maxHp: 66, attack: 13, defense: 16, speed: 13 })),
    });
    const session = loadSessionProgress({ getItem: key => storage.get(key) ?? null });
    assert.deepEqual(session.heroProgress, hero);
    assert.equal(session.selectedPetId, selectedPetId);
    assert.deepEqual(session.roster.entries, readProgress({ getItem: () => raw }).pets);
    assert.equal(storage.get('qingqiu-linglu:test-progress'), raw);
  }
});
