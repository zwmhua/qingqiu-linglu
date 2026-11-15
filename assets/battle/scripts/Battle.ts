import { BATTLE_RULES } from '../logic/battle-rules';
import { captureChance, captureTarget } from '../logic/capture';
import { SessionProgress } from '../logic/session-progress';
import type { CarriedPet, RosterState } from '../logic/roster';
import { BABY_CONFIG, effectiveLevel, isBabyEncounter } from '../logic/baby';
import { generateAptitudes } from '../logic/aptitude';
import { generateGrowth } from '../logic/growth';
import { generateBaseStats } from '../logic/base-stats';
import { activeSpells, firstAffordableSpell, generateSkills, PET_SKILLS, spellDamage } from '../logic/pet-skills';
import { effectivePetPanel, petPanel, statPassives, regenAmount } from '../logic/pet-panel';
import type { Aptitudes } from '../logic/aptitude';
import type { BaseStats } from '../logic/base-stats';
import { MUTATION_CONFIG, isMutation, mutateAptitudes } from '../logic/mutation';
import { WILD_SPECIES, pickWildLevel, pickWildSpecies, wildCombat } from '../logic/wild-encounter';
import type { WildSpecies } from '../logic/wild-encounter';
import { HERO_PROGRESSION, awardExperience, heroPanel, initialHero } from '../logic/hero-progress';
import type { HeroProgress, LevelProgress } from '../logic/hero-progress';

export type Side = 'ally' | 'enemy';
export type Command = 'attack' | 'defend' | 'protect' | 'retreat' | 'flee' | 'summon' | 'capture' | 'spell' | 'autoAttack';
export type Unit = {
  id: string; name: string; side: Side; slot: number; level: number;
  species?: WildSpecies; isBaby?: boolean; isMutated?: boolean; combatLevel?: number;
  aptitudes?: Aptitudes;
  growth?: number;
  baseStats?: BaseStats;
  hp: number; maxHp: number; attack: number; defense: number; speed: number;
  mana: number; maxMana: number; spirit: number;
  defending: boolean; left: boolean; deployed: boolean; skill?: string; skillIds?: string[];
};
type Choice = { command: Command; target?: string; skillId?: string };
type Order = Choice & { actor: Unit };
export type AttackEvent = {
  kind: 'attack'; source: 'main' | 'reflect' | 'counter'; caption: string;
  logIndex: number; actorId: string; targetId: string; damage: number; targetDamage: number;
  targetBefore: number; targetAfter: number;
  guardId?: string; guardDamage?: number; guardAfter?: number;
};
export type SummonEvent = { kind: 'summon'; actorId: string; fromId?: string; toId: string };
export type CaptureEvent = { kind: 'captureSuccess' | 'captureFail'; actorId: string; targetId: string };
type HealEvent = { kind: 'heal'; logIndex: number; targetId: string; amount: number; targetAfter: number };
export type SpellEvent = {
  kind: 'spell'; actorId: string; logIndex: number; skillId: string; manaAfter: number;
  targets: readonly { targetId: string; damage: number; hpAfter: number }[];
};
export type BattleEvent = AttackEvent | SummonEvent | CaptureEvent | HealEvent | SpellEvent;
const inBattle = (u: Unit): boolean => u.deployed && u.hp > 0 && !u.left;
const filledMana = <T extends { maxMana: number }>(stats: T) => ({ ...stats, mana: stats.maxMana });

export class Battle {
  allies: Unit[] = [];
  enemies: Unit[] = [];
  readonly session: SessionProgress;
  get roster() { return this.session.roster; }
  commands = new Map<string, Choice>();
  lastCommands = new Map<string, Choice>();
  log: string[] = [];
  lastOrder: string[] = [];
  attackEvents: AttackEvent[] = [];
  events: BattleEvent[] = [];
  manaBefore = new Map<string, number>();
  maxManaBefore = new Map<string, number>();
  summonsUsed = 0;
  heroRage: number;
  phase: 'command' | 'ended' = 'command';
  winner: Side | null = null;
  result?: 'victory' | 'defeat' | 'escaped';
  round = 1;
  seconds: number = BATTLE_RULES.commandSeconds;
  private random: () => number;
  get heroProgress() { return this.session.heroProgress; }
  get selectedPetId() { return this.session.selectedPetId; }
  earnedExp = 0;
  levelsGained = 0;
  readonly participatedPets = new Set<string>();
  private victoryExp = 0;

  constructor(random: () => number = Math.random, count?: number, initialRage = 0,
    previousRoster?: RosterState | SessionProgress, babyRandom: () => number = random,
    aptitudeRandom: () => number = Math.random, growthRandom: () => number = Math.random,
    baseStatsRandom: () => number = Math.random, mutationRandom: () => number = Math.random,
    // Fixed-count previews and legacy fixtures retain level-one Tingwa unless given an encounter source.
    encounterRandom: () => number = count === undefined ? random : () => 0,
    progression?: { hero: HeroProgress; selectedPetId?: string; petRandom?: () => number }, skillRandom = Math.random) {
    this.random = random;
    this.heroRage = Math.max(0, Math.min(BATTLE_RULES.status.rageMax, initialRage));
    this.session = previousRoster instanceof SessionProgress ? previousRoster
      : new SessionProgress(progression?.hero, previousRoster, progression?.selectedPetId,
        progression?.petRandom, aptitudeRandom, growthRandom, baseStatsRandom, skillRandom);
    const progress = this.heroProgress;
    const stats = progress ? heroPanel(progress.stats) : undefined;
    const hero = BATTLE_RULES.hero;
    const maxMana = stats?.maxMana ?? BATTLE_RULES.status.heroManaMax;
    this.allies = [
      { id: 'hero', name: hero.name, side: 'ally', slot: 1, level: progress?.level ?? hero.level,
        hp: stats?.maxHp ?? hero.hp, maxHp: stats?.maxHp ?? hero.hp, attack: stats?.attack ?? hero.attack,
        mana: maxMana, maxMana, spirit: stats?.spirit ?? heroPanel(initialHero().stats).spirit,
        defense: stats?.defense ?? hero.defense, speed: stats?.speed ?? hero.speed,
        combatLevel: effectiveLevel(progress?.level ?? hero.level), defending: false, left: false, deployed: true },
    ];
    this.roster.beginBattle();
    this.allies.push(...this.roster.entries.map(pet => ({
      id: pet.id, name: pet.name, side: 'ally' as const, slot: 0, level: pet.level,
      species: pet.species, isBaby: pet.isBaby, combatLevel: effectiveLevel(pet.level),
      aptitudes: pet.aptitudes,
      growth: pet.growth,
      baseStats: pet.baseStats,
      skillIds: [...(pet.skillIds ?? [])],
      isMutated: pet.isMutated,
      hp: pet.maxHp, ...filledMana(effectivePetPanel(pet)),
      skill: pet.skill, defending: false, left: false, deployed: pet.id === this.selectedPetId,
    })));
    this.participatedPets.add(this.selectedPetId);
    const quantity = count ?? this.pickCount();
    const counts = BATTLE_RULES.encounter;
    if (quantity < counts[0].count || quantity > counts[counts.length - 1].count)
      throw new Error('遭遇数量超出配置范围');
    for (let i = 0; i < quantity; i++) {
      const species = pickWildSpecies(encounterRandom());
      const wild = WILD_SPECIES[species];
      const isBaby = isBabyEncounter(babyRandom(), BABY_CONFIG.encounterRate);
      const isMutated = isBaby && isMutation(mutationRandom(), MUTATION_CONFIG.rate);
      const level = isBaby ? BABY_CONFIG.level : pickWildLevel(encounterRandom());
      const baseAptitudes = generateAptitudes(isBaby, aptitudeRandom, wild.aptitudes);
      const aptitudes = isMutated ? mutateAptitudes(baseAptitudes, MUTATION_CONFIG.multiplier) : baseAptitudes;
      const growth = generateGrowth(isBaby, growthRandom, wild.growth);
      const baseStats = generateBaseStats(level, baseStatsRandom);
      const { maxMana, spirit } = petPanel({ level, aptitudes, growth, baseStats });
      this.enemies.push({ id: `enemy-${i}`, name: isBaby ? `${wild.name}宝宝` : `野外${wild.name}`,
        side: 'enemy', slot: i, species, level, isBaby, isMutated, combatLevel: effectiveLevel(level),
        aptitudes, growth, baseStats, mana: maxMana, maxMana, spirit,
        skillIds: generateSkills(species, isMutated, skillRandom),
        ...wildCombat(species, level), defending: false, left: false, deployed: true });
    }
    for (const enemy of this.enemies) Object.assign(enemy, statPassives(enemy, enemy.level, enemy.skillIds));
    const { enemyBaseExp, enemyLevelExp } = HERO_PROGRESSION;
    this.victoryExp = this.enemies.reduce((sum, unit) => sum + enemyBaseExp + enemyLevelExp * effectiveLevel(unit.level), 0);
    this.log.push(`遭遇：${this.enemies.map(enemy => enemy.name).join('、')}。`);
    this.beginRound();
  }

  private beginRound(): void {
    for (const unit of this.units) {
      const amount = regenAmount(unit);
      if (!amount) continue;
      unit.hp += amount;
      this.log.push(`第 ${this.round} 回合：${unit.name} 回血 ${amount} 点。`);
    }
  }

  private pickCount(): number {
    const value = this.random();
    let total = 0;
    for (const option of BATTLE_RULES.encounter) {
      total += option.weight;
      if (value < total) return option.count;
    }
    return BATTLE_RULES.encounter[BATTLE_RULES.encounter.length - 1].count;
  }

  get units(): Unit[] { return [...this.allies, ...this.enemies]; }
  get pets(): Unit[] { return this.allies.filter(u => u.id.startsWith('pet') || u.id.startsWith('caught-')); }
  get pending(): Unit[] { return this.allies.filter(u => u.deployed && u.hp > 0 && !u.left && !this.commands.has(u.id)); }
  summonTargets(): Unit[] {
    if (this.summonsUsed >= BATTLE_RULES.summon.maxPerBattle) return [];
    return this.pets.filter(u => !u.deployed && u.hp > 0 && !u.left);
  }
  protectTargets(actorId: string): Unit[] {
    const reserved = new Set(Array.from(this.commands.values())
      .filter(c => c.command === 'protect').map(c => c.target));
    return this.allies.filter(u => u.id !== actorId && u.deployed && u.hp > 0 && !u.left && !reserved.has(u.id));
  }

  command(actorId: string, command: Command, target?: string, skillId?: string): void {
    if (this.phase !== 'command') throw new Error('当前不能下达指令');
    const actor = this.allies.find(u => u.id === actorId && u.deployed && u.hp > 0 && !u.left);
    if (!actor || this.commands.has(actorId)) throw new Error('单位不能接收指令');
    if ((command === 'retreat' && actor.id === 'hero') || (command === 'flee' && actor.id !== 'hero')) {
      throw new Error('单位不能使用该离场指令');
    }
    if (command === 'summon' && (actor.id !== 'hero' || !this.summonTargets().some(u => u.id === target))) {
      throw new Error('没有可召唤的灵宠');
    }
    if ((command === 'attack' || command === 'autoAttack' || command === 'spell')
      && !this.enemies.some(u => u.id === target && inBattle(u))) {
      throw new Error('攻击需要存活目标');
    }
    if (command === 'spell') {
      if (actor.id === 'hero' || !skillId || !activeSpells(actor.skillIds).includes(skillId))
        throw new Error('未学会该灵术');
      if (actor.mana < PET_SKILLS[skillId].params.mana) throw new Error('法力不足');
    }
    if (command === 'capture') {
      if (actor.id !== 'hero') throw new Error('只有撷灵客才能抓取');
      if (this.roster.full) throw new Error(`携带已满（${this.roster.entries.length}/${this.roster.capacity}），无法抓取`);
      const enemy = this.enemies.find(u => u.id === target);
      if (enemy?.hp === 0) throw new Error('已倒下，无法抓取');
      if (!enemy || enemy.left) throw new Error('抓取需要存活目标');
    }
    if (command === 'protect') {
      if (!this.protectTargets(actorId).some(u => u.id === target)) {
        throw new Error('保护需要其他存活的我方目标');
      }
    }
    this.commands.set(actorId, { command, target, ...(command === 'spell' && { skillId }) });
    if (this.pending.length === 0) this.resolve();
  }

  timeout(): void {
    if (this.phase !== 'command') return;
    const target = this.enemies.find(u => u.hp > 0 && !u.left)?.id;
    if (!target) return;
    for (const actor of this.pending) this.commands.set(actor.id, { command: 'attack', target });
    this.log.push('指令时间结束，未选择的单位自动攻击。');
    this.resolve();
  }

  tick(seconds: number): void {
    if (this.phase !== 'command') return;
    this.seconds = Math.max(0, this.seconds - seconds);
    if (this.seconds === 0) this.timeout();
  }

  confirmHeroAllocation(preview: HeroProgress, persist: (hero: HeroProgress) => void): boolean {
    if (!this.session.confirmHeroAllocation(this.phase !== 'ended', preview, persist)) return false;
    Object.assign(this.allies[0], heroPanel(this.heroProgress!.stats));
    return true;
  }

  confirmPetAllocation(id: string, preview: LevelProgress, persist: (pet: CarriedPet) => void): boolean {
    if (!this.session.confirmPetAllocation(this.phase !== 'ended', id, preview, persist)) return false;
    const pet = this.roster.entries.find(entry => entry.id === id)!;
    const unit = this.pets.find(entry => entry.id === id);
    if (unit) Object.assign(unit, effectivePetPanel(pet), { baseStats: pet.baseStats });
    return true;
  }

  petReleaseBlock(id: string): string | undefined {
    return this.roster.releaseBlock(id, this.selectedPetId, this.phase !== 'ended');
  }

  releasePet(id: string, persist: (pets: CarriedPet[]) => void): boolean {
    if (!this.session.releasePet(this.phase !== 'ended', id, persist)) return false;
    this.allies = this.allies.filter(unit => unit.id !== id);
    return true;
  }

  checkWinner(): Side | null {
    if (this.phase === 'ended') return this.winner;
    if (this.enemies.every(u => u.hp === 0 || u.left)) this.winner = 'ally';
    else if (this.allies.every(u => !u.deployed || u.hp === 0 || u.left)) this.winner = 'enemy';
    if (this.winner) {
      this.phase = 'ended';
      this.result = this.winner === 'ally' ? 'victory' : 'defeat';
    }
    if (this.winner === 'ally' && this.heroProgress) {
      const before = this.heroProgress.level;
      this.earnedExp = this.victoryExp;
      this.session.heroProgress = awardExperience(this.heroProgress, this.earnedExp);
      this.levelsGained = this.heroProgress.level - before;
      if (this.levelsGained > 0) {
        const hero = this.allies[0];
        const stats = heroPanel(this.heroProgress.stats);
        Object.assign(hero, filledMana(stats), { hp: stats.maxHp, level: this.heroProgress.level,
          combatLevel: effectiveLevel(this.heroProgress.level) });
      }
      this.roster.awardExperience(this.participatedPets, this.earnedExp);
      for (const unit of this.pets) {
        const pet = this.roster.entries.find(entry => entry.id === unit.id);
        if (pet && pet.level !== unit.level)
          Object.assign(unit, pet, filledMana(effectivePetPanel(pet)), { combatLevel: effectiveLevel(pet.level) });
      }
    }
    return this.winner;
  }

  private resolve(): void {
    this.lastCommands = new Map(this.commands);
    this.attackEvents = [];
    this.events = [];
    this.manaBefore = new Map(this.units.map(unit => [unit.id, unit.mana]));
    this.maxManaBefore = new Map(this.units.map(unit => [unit.id, unit.maxMana]));
    if (this.commands.get('hero')?.command === 'flee' && this.allies[0].hp > 0) {
      for (const ally of this.allies) ally.left = true;
      this.result = 'escaped';
      this.winner = 'enemy'; // Preserve the legacy Side API; callers use result for the reason.
      this.phase = 'ended';
      this.commands.clear();
      this.log.push('撷灵客带领整队离开战斗。');
      return;
    }
    for (const ally of this.allies) {
      const chosen = this.commands.get(ally.id);
      ally.left = ally.left || chosen?.command === 'retreat' || chosen?.command === 'flee';
      if (chosen?.command === 'retreat') ally.deployed = false;
      if (chosen?.command === 'retreat' || chosen?.command === 'flee') this.log.push(`${ally.name} 离开战斗。`);
      ally.defending = ally.hp > 0 && !ally.left && chosen?.command === 'defend';
      if (ally.defending) this.log.push(`${ally.name} 进入防御姿态。`);
      if (chosen?.command === 'protect') {
        this.log.push(`${ally.name} 保护 ${this.allies.find(u => u.id === chosen.target)?.name}。`);
      }
    }
    if (this.checkWinner()) {
      this.commands.clear();
      this.log.push(this.winner === 'ally' ? '战斗胜利！' : '战斗失败。');
      return;
    }
    const turns: Order[] = [];
    for (const ally of this.allies) {
      const chosen = this.commands.get(ally.id);
      if (chosen && inBattle(ally) && chosen.command !== 'protect') {
        turns.push({ actor: ally, ...chosen });
      }
    }
    for (const enemy of this.enemies) {
      if (inBattle(enemy)) turns.push({ actor: enemy, command: 'autoAttack' });
    }
    turns.sort((a, b) => b.actor.speed - a.actor.speed ||
      (a.actor.side === b.actor.side ? a.actor.slot - b.actor.slot : a.actor.side === 'ally' ? -1 : 1));
    this.lastOrder = [];
    for (const turn of turns) {
      if (turn.actor.hp === 0 || turn.actor.left || !turn.actor.deployed) continue;
      this.lastOrder.push(turn.actor.id);
      if (turn.command === 'defend') continue;
      if (turn.command === 'summon') {
        const incoming = this.summonTargets().find(u => u.id === turn.target);
        if (!incoming) continue;
        const outgoing = this.pets.find(u => u.deployed);
        if (outgoing) outgoing.deployed = false;
        incoming.deployed = true;
        this.session.selectedPetId = incoming.id;
        this.participatedPets.add(incoming.id);
        this.summonsUsed++;
        this.events.push({ kind: 'summon', actorId: turn.actor.id, fromId: outgoing?.id, toId: incoming.id });
        this.log.push(`${turn.actor.name} 召唤 ${incoming.name} 上场。`);
        continue;
      }
      if (turn.command === 'capture') {
        const target = captureTarget(this.enemies, turn.target, this.random);
        if (!target) { this.log.push('没有存活的敌人，抓取取消。'); continue; }
        if (target.id !== turn.target) this.log.push(`原抓取目标已倒下，改抓 ${target.name}。`);
        if (this.roster.full) { this.log.push('携带已满，无法抓取。'); continue; }
        const success = this.random() < captureChance(target.hp, target.maxHp);
        this.events.push({ kind: success ? 'captureSuccess' : 'captureFail', actorId: turn.actor.id, targetId: target.id });
        if (success) {
          if (!this.roster.addCaptured(target)) throw new Error('携带记录无法新增');
          const carried = this.roster.entries[this.roster.entries.length - 1];
          this.allies.push({ ...target, ...carried, ...filledMana(effectivePetPanel(carried)), side: 'ally', slot: 0,
            defending: false, left: false, deployed: false });
          target.left = true;
        }
        this.log.push(success
          ? `${turn.actor.name} 抓取成功，${target.name} 离场。${target.isMutated ? ' 获得变异灵宠！' : ''}`
          : `${turn.actor.name} 抓取 ${target.name} 失败。`);
        if (this.checkWinner()) break;
        continue;
      }
      const targets = (turn.actor.side === 'ally' ? this.enemies : this.allies).filter(inBattle);
      const chosenTarget = targets.find(u => u.id === turn.target);
      let skillId = turn.command === 'autoAttack' && turn.actor.id !== 'hero'
        ? firstAffordableSpell(turn.actor) : turn.skillId;
      if (skillId && turn.actor.mana < PET_SKILLS[skillId].params.mana) {
        this.log.push(`${turn.actor.name} 法力不足，改为普攻。`);
        skillId = undefined;
      }
      if (skillId && turn.command === 'spell' && !chosenTarget) continue;
      const target = chosenTarget ??
        targets[turn.actor.side === 'enemy' && targets.length ? Math.floor(this.random() * targets.length) : 0];
      if (!target) break;
      if (skillId) this.cast(turn.actor, target, skillId);
      else this.attack(turn.actor, target);
      if (this.checkWinner()) {
        if (this.winner === 'ally' && this.commands.get('hero')?.command === 'capture'
          && !this.lastOrder.includes('hero')) this.log.push('没有存活的敌人，抓取取消。');
        break;
      }
    }
    this.commands.clear();
    if (!this.winner) {
      this.round++;
      this.seconds = BATTLE_RULES.commandSeconds;
      for (const ally of this.allies) ally.defending = false;
      this.beginRound();
    } else {
      this.log.push(this.winner === 'ally' ? '战斗胜利！' : '战斗失败。');
    }
  }

  private cast(actor: Unit, target: Unit, skillId: string): void {
    const skill = PET_SKILLS[skillId];
    const damage = spellDamage(skillId, actor, target.spirit);
    actor.mana -= skill.params.mana;
    this.loseHp(target, damage);
    this.events.push({ kind: 'spell', actorId: actor.id, skillId, manaAfter: actor.mana,
      logIndex: this.log.length, targets: [{ targetId: target.id, damage, hpAfter: target.hp }] });
    this.log.push(`${actor.name} 施放 ${skill.name}，对 ${target.name} 造成 ${damage} 点伤害。`);
  }

  private attack(actor: Unit, target: Unit): void {
    const combo = this.rollSkill(actor, 'combo');
    for (let hit = 0; hit < (combo ? PET_SKILLS.combo.params.hits : 1); hit++) {
      if (!inBattle(actor) || !inBattle(target)) break;
      const crit = this.rollSkill(actor, 'crit');
      const multiplier = (combo ? 1 - PET_SKILLS.combo.params.reduction : 1)
        * (crit ? PET_SKILLS.crit.params.multiplier : 1);
      const caption = [combo && PET_SKILLS.combo.name, crit && PET_SKILLS.crit.name].filter(Boolean).join('·');
      const { lost, guardLost } = this.strike(actor, target, this.physicalDamage(actor, target, multiplier), 'main', caption);
      this.lifesteal(actor, lost + guardLost);
      if (!lost || !inBattle(target) || !inBattle(actor)) continue;
      if (this.rollSkill(target, 'reflect')) {
        const damage = Math.floor(lost * PET_SKILLS.reflect.params.ratio);
        this.strike(target, actor, damage, 'reflect', PET_SKILLS.reflect.name);
      }
      if (inBattle(actor) && this.rollSkill(target, 'counter')) {
        const damage = this.physicalDamage(target, actor, PET_SKILLS.counter.params.ratio);
        this.strike(target, actor, damage, 'counter', PET_SKILLS.counter.name);
      }
    }
  }

  private rollSkill(unit: Unit, id: 'combo' | 'crit' | 'reflect' | 'counter'): boolean {
    return unit.skillIds?.includes(id) === true && this.random() < PET_SKILLS[id].params.rate;
  }

  private physicalDamage(actor: Unit, target: Unit, multiplier: number): number {
    const d = BATTLE_RULES.damage;
    const factor = d.randomMin + this.random() * (d.randomMax - d.randomMin);
    return Math.max(d.min, Math.round((actor.attack - target.defense * d.defenseFactor) * factor * multiplier));
  }

  private lifesteal(actor: Unit, lost: number): void {
    if (!actor.skillIds?.includes('lifesteal')) return;
    const amount = Math.min(actor.maxHp - actor.hp, Math.floor(lost * PET_SKILLS.lifesteal.params.ratio));
    if (amount <= 0) return;
    actor.hp += amount;
    this.events.push({ kind: 'heal', logIndex: this.log.length, targetId: actor.id, amount, targetAfter: actor.hp });
    this.log.push(`${actor.name} ${PET_SKILLS.lifesteal.name}，回复 ${amount} 点气血。`);
  }

  private loseHp(unit: Unit, damage: number): number {
    const before = unit.hp;
    unit.hp = Math.max(0, before - damage);
    const lost = before - unit.hp;
    if (unit.id === 'hero') this.heroRage = Math.min(BATTLE_RULES.status.rageMax,
      this.heroRage + lost * BATTLE_RULES.status.ragePerDamage);
    return lost;
  }

  private strike(actor: Unit, target: Unit, beforeDefense: number, source: AttackEvent['source'], caption: string) {
    const defending = source !== 'reflect' && target.defending;
    const damage = defending
      ? Math.max(BATTLE_RULES.damage.min, Math.round(beforeDefense * BATTLE_RULES.defenseDamageFactor)) : beforeDefense;
    const guard = source === 'main' && actor.side === 'enemy'
      ? this.allies.find(u => inBattle(u) && this.commands.get(u.id)?.command === 'protect'
        && this.commands.get(u.id)?.target === target.id)
      : undefined;
    const guardedDamage = guard ? Math.ceil(damage * BATTLE_RULES.protection.protectorShare) : 0;
    const targetDamage = damage - guardedDamage;
    const targetBefore = target.hp;
    const guardLost = guard ? this.loseHp(guard, guardedDamage) : 0;
    const lost = this.loseHp(target, targetDamage);
    const event: AttackEvent = { kind: 'attack', source, caption, logIndex: this.log.length,
      actorId: actor.id, targetId: target.id, damage,
      targetDamage, targetBefore, targetAfter: target.hp,
      guardId: guard?.id, guardDamage: guard ? guardedDamage : undefined, guardAfter: guard?.hp };
    this.attackEvents.push(event);
    this.events.push(event);
    const action = caption || '攻击';
    this.log.push(`${actor.name} ${action} ${target.name}，造成 ${damage} 点伤害${defending ? `（防御减伤，原 ${beforeDefense}）` : ''}${guard ? `；${guard.name} 保护分担 ${guardedDamage} 点，${target.name} 承受 ${targetDamage} 点` : ''}。${guard?.hp === 0 ? ` ${guard.name}${guard.id === 'hero' ? '倒地' : '失去战斗能力'}。` : ''}${target.hp === 0 ? ` ${target.name}${target.id === 'hero' ? '倒地' : '失去战斗能力'}。` : ''}`);
    return { lost, guardLost };
  }
}
