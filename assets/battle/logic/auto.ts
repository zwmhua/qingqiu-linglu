import type { Battle, Unit } from '../scripts/Battle';

type Enemy = Pick<Unit, 'id' | 'hp' | 'left'>;
type AutoOrder = { command: 'attack' | 'defend'; target?: string };

export function nextAutoOrder(previous: string | undefined, enemies: readonly Enemy[], random: () => number): AutoOrder {
  if (previous === 'defend') return { command: 'defend', target: undefined };
  const living = enemies.filter(enemy => enemy.hp > 0 && !enemy.left);
  const target = living[Math.floor(random() * living.length)];
  if (!target) throw new Error('自动攻击没有存活的随机目标');
  return { command: 'attack', target: target.id };
}

export class AutoCommands {
  enabled = false;
  private readonly random: () => number;
  constructor(random: () => number = Math.random) { this.random = random; }
  toggle(): boolean { return this.enabled = !this.enabled; }
  issue(battle: Battle): void {
    if (!this.enabled || battle.phase === 'ended') return;
    for (const actor of [...battle.pending]) {
      const order = nextAutoOrder(battle.lastCommands.get(actor.id)?.command, battle.enemies, this.random);
      battle.command(actor.id, order.command, order.target);
    }
  }
}
