import { CONFIG } from './config';

export type Side = 'ally' | 'enemy';
export type Command = 'attack' | 'defend' | 'protect' | 'retreat' | 'flee';
export type Unit = {
  id: string; name: string; side: Side; slot: number; level: number;
  hp: number; maxHp: number; attack: number; defense: number; speed: number;
  defending: boolean; left: boolean; skill?: string;
};
type Order = { actor: Unit; command: Command; target?: string };
export type AttackEvent = {
  actorId: string; targetId: string; damage: number; targetDamage: number;
  targetBefore: number; targetAfter: number;
  guardId?: string; guardDamage?: number; guardAfter?: number;
};

export class Battle {
  allies: Unit[] = [];
  enemies: Unit[] = [];
  commands = new Map<string, { command: Command; target?: string }>();
  log: string[] = [];
  lastOrder: string[] = [];
  attackEvents: AttackEvent[] = [];
  phase: 'command' | 'ended' = 'command';
  winner: Side | null = null;
  round = 1;
  seconds: number = CONFIG.commandSeconds;
  private random: () => number;

  constructor(random: () => number = Math.random, count?: number) {
    this.random = random;
    const hero = CONFIG.hero;
    const frog = CONFIG.frog;
    const pet = frog.base;
    this.allies = [
      { id: 'hero', name: hero.name, side: 'ally', slot: 1, level: hero.level,
        hp: hero.hp, maxHp: hero.hp, attack: hero.attack, defense: hero.defense,
        speed: hero.speed, defending: false, left: false },
      { id: 'pet', name: frog.name, side: 'ally', slot: 0, level: frog.level,
        hp: pet.hp, maxHp: pet.hp, attack: pet.attack, defense: pet.defense,
        speed: pet.speed, defending: false, left: false, skill: frog.innateSkill },
    ];
    const quantity = count ?? this.pickCount();
    if (quantity < 1 || quantity > 3) throw new Error('遭遇数量超出配置范围');
    for (let i = 0; i < quantity; i++) {
      const wild = CONFIG.wild;
      this.enemies.push({ id: `enemy-${i}`, name: wild.name, side: 'enemy', slot: i,
        level: wild.level, hp: wild.hp, maxHp: wild.hp, attack: wild.attack,
        defense: wild.defense, speed: wild.speed, defending: false, left: false });
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
  get pending(): Unit[] { return this.allies.filter(u => u.hp > 0 && !u.left && !this.commands.has(u.id)); }
  protectTargets(actorId: string): Unit[] {
    const reserved = new Set([...this.commands.values()]
      .filter(c => c.command === 'protect').map(c => c.target));
    return this.allies.filter(u => u.id !== actorId && u.hp > 0 && !u.left && !reserved.has(u.id));
  }

  command(actorId: string, command: Command, target?: string): void {
    if (this.phase !== 'command') throw new Error('当前不能下达指令');
    const actor = this.allies.find(u => u.id === actorId && u.hp > 0 && !u.left);
    if (!actor || this.commands.has(actorId)) throw new Error('单位不能接收指令');
    if ((command === 'retreat' && actor.id !== 'pet') || (command === 'flee' && actor.id !== 'hero')) {
      throw new Error('单位不能使用该离场指令');
    }
    if (command === 'attack' && !this.enemies.some(u => u.id === target && u.hp > 0 && !u.left)) {
      throw new Error('攻击需要存活目标');
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
    else if (this.allies.every(u => u.hp === 0 || u.left)) this.winner = 'enemy';
    if (this.winner) this.phase = 'ended';
    return this.winner;
  }

  private resolve(): void {
    this.attackEvents = [];
    for (const ally of this.allies) {
      const chosen = this.commands.get(ally.id);
      ally.left = ally.left || chosen?.command === 'retreat' || chosen?.command === 'flee';
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
      if (chosen && ally.hp > 0 && !ally.left && (chosen.command === 'attack' || chosen.command === 'defend')) {
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
      if (turn.actor.hp === 0 || turn.actor.left) continue;
      this.lastOrder.push(turn.actor.id);
      if (turn.command === 'defend') continue;
      const targets = turn.actor.side === 'ally' ? this.enemies : this.allies;
      const target = targets.find(u => u.id === turn.target && u.hp > 0 && !u.left) ??
        (turn.actor.side === 'enemy'
          ? targets.filter(u => u.hp > 0 && !u.left)[Math.floor(this.random() * targets.filter(u => u.hp > 0 && !u.left).length)]
          : targets.find(u => u.hp > 0 && !u.left));
      if (!target) break;
      const d = CONFIG.damage;
      const factor = d.randomMin + this.random() * (d.randomMax - d.randomMin);
      let damage = Math.max(d.min, Math.round((turn.actor.attack - target.defense * d.defenseFactor) * factor));
      const beforeDefense = damage;
      if (target.defending) damage = Math.max(d.min, Math.round(damage * CONFIG.defenseDamageFactor));
      const guard = turn.actor.side === 'enemy'
        ? this.allies.find(u => u.hp > 0 && !u.left && this.commands.get(u.id)?.command === 'protect'
          && this.commands.get(u.id)?.target === target.id)
        : undefined;
      const guardedDamage = guard ? Math.ceil(damage * CONFIG.protection.protectorShare) : 0;
      const targetDamage = damage - guardedDamage;
      const targetBefore = target.hp;
      if (guard) guard.hp = Math.max(0, guard.hp - guardedDamage);
      target.hp = Math.max(0, target.hp - targetDamage);
      this.attackEvents.push({ actorId: turn.actor.id, targetId: target.id, damage,
        targetDamage, targetBefore, targetAfter: target.hp,
        guardId: guard?.id, guardDamage: guard ? guardedDamage : undefined, guardAfter: guard?.hp });
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
