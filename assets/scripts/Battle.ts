import { CONFIG } from './config';

export type Side = 'ally' | 'enemy';
export type Command = 'attack' | 'defend';
export type Unit = {
  id: string; name: string; side: Side; slot: number; level: number;
  hp: number; maxHp: number; attack: number; defense: number; speed: number;
  defending: boolean; skill?: string;
};
type Order = { actor: Unit; command: Command; target?: string };

export class Battle {
  allies: Unit[] = [];
  enemies: Unit[] = [];
  commands = new Map<string, { command: Command; target?: string }>();
  log: string[] = [];
  lastOrder: string[] = [];
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
        speed: hero.speed, defending: false },
      { id: 'pet', name: frog.name, side: 'ally', slot: 0, level: frog.level,
        hp: pet.hp, maxHp: pet.hp, attack: pet.attack, defense: pet.defense,
        speed: pet.speed, defending: false, skill: frog.innateSkill },
    ];
    const quantity = count ?? this.pickCount();
    if (quantity < 1 || quantity > 3) throw new Error('遭遇数量超出配置范围');
    for (let i = 0; i < quantity; i++) {
      const wild = CONFIG.wild;
      this.enemies.push({ id: `enemy-${i}`, name: wild.name, side: 'enemy', slot: i,
        level: wild.level, hp: wild.hp, maxHp: wild.hp, attack: wild.attack,
        defense: wild.defense, speed: wild.speed, defending: false });
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
  get pending(): Unit[] { return this.allies.filter(u => u.hp > 0 && !this.commands.has(u.id)); }

  command(actorId: string, command: Command, target?: string): void {
    if (this.phase !== 'command') throw new Error('当前不能下达指令');
    const actor = this.allies.find(u => u.id === actorId && u.hp > 0);
    if (!actor || this.commands.has(actorId)) throw new Error('单位不能接收指令');
    if (command === 'attack' && !this.enemies.some(u => u.id === target && u.hp > 0)) {
      throw new Error('攻击需要存活目标');
    }
    this.commands.set(actorId, { command, target });
    if (this.pending.length === 0) this.resolve();
  }

  timeout(): void {
    if (this.phase !== 'command') return;
    const target = this.enemies.find(u => u.hp > 0)?.id;
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
    if (this.enemies.every(u => u.hp === 0)) this.winner = 'ally';
    else if (this.allies.every(u => u.hp === 0)) this.winner = 'enemy';
    if (this.winner) this.phase = 'ended';
    return this.winner;
  }

  private resolve(): void {
    for (const ally of this.allies) {
      ally.defending = ally.hp > 0 && this.commands.get(ally.id)?.command === 'defend';
      if (ally.defending) this.log.push(`${ally.name} 进入防御姿态。`);
    }
    const turns: Order[] = [];
    for (const ally of this.allies) {
      const chosen = this.commands.get(ally.id);
      if (chosen && ally.hp > 0) turns.push({ actor: ally, ...chosen });
    }
    for (const enemy of this.enemies) {
      if (enemy.hp > 0) turns.push({ actor: enemy, command: 'attack' });
    }
    turns.sort((a, b) => b.actor.speed - a.actor.speed ||
      (a.actor.side === b.actor.side ? a.actor.slot - b.actor.slot : a.actor.side === 'ally' ? -1 : 1));
    this.lastOrder = [];
    for (const turn of turns) {
      if (turn.actor.hp === 0) continue;
      this.lastOrder.push(turn.actor.id);
      if (turn.command === 'defend') continue;
      const targets = turn.actor.side === 'ally' ? this.enemies : this.allies;
      const target = targets.find(u => u.id === turn.target && u.hp > 0) ??
        (turn.actor.side === 'enemy'
          ? targets.filter(u => u.hp > 0)[Math.floor(this.random() * targets.filter(u => u.hp > 0).length)]
          : targets.find(u => u.hp > 0));
      if (!target) break;
      const d = CONFIG.damage;
      const factor = d.randomMin + this.random() * (d.randomMax - d.randomMin);
      let damage = Math.max(d.min, Math.round((turn.actor.attack - target.defense * d.defenseFactor) * factor));
      const beforeDefense = damage;
      if (target.defending) damage = Math.max(d.min, Math.round(damage * CONFIG.defenseDamageFactor));
      target.hp = Math.max(0, target.hp - damage);
      this.log.push(`${turn.actor.name} 攻击 ${target.name}，造成 ${damage} 点伤害${target.defending ? `（防御减伤，原 ${beforeDefense}）` : ''}。${target.hp === 0 ? ` ${target.name}${target.id === 'hero' ? '倒地' : '失去战斗能力'}。` : ''}`);
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
