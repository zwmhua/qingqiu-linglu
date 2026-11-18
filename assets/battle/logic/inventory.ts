import { PET_SKILLS } from './pet-skills';

export type Inventory = Record<string, number>;
export type WarehouseDirection = 'deposit' | 'withdraw';
export type DropMode = 'formal' | 'test';
export const INVENTORY_CONFIG = { pageSize: 20, stackLimit: 99 } as const;
export const BOOK_IDS = Object.keys(PET_SKILLS).map(id => `book:${id}`);
export const ITEMS: Record<string, { name: string; description: string }> = Object.fromEntries([
  ...Object.entries(PET_SKILLS).map(([id, skill]) => [`book:${id}`, {
    name: `${skill.name}技能书`, description: `城野选宠打书，消耗一本${skill.name}书。`,
  }]),
  ['rejuvenation', { name: '还童露', description: '消耗1个，将未出战普通灵宠还童为0级宝宝，重抽属性与技能。' }],
  ['mutation-rejuvenation', { name: '变异还童露', description: '消耗1个，将未出战变异灵宠还童为0级宝宝，保留变异身份。' }],
]);
export const DROP_RATES = Object.freeze({ formal: Object.freeze([0.08, 0.03, 0.01]), test: Object.freeze([0.5, 0.3, 0.1]) });

export function validateInventory(value: unknown): asserts value is Inventory {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.entries(value).some(([id, quantity]) => !Object.hasOwn(ITEMS, id)
      || !Number.isSafeInteger(quantity) || quantity < 0)) throw new Error('背包道具或数量无效，原档已保留');
}

export function addInventory(inventory: Inventory, drops: Inventory): Inventory {
  validateInventory(inventory);
  validateInventory(drops);
  const next = { ...inventory };
  for (const [id, count] of Object.entries(drops)) next[id] = (next[id] ?? 0) + count;
  validateInventory(next);
  return next;
}

export function planWarehouseTransfer(inventory: Inventory, warehouse: Inventory,
  direction: WarehouseDirection, id: string, count: number): { inventory: Inventory; warehouse: Inventory } {
  if (direction !== 'deposit' && direction !== 'withdraw') throw new Error('存取方向无效');
  if (!Object.hasOwn(ITEMS, id) || !Number.isSafeInteger(count) || count < 1) throw new Error('存取道具或数量无效');
  const deposit = direction === 'deposit';
  const source = deposit ? inventory : warehouse;
  const target = deposit ? warehouse : inventory;
  validateInventory(source);
  const available = source[id] ?? 0;
  if (available < count) throw new Error('来源道具数量不足');
  const from = { ...source };
  if (available === count) delete from[id];
  else from[id] = available - count;
  const into = addInventory(target, { [id]: count });
  return deposit ? { inventory: from, warehouse: into } : { inventory: into, warehouse: from };
}

export function rollDrops(mode: DropMode, random = Math.random): Inventory {
  const roll = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('掉落随机值无效');
    return value;
  };
  const hits = DROP_RATES[mode].map(rate => roll() < rate), drops: Inventory = {};
  if (hits[0]) drops[BOOK_IDS[Math.min(11, Math.floor(roll() * 12))]] = 1;
  if (hits[1]) drops.rejuvenation = 1;
  if (hits[2]) drops['mutation-rejuvenation'] = 1;
  return drops;
}
