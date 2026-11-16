import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !specifier.endsWith('.ts')
    ? `${specifier}.ts` : specifier, context);
} });
const logic = name => import(`../assets/battle/logic/${name}.ts`);
const { Battle } = await import('../assets/battle/scripts/Battle.ts');
const { OUTSKIRTS, EncounterDistance, cameraOrigin } = await logic('exploration');
const { APTITUDE_KEYS } = await logic('aptitude');
const { levelUpExp } = await logic('hero-progress');
const { BOOK_IDS, DROP_RATES, rollDrops } = await logic('inventory');
const { BABY_CONFIG } = await logic('baby');
const { MUTATION_CONFIG } = await logic('mutation');
const { Roster } = await logic('roster');
const { PET_SKILLS, SKILL_POOLS } = await logic('pet-skills');
const { speciesKeys } = await logic('wild-encounter');
const { bookPlan, applyBook } = await logic('skill-books');
const { rejuvenate, rejuvenationPlan } = await logic('rejuvenation');
const { fusePets } = await logic('pet-fusion');

function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

const sample = (n, draw) => Array.from({ length: n }, (_, i) => draw(i));
const entries = (keys, value) => Object.fromEntries(keys.map(key => [key, value(key)]));
const sum = values => values.reduce((a, b) => a + b, 0);
function counts(values, keys = [...new Set(values)]) {
  const tally = entries(keys, () => 0);
  for (const value of values) tally[value]++;
  return tally;
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return { n, min: sorted[0], mean: sum(sorted) / n, p50: sorted[Math.ceil(n * 0.5) - 1],
    p90: sorted[Math.ceil(n * 0.9) - 1], max: sorted.at(-1) };
}

function traits(pets) {
  return { aptitudes: entries(APTITUDE_KEYS, k => distribution(pets.map(p => p.aptitudes[k]))),
    growth: distribution(pets.map(p => p.growth)), skills: counts(pets.map(p => p.skillIds.length)),
    identity: counts(pets.map(p => `${p.species}/${p.level}/${p.isBaby}/${p.isMutated}`)) };
}

function battleWith(random, { count, roster, baby = random, mutation = random, encounter = random, skills = random } = {}) {
  return new Battle(random, count, 0, roster, baby, random, random, random, mutation, encounter, undefined, skills);
}

const identities = ['wild', 'baby', 'mutated'];
function individual(random, species, identity, levelRoll = random()) {
  const rolls = [(speciesKeys.indexOf(species) + 0.5) / speciesKeys.length, levelRoll];
  return battleWith(random, { count: 1, encounter: () => rolls.shift(),
    baby: () => identity === 'wild' ? 1 : 0, mutation: () => identity === 'mutated' ? 0 : 1 });
}

function encounters(n, random) {
  const { protection, interval } = OUTSKIRTS.encounter;
  let protectionHits = 0, cameraHits = 0;
  const distance = sample(n, () => {
    const counter = new EncounterDistance();
    const mustHit = () => 0;
    if (counter.advance(protection, mustHit) !== undefined) protectionHits++;
    const origin = cameraOrigin(OUTSKIRTS.spawn, OUTSKIRTS, { width: 1334, height: 750 });
    const shifted = cameraOrigin(OUTSKIRTS.spawn, OUTSKIRTS, { width: 800, height: 750 });
    if (origin.x === shifted.x) throw new Error('Camera fixture did not move');
    if (counter.advance(0, mustHit) !== undefined) cameraHits++;
    let travelled = protection, hit;
    while ((hit = counter.advance(interval, random)) === undefined) travelled += interval;
    return travelled + hit;
  });
  const groups = sample(n, () => battleWith(random).enemies);
  const enemies = groups.flat(), babies = enemies.filter(p => p.isBaby);
  const mutated = babies.filter(p => p.isMutated).length;
  const strata = speciesKeys.flatMap(species => identities.map(identity => [species, identity]));
  return { n, distance: distribution(distance), protectionHits, cameraHits,
    counts: counts(groups.map(group => group.length), [1, 2, 3]), enemies: enemies.length,
    babies: babies.length, mutated, babyRate: babies.length / enemies.length, mutationRate: mutated / babies.length || 0,
    traits: Object.fromEntries(strata.map(([species, identity]) => [`${species}/${identity}`,
      traits(sample(n, () => individual(random, species, identity).enemies[0]))])),
    levelUp: entries(identities, identity => {
      const before = captured(random, 'tingwa', identity, 0);
      const after = train(before, before.level + 1, random);
      return { from: before.level, to: after.level, statsBefore: before.baseStats, statsAfter: after.baseStats,
        potentialBefore: before.potential, potentialAfter: after.potential };
    }) };
}

function captured(random, species, identity, levelRoll) {
  const battle = individual(random, species, identity, levelRoll);
  battle.roster.addCaptured(battle.enemies[0]);
  return battle.roster.entries.at(-1);
}

function train(pet, level, random) {
  const roster = new Roster(1, [], { entries: [pet] });
  const exp = sum(sample(level - pet.level, i => levelUpExp(pet.level + i)));
  roster.awardExperience(new Set([pet.id]), exp - pet.exp, random);
  return roster.entries[0];
}

function drops(n, random) {
  return entries(Object.keys(DROP_RATES), mode => {
    const ids = sample(n, () => Object.keys(rollDrops(mode, random))).flat();
    const titles = counts(ids.filter(id => id.startsWith('book:')), BOOK_IDS);
    const hits = { book: sum(Object.values(titles)), ...counts(ids.filter(id => !id.startsWith('book:')),
      ['rejuvenation', 'mutation-rejuvenation']) };
    return { eligible: n, titles, hits, rates: entries(Object.keys(hits), id => hits[id] / n),
      delta: Object.fromEntries(Object.entries(hits).map(([id, count], i) => [id, count - n * DROP_RATES[mode][i]])) };
  });
}

function books(n, random) {
  const item = 'book:thunder', species = 'pangui';
  const available = ['armor', ...Object.keys(PET_SKILLS).filter(id => id !== 'armor' && id !== 'thunder')];
  return sample(9, size => {
    const skillIds = available.slice(0, size);
    const plan = bookPlan({ species, skillIds }, item, { [item]: 1 }, false);
    const outcomes = counts(sample(n, () => applyBook(skillIds, plan, random).replaced ?? 'add'), ['add', ...skillIds]);
    const { add: added, ...replaced } = outcomes;
    return { n, species, skillIds, item, addRate: plan.rate, added, replaced };
  });
}

function rejuvenation(n, random) {
  return entries(['rejuvenation', 'mutation-rejuvenation'], item => {
    const input = captured(random, 'pangui', item === 'rejuvenation' ? 'wild' : 'mutated');
    rejuvenationPlan(input, item, { [item]: 1 }, 'pet', false);
    return { input, ...traits(sample(n, () => rejuvenate(input, random))) };
  });
}

function fusion(n, random) {
  const groups = ['same/normal', 'cross/normal', 'same/mutated', 'cross/mutated'];
  return entries(groups, group => {
    const identity = group.endsWith('/mutated') ? 'mutated' : 'baby';
    const a = { ...train(captured(random, 'tingwa', identity), 10, random),
      skillIds: ['regen', 'combo', 'waterarrow', 'swift'] };
    const species = group.startsWith('same') ? 'tingwa' : 'pangui';
    const b = { ...train(captured(random, species, identity), 12, random), id: 'caught-2',
      skillIds: [...SKILL_POOLS[species].innate, 'regen', 'lifesteal', 'power', 'counter'] };
    const children = sample(n, () => fusePets(a, b, 'fused-1', random));
    const change = (k, from) => distribution(children.map(p => from(p, k) - (from(a, k) + from(b, k)) / 2));
    return { parents: [a, b], species: counts(children.map(p => p.species), speciesKeys),
      aptitudeChange: entries(APTITUDE_KEYS, k => change(k, (p, key) => p.aptitudes[key])),
      growthChange: change(null, p => p.growth),
      inherited: counts(children.map(p => p.skillIds.length - SKILL_POOLS[p.species].innate.length)) };
  });
}

function fight(random, input, skillIds, reactions, procs) {
  const battle = battleWith(random, { count: 2, roster: { entries: [{ ...input, skillIds }] },
    baby: () => 1, encounter: (() => { let i = 0; return () => [0, 0.9][i++ % 2]; })(), skills: () => 0 });
  const [hero, pet] = battle.allies;
  for (const enemy of battle.enemies) enemy.skillIds = reactions;
  const rollSkill = battle.rollSkill.bind(battle);
  // Count the actual Battle eligibility sites, including each eligible hit after combo/protection.
  battle.rollSkill = (actor, id) => {
    const hit = rollSkill(actor, id);
    if (actor.skillIds?.includes(id)) {
      const label = actor.side === 'ally' ? id : `enemy:${id}`;
      const tally = procs[label] ??= { eligible: 0, hits: 0 };
      tally.eligible++;
      tally.hits += Number(hit);
    }
    return hit;
  };
  const effect = { physical: 0, spellDamage: 0, casts: 0, lifesteal: 0, regen: 0 };
  while (battle.phase !== 'ended') {
    if (battle.round > 100) throw new Error('Battle fixture exceeded 100 rounds');
    const target = battle.enemies.find(unit => unit.hp > 0).id;
    for (const actor of battle.pending) battle.command(actor.id, actor === hero ? 'defend' : 'autoAttack', target);
    for (const event of battle.events) {
      if (event.kind === 'heal' && event.targetId === pet.id) effect.lifesteal += event.amount;
      if (event.actorId !== pet.id) continue;
      if (event.kind === 'attack') effect.physical += event.damage;
      if (event.kind === 'spell') {
        effect.casts++;
        effect.spellDamage += sum(event.targets.map(unit => unit.damage));
      }
    }
  }
  effect.regen = sum(battle.log.flatMap(line => {
    const heal = line.match(/回合：(.+) 回血 (\d+) 点/);
    return heal?.[1] === pet.name ? [Number(heal[2])] : [];
  }));
  return { result: battle.result, rounds: battle.round, heroHp: hero.hp, heroMana: hero.mana,
    petHp: pet.hp, petMana: pet.mana, attack: pet.attack, defense: pet.defense, speed: pet.speed, ...effect };
}

function combat(n, random) {
  const input = captured(random, 'tingwa', 'wild', 0.9);
  const seeds = sample(n, () => Math.floor(random() * 2 ** 32));
  const cases = [['none', [], []], ...Object.keys(PET_SKILLS).map(id => [id, [id], []]),
    ['combo+crit', ['combo', 'crit'], []],
    ...['reflect', 'counter'].flatMap(id => [[`none vs ${id}`, [], [id]], [`lifesteal vs ${id}`, ['lifesteal'], [id]]])];
  return Object.fromEntries(cases.map(([name, skills, reactions]) => {
    const procs = {}, runs = seeds.map(seed => fight(rng(seed), input, skills, reactions, procs));
    const { result, ...metrics } = runs[0];
    return [name, { input, skills, reactions, procs, outcomes: counts(runs.map(run => run.result), ['victory', 'defeat']),
      ...entries(Object.keys(metrics), key => distribution(runs.map(run => run[key]))) }];
  }));
}

export function simulate(seed, n) {
  if (!Number.isInteger(seed) || seed < 0 || seed >= 2 ** 32 || !Number.isSafeInteger(n) || n < 1)
    throw new RangeError('Expected a uint32 seed and a positive sample count');
  const random = rng(seed);
  const result = { seed, n, encounters: encounters(n, random), drops: drops(n, random), books: books(n, random),
    rejuvenation: rejuvenation(n, random), fusion: fusion(n, random), combat: combat(n, random) };
  // The natural encounter run yields too few babies to give this conditional rate n eligible trials.
  const hits = sample(n, () => battleWith(random, { count: 1, baby: () => 0 }).enemies[0].isMutated)
    .filter(Boolean).length;
  result.encounters.mutationGivenBaby = { eligible: n, hits, rate: hits / n };
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [seed = '20261116', n = '10000'] = process.argv.slice(2);
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ sha, node: process.version, command: `node tools/p2-14-balance.mjs ${seed} ${n}`,
    ...simulate(Number(seed), Number(n)) }, null, 2));
}
