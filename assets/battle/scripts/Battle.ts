import { CONFIG } from './config';
import { captureChance, captureTarget } from '../logic/capture';
import { Roster, petProgress } from '../logic/roster';
import { petCombat } from '../logic/pet-panel';
import type { CarriedPet, RosterState } from '../logic/roster';
import { effectiveLevel, isBabyEncounter } from '../logic/baby';
import { generateAptitudes } from '../logic/aptitude';
import { generateGrowth } from '../logic/growth';
import { generateBaseStats } from '../logic/base-stats';
import type { Aptitudes } from '../logic/aptitude';
import type { BaseStats } from '../logic/base-stats';
import { MUTATION_CONFIG, isMutation, mutateAptitudes } from '../logic/mutation';
import { WILD_SPECIES, pickWildLevel, pickWildSpecies, wildCombat } from '../logic/wild-encounter';
import type { WildSpecies } from '../logic/wild-encounter';
import { HERO_PROGRESSION, awardExperience, confirmPotential, heroPanel } from '../logic/hero-progress';
import type { HeroProgress, LevelProgress } from '../logic/hero-progress';

export type Side = 'ally' | 'enemy';
export type Command = 'attack' | 'defend' | 'protect' | 'retreat' | 'flee' | 'summon' | 'capture';
export type Unit = {
  id: string; name: string; side: Side; slot: number; level: number;
  species?: WildSpecies; isBaby?: boolean; isMutated?: boolean; combatLevel?: number;
  aptitudes?: Aptitudes;
  growth?: number;
  baseStats?: BaseStats;
  hp: number; maxHp: number; attack: number; defense: number; speed: number;
  defending: boolean; left: boolean; deployed: boolean; skill?: string;
};
type Order = { actor: Unit; command: Command; target?: string };
export type AttackEvent = {
  kind: 'attack';
  actorId: string; targetId: string; damage: number; targetDamage: number;
  targetBefore: number; targetAfter: number;
  guardId?: string; guardDamage?: number; guardAfter?: number;
};
export type SummonEvent = { kind: 'summon'; actorId: string; fromId?: string; toId: string };
export type CaptureEvent = { kind: 'captureSuccess' | 'captureFail'; actorId: string; targetId: string };
export type BattleEvent = AttackEvent | SummonEvent | CaptureEvent;

export class Battle {
  allies: Unit[] = [];
  enemies: Unit[] = [];
  roster!: Roster;
  commands = new Map<string, { command: Command; target?: string }>();
  lastCommands = new Map<string, { command: Command; target?: string }>();
  log: string[] = [];
  lastOrder: string[] = [];
  attackEvents: AttackEvent[] = [];
  events: BattleEvent[] = [];
  summonsUsed = 0;
  heroRage: number;
  phase: 'command' | 'ended' = 'command';
  winner: Side | null = null;
  round = 1;
  seconds: number = CONFIG.commandSeconds;
  private random: () => number;
  heroProgress?: HeroProgress;
  selectedPetId: string;
  earnedExp = 0;
  levelsGained = 0;
  readonly participatedPets = new Set<string>();
  private victoryExp = 0;

  constructor(random: () => number = Math.random, count?: number, initialRage = 0,
    previousRoster?: RosterState, babyRandom: () => number = random,
    aptitudeRandom: () => number = Math.random, growthRandom: () => number = Math.random,
    baseStatsRandom: () => number = Math.random, mutationRandom: () => number = Math.random,
    // Fixed-count previews and legacy fixtures retain level-one Tingwa unless given an encounter source.
    encounterRandom: () => number = count === undefined ? random : () => 0,
    progression?: { hero: HeroProgress; selectedPetId?: string; petRandom?: () => number }) {
    this.random = random;
    this.heroRage = Math.max(0, Math.min(CONFIG.status.rageMax, initialRage));
    this.heroProgress = progression?.hero;
    this.selectedPetId = progression?.selectedPetId ?? previousRoster?.entries[0]?.id ?? 'pet';
    const stats = progression ? heroPanel(progression.hero.stats) : undefined;
    const hero = CONFIG.hero;
    const frog = CONFIG.frog;
    const petRandom = progression?.petRandom ?? Math.random;
    const initialPets = previousRoster ? [] : ['pet', 'pet-2'].map((id): Unit => {
      const level = progression ? pickWildLevel(petRandom()) : frog.level;
      const traits = { level, aptitudes: generateAptitudes(false, aptitudeRandom),
        growth: generateGrowth(false, growthRandom), baseStats: generateBaseStats(level, baseStatsRandom) };
      return { id, name: frog.name, side: 'ally', slot: 0, species: 'tingwa',
        isBaby: false, combatLevel: effectiveLevel(level), ...traits, ...petCombat(traits),
        defending: false, left: false, deployed: id === this.selectedPetId, skill: frog.innateSkill };
    });
    this.allies = [
      { id: 'hero', name: hero.name, side: 'ally', slot: 1, level: progression?.hero.level ?? hero.level,
        hp: stats?.maxHp ?? hero.hp, maxHp: stats?.maxHp ?? hero.hp, attack: stats?.attack ?? hero.attack,
        defense: stats?.defense ?? hero.defense, speed: stats?.speed ?? hero.speed,
        combatLevel: effectiveLevel(progression?.hero.level ?? hero.level), defending: false, left: false, deployed: true },
      ...initialPets,
    ];
    this.roster = new Roster(CONFIG.maxCarriedPets, this.pets, previousRoster);
    if (previousRoster) this.allies = [this.allies[0], ...this.roster.entries.map(pet => ({
      id: pet.id, name: pet.name, side: 'ally' as const, slot: 0, level: pet.level,
      species: pet.species, isBaby: pet.isBaby, combatLevel: effectiveLevel(pet.level),
      aptitudes: pet.aptitudes,
      growth: pet.growth,
      baseStats: pet.baseStats,
      isMutated: pet.isMutated,
      hp: pet.maxHp, maxHp: pet.maxHp, attack: pet.attack, defense: pet.defense,
      speed: pet.speed, skill: pet.skill, defending: false, left: false, deployed: pet.id === this.selectedPetId,
    }))];
    this.participatedPets.add(this.selectedPetId);
    const quantity = count ?? this.pickCount();
    if (quantity < 1 || quantity > 3) throw new Error('遭遇数量超出配置范围');
    for (let i = 0; i < quantity; i++) {
      const species = pickWildSpecies(encounterRandom());
      const wild = WILD_SPECIES[species];
      const isBaby = isBabyEncounter(babyRandom(), CONFIG.baby.encounterRate);
      const isMutated = isMutation(mutationRandom(), MUTATION_CONFIG.rate);
      const level = isBaby ? CONFIG.baby.level : pickWildLevel(encounterRandom());
      const aptitudes = generateAptitudes(isBaby, aptitudeRandom, wild.aptitudes);
      this.enemies.push({ id: `enemy-${i}`, name: isBaby ? `${wild.name}宝宝` : `野外${wild.name}`,
        side: 'enemy', slot: i, species, level, isBaby, isMutated, combatLevel: effectiveLevel(level),
        aptitudes: isMutated ? mutateAptitudes(aptitudes, MUTATION_CONFIG.multiplier) : aptitudes,
        growth: generateGrowth(isBaby, growthRandom, wild.growth),
        baseStats: generateBaseStats(level, baseStatsRandom),
        ...wildCombat(species, level), defending: false, left: false, deployed: true });
    }
    const { enemyBaseExp, enemyLevelExp } = HERO_PROGRESSION;
    this.victoryExp = this.enemies.reduce((sum, unit) => sum + enemyBaseExp + enemyLevelExp * effectiveLevel(unit.level), 0);
    this.log.push(`遭遇：${this.enemies.map(enemy => enemy.name).join('、')}。`);
  }

  private pickCount(): number {
    const value = this.random();
    let total = 0;
    for (const option of CONFIG.encounter) {
      total += option.weight;
      if (value < total) return option.count;
    }
    return CONFIG.encounter[CONFIG.encounter.length - 1].count;
  }

  get units(): Unit[] { return [...this.allies, ...this.enemies]; }
  get pets(): Unit[] { return this.allies.filter(u => u.id.startsWith('pet') || u.id.startsWith('caught-')); }
  get pending(): Unit[] { return this.allies.filter(u => u.deployed && u.hp > 0 && !u.left && !this.commands.has(u.id)); }
  summonTargets(): Unit[] {
    if (this.summonsUsed >= CONFIG.summon.maxPerBattle) return [];
    return this.pets.filter(u => !u.deployed && u.hp > 0 && !u.left);
  }
  protectTargets(actorId: string): Unit[] {
    const reserved = new Set(Array.from(this.commands.values())
      .filter(c => c.command === 'protect').map(c => c.target));
    return this.allies.filter(u => u.id !== actorId && u.deployed && u.hp > 0 && !u.left && !reserved.has(u.id));
  }

  command(actorId: string, command: Command, target?: string): void {
    if (this.phase !== 'command') throw new Error('当前不能下达指令');
    const actor = this.allies.find(u => u.id === actorId && u.deployed && u.hp > 0 && !u.left);
    if (!actor || this.commands.has(actorId)) throw new Error('单位不能接收指令');
    if ((command === 'retreat' && actor.id === 'hero') || (command === 'flee' && actor.id !== 'hero')) {
      throw new Error('单位不能使用该离场指令');
    }
    if (command === 'summon' && (actor.id !== 'hero' || !this.summonTargets().some(u => u.id === target))) {
      throw new Error('没有可召唤的灵宠');
    }
    if (command === 'attack' && !this.enemies.some(u => u.id === target && u.hp > 0 && !u.left)) {
      throw new Error('攻击需要存活目标');
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
    this.commands.set(actorId, { command, target });
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
    const confirmed = this.heroProgress;
    if (!confirmed || this.phase !== 'ended') return false;
    const next = confirmPotential(confirmed, preview);
    if (!next) return false;
    persist(next);
    this.heroProgress = next;
    Object.assign(this.allies[0], heroPanel(next.stats));
    return true;
  }

  confirmPetAllocation(id: string, preview: LevelProgress, persist: (pet: CarriedPet) => void): boolean {
    if (!this.heroProgress || this.phase !== 'ended') return false;
    const pet = this.roster.entries.find(entry => entry.id === id);
    if (!pet) return false;
    const next = confirmPotential(petProgress(pet), preview);
    if (!next) return false;
    const { hp: _fullHp, ...panel } = petCombat({ ...pet, baseStats: next.stats });
    const updated = { ...pet, ...panel, baseStats: next.stats, potential: next.potential };
    persist(updated);
    Object.assign(pet, updated);
    const unit = this.pets.find(entry => entry.id === id);
    if (unit) Object.assign(unit, panel, { baseStats: next.stats });
    return true;
  }

  petReleaseBlock(id: string): string | undefined {
    return this.roster.releaseBlock(id, this.selectedPetId, this.phase !== 'ended');
  }

  releasePet(id: string, persist: (pets: CarriedPet[]) => void): boolean {
    if (!this.roster.release(id, this.selectedPetId, this.phase !== 'ended', persist)) return false;
    this.allies = this.allies.filter(unit => unit.id !== id);
    return true;
  }

  checkWinner(): Side | null {
    if (this.phase === 'ended') return this.winner;
    if (this.enemies.every(u => u.hp === 0 || u.left)) this.winner = 'ally';
    else if (this.allies.every(u => !u.deployed || u.hp === 0 || u.left)) this.winner = 'enemy';
    if (this.winner) this.phase = 'ended';
    if (this.winner === 'ally' && this.heroProgress) {
      const before = this.heroProgress.level;
      this.earnedExp = this.victoryExp;
      this.heroProgress = awardExperience(this.heroProgress, this.earnedExp);
      this.levelsGained = this.heroProgress.level - before;
      if (this.levelsGained > 0) {
        const hero = this.allies[0];
        const stats = heroPanel(this.heroProgress.stats);
        Object.assign(hero, stats, { hp: stats.maxHp, level: this.heroProgress.level,
          combatLevel: effectiveLevel(this.heroProgress.level) });
      }
      this.roster.awardExperience(this.participatedPets, this.earnedExp);
      for (const unit of this.pets) {
        const pet = this.roster.entries.find(entry => entry.id === unit.id);
        if (pet && pet.level !== unit.level)
          Object.assign(unit, pet, { combatLevel: effectiveLevel(pet.level) });
      }
    }
    return this.winner;
  }

  private resolve(): void {
    this.lastCommands = new Map(this.commands);
    this.attackEvents = [];
    this.events = [];
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
      if (chosen && ally.deployed && ally.hp > 0 && !ally.left && (chosen.command === 'attack' || chosen.command === 'defend' || chosen.command === 'summon' || chosen.command === 'capture')) {
        turns.push({ actor: ally, ...chosen });
      }
    }
    for (const enemy of this.enemies) {
      if (enemy.hp > 0 && !enemy.left) turns.push({ actor: enemy, command: 'attack' });
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
        this.selectedPetId = incoming.id;
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
          this.allies.push({ ...target, ...carried, side: 'ally', slot: 0,
            defending: false, left: false, deployed: false });
          target.left = true;
        }
        this.log.push(success
          ? `${turn.actor.name} 抓取成功，${target.name} 离场。${target.isMutated ? ' 获得变异灵宠！' : ''}`
          : `${turn.actor.name} 抓取 ${target.name} 失败。`);
        if (this.checkWinner()) break;
        continue;
      }
      const targets = turn.actor.side === 'ally' ? this.enemies : this.allies;
      const target = targets.find(u => u.id === turn.target && u.deployed && u.hp > 0 && !u.left) ??
        (turn.actor.side === 'enemy'
          ? targets.filter(u => u.deployed && u.hp > 0 && !u.left)[Math.floor(this.random() * targets.filter(u => u.deployed && u.hp > 0 && !u.left).length)]
          : targets.find(u => u.deployed && u.hp > 0 && !u.left));
      if (!target) break;
      const d = CONFIG.damage;
      const factor = d.randomMin + this.random() * (d.randomMax - d.randomMin);
      let damage = Math.max(d.min, Math.round((turn.actor.attack - target.defense * d.defenseFactor) * factor));
      const beforeDefense = damage;
      if (target.defending) damage = Math.max(d.min, Math.round(damage * CONFIG.defenseDamageFactor));
      const guard = turn.actor.side === 'enemy'
        ? this.allies.find(u => u.deployed && u.hp > 0 && !u.left && this.commands.get(u.id)?.command === 'protect'
          && this.commands.get(u.id)?.target === target.id)
        : undefined;
      const guardedDamage = guard ? Math.ceil(damage * CONFIG.protection.protectorShare) : 0;
      const targetDamage = damage - guardedDamage;
      const targetBefore = target.hp;
      const guardBefore = guard?.hp;
      if (guard) guard.hp = Math.max(0, guard.hp - guardedDamage);
      target.hp = Math.max(0, target.hp - targetDamage);
      if (target.id === 'hero') this.heroRage = Math.min(CONFIG.status.rageMax,
        this.heroRage + (targetBefore - target.hp) * CONFIG.status.ragePerDamage);
      if (guard?.id === 'hero' && guardBefore !== undefined) this.heroRage = Math.min(CONFIG.status.rageMax,
        this.heroRage + (guardBefore - guard.hp) * CONFIG.status.ragePerDamage);
      const event: AttackEvent = { kind: 'attack', actorId: turn.actor.id, targetId: target.id, damage,
        targetDamage, targetBefore, targetAfter: target.hp,
        guardId: guard?.id, guardDamage: guard ? guardedDamage : undefined, guardAfter: guard?.hp };
      this.attackEvents.push(event);
      this.events.push(event);
      this.log.push(`${turn.actor.name} 攻击 ${target.name}，造成 ${damage} 点伤害${target.defending ? `（防御减伤，原 ${beforeDefense}）` : ''}${guard ? `；${guard.name} 保护分担 ${guardedDamage} 点，${target.name} 承受 ${targetDamage} 点` : ''}。${guard?.hp === 0 ? ` ${guard.name}${guard.id === 'hero' ? '倒地' : '失去战斗能力'}。` : ''}${target.hp === 0 ? ` ${target.name}${target.id === 'hero' ? '倒地' : '失去战斗能力'}。` : ''}`);
      if (this.checkWinner()) {
        if (this.winner === 'ally' && this.commands.get('hero')?.command === 'capture'
          && !this.lastOrder.includes('hero')) this.log.push('没有存活的敌人，抓取取消。');
        break;
      }
    }
    this.commands.clear();
    if (!this.winner) {
      this.round++;
      this.seconds = CONFIG.commandSeconds;
      for (const ally of this.allies) ally.defending = false;
    } else {
      this.log.push(this.winner === 'ally' ? '战斗胜利！' : '战斗失败。');
    }
  }
}
