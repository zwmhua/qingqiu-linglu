import { CONFIG } from './config';
import { captureChance } from '../logic/capture';

export type Side = 'ally' | 'enemy';
export type Command = 'attack' | 'defend' | 'protect' | 'retreat' | 'flee' | 'summon' | 'capture';
export type Unit = {
  id: string; name: string; side: Side; slot: number; level: number;
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
  commands = new Map<string, { command: Command; target?: string }>();
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

  constructor(random: () => number = Math.random, count?: number, initialRage = 0) {
    this.random = random;
    this.heroRage = Math.max(0, Math.min(CONFIG.status.rageMax, initialRage));
    const hero = CONFIG.hero;
    const frog = CONFIG.frog;
    const pet = frog.base;
    this.allies = [
      { id: 'hero', name: hero.name, side: 'ally', slot: 1, level: hero.level,
        hp: hero.hp, maxHp: hero.hp, attack: hero.attack, defense: hero.defense,
        speed: hero.speed, defending: false, left: false, deployed: true },
      { id: 'pet', name: frog.name, side: 'ally', slot: 0, level: frog.level,
        hp: pet.hp, maxHp: pet.hp, attack: pet.attack, defense: pet.defense,
        speed: pet.speed, defending: false, left: false, deployed: true, skill: frog.innateSkill },
      { id: 'pet-2', name: frog.name, side: 'ally', slot: 0, level: frog.level,
        hp: pet.hp, maxHp: pet.hp, attack: pet.attack, defense: pet.defense,
        speed: pet.speed, defending: false, left: false, deployed: false, skill: frog.innateSkill },
    ];
    const quantity = count ?? this.pickCount();
    if (quantity < 1 || quantity > 3) throw new Error('遭遇数量超出配置范围');
    for (let i = 0; i < quantity; i++) {
      const wild = CONFIG.wild;
      this.enemies.push({ id: `enemy-${i}`, name: wild.name, side: 'enemy', slot: i,
        level: wild.level, hp: wild.hp, maxHp: wild.hp, attack: wild.attack,
        defense: wild.defense, speed: wild.speed, defending: false, left: false, deployed: true });
    }
    this.log.push(`遭遇 ${quantity} 只野外汀蛙。`);
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
  get pets(): Unit[] { return this.allies.filter(u => u.id.startsWith('pet')); }
  get pending(): Unit[] { return this.allies.filter(u => u.deployed && u.hp > 0 && !u.left && !this.commands.has(u.id)); }
  summonTargets(): Unit[] {
    if (this.summonsUsed >= CONFIG.summon.maxPerBattle) return [];
    return this.pets.filter(u => !u.deployed && u.hp > 0 && !u.left);
  }
  protectTargets(actorId: string): Unit[] {
    const reserved = new Set([...this.commands.values()]
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

  checkWinner(): Side | null {
    if (this.enemies.every(u => u.hp === 0 || u.left)) this.winner = 'ally';
    else if (this.allies.every(u => !u.deployed || u.hp === 0 || u.left)) this.winner = 'enemy';
    if (this.winner) this.phase = 'ended';
    return this.winner;
  }

  private resolve(): void {
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
        this.summonsUsed++;
        this.events.push({ kind: 'summon', actorId: turn.actor.id, fromId: outgoing?.id, toId: incoming.id });
        this.log.push(`${turn.actor.name} 召唤 ${incoming.name} 上场。`);
        continue;
      }
      if (turn.command === 'capture') {
        const target = this.enemies.find(u => u.id === turn.target && u.hp > 0 && !u.left);
        if (!target) { this.log.push('目标已倒下，无法抓取。'); continue; }
        const success = this.random() < captureChance(target.hp, target.maxHp);
        this.events.push({ kind: success ? 'captureSuccess' : 'captureFail', actorId: turn.actor.id, targetId: target.id });
        if (success) target.left = true;
        this.log.push(success ? `${turn.actor.name} 抓取成功，${target.name} 离场。` : `${turn.actor.name} 抓取 ${target.name} 失败。`);
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
      if (this.checkWinner()) break;
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
