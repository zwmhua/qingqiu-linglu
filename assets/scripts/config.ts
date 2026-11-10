export const CONFIG = {
  width: 1334, height: 750, commandSeconds: 29,
  encounter: [{ count: 1, weight: 0.50 }, { count: 2, weight: 0.35 }, { count: 3, weight: 0.15 }],
  hero: { name: '撷灵客', level: 1, hp: 58, attack: 10, defense: 13, speed: 9 },
  frog: {
    name: '汀蛙', level: 1, base: { hp: 38, attack: 11, defense: 10, speed: 10 },
    aptitude: { attack: [50, 90], defense: [55, 95], hp: [70, 110], speed: [50, 90] },
    innateSkill: '露珠弹', mutated: false,
  },
  wild: { name: '野外汀蛙', level: 1, juvenileMultiplier: 0.88,
    hp: 33, attack: 10, defense: 9, speed: 9 },
  damage: { defenseFactor: 0.40, randomMin: 0.86, randomMax: 1.14, min: 1 },
  defenseDamageFactor: 0.5,
  protection: { protectorShare: 0.5 },
  summon: { maxPerBattle: 3, carriedPets: 2 },
  status: { heroManaMax: 40, petManaMax: 30, rageMax: 150, ragePerDamage: 1 },
  visual: {
    unitScale: 0.5, heroHeight: 240, frogHeight: 170, enemyFlipX: true,
    barWidth: 70, barHeight: 6, barGap: 3, headGap: 8, nameGap: 6, nameSize: 18,
    ringBreathSeconds: 0.8, ringOpacityMin: 130, ringOpacityMax: 210,
    commandTop: 185, commandStep: 74, commandHeight: 64,
  },
  animation: {
    approachDistance: 60, runSeconds: 0.3, lungeDistance: 15, strikeSeconds: 0.1,
    knockbackDistance: 10, floatDistance: 60, floatSeconds: 0.6,
    fadeSeconds: 0.4, fastMultiplier: 2,
    targetPadding: 20, targetConfirmSeconds: 0.16,
  },
  positions: {
    allyGroups: [
      { pet: { x: 775, y: 420 }, hero: { x: 840, y: 485 } },
      { pet: { x: 845, y: 350 }, hero: { x: 910, y: 415 } },
      { pet: { x: 705, y: 490 }, hero: { x: 770, y: 555 } },
      { pet: { x: 915, y: 280 }, hero: { x: 980, y: 345 } },
      { pet: { x: 635, y: 560 }, hero: { x: 700, y: 625 } },
    ],
    enemy: [
      { x: 340, y: 305 }, { x: 230, y: 365 }, { x: 450, y: 245 },
      { x: 184, y: 461 }, { x: 496, y: 149 }, { x: 535, y: 335 },
      { x: 457, y: 413 }, { x: 613, y: 257 }, { x: 379, y: 491 }, { x: 535, y: 179 },
    ],
  },
} as const;

export function growth(base: number, aptitude: number, level: number, hp = false): number {
  return base + Math.floor(aptitude * (level - 1) / (hp ? 18 : 52));
}
