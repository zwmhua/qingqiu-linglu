import { BABY_CONFIG } from '../logic/baby';
import { APTITUDE_RANGES } from '../logic/aptitude';

const formation = {
  enemyColumnX: 125, enemyColumnY: 65, enemyRowX: 130, enemyRowY: 100,
  allyColumnX: 110, allyColumnY: 60, allyRowX: 65, allyRowY: 150,
  enemyBackStart: { x: 90, y: 480 }, allyFrontStart: { x: 740, y: 540 },
} as const;
const enemyBack = Array.from({ length: 5 }, (_, i) => ({
  x: formation.enemyBackStart.x + i * formation.enemyColumnX,
  y: formation.enemyBackStart.y - i * formation.enemyColumnY,
}));
const enemyFront = enemyBack.map(point => ({
  x: point.x + formation.enemyRowX, y: point.y + formation.enemyRowY,
}));
const allyFront = Array.from({ length: 5 }, (_, i) => ({
  x: formation.allyFrontStart.x + i * formation.allyColumnX,
  y: formation.allyFrontStart.y - i * formation.allyColumnY,
}));
const allyPairs = allyFront.map(pet => ({ pet, hero: {
  x: pet.x + formation.allyRowX, y: pet.y + formation.allyRowY,
} }));

export const CONFIG = {
  width: 1334, height: 750, commandSeconds: 29,
  encounter: [{ count: 1, weight: 0.50 }, { count: 2, weight: 0.35 }, { count: 3, weight: 0.15 }],
  hero: { name: '撷灵客', level: 1, hp: 58, attack: 10, defense: 13, speed: 9 },
  frog: {
    name: '汀蛙', level: 1, base: { hp: 38, attack: 11, defense: 10, speed: 10 },
    aptitude: APTITUDE_RANGES,
    innateSkill: '露珠弹', mutated: false,
  },
  baby: BABY_CONFIG,
  wild: { name: '野外汀蛙', level: 1, juvenileMultiplier: 0.88,
    hp: 33, attack: 10, defense: 9, speed: 9 },
  damage: { defenseFactor: 0.40, randomMin: 0.86, randomMax: 1.14, min: 1 },
  defenseDamageFactor: 0.5,
  protection: { protectorShare: 0.5 },
  summon: { maxPerBattle: 3, carriedPets: 2 },
  maxCarriedPets: 5,
  status: { heroManaMax: 40, petManaMax: 30, rageMax: 150, ragePerDamage: 1 },
  visual: {
    unitScale: 0.5, heroHeight: 240, frogHeight: 170, enemyFlipX: true,
    barWidth: 70, barHeight: 6, barGap: 3, headGap: 8, nameGap: 3, nameSize: 18,
    heroHeadOffsetX: 10, petNameOffsetX: -25, petNameWidth: 80, nameWidth: 128,
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
    spacing: formation,
    allyGroups: [allyPairs[2], allyPairs[1], allyPairs[3], allyPairs[0], allyPairs[4]],
    enemy: [enemyFront[2], enemyFront[1], enemyFront[3], enemyFront[0], enemyFront[4], ...enemyBack],
  },
} as const;

export const COMMAND_ICON_SIZE = 78;
const commandBottom = CONFIG.height - COMMAND_ICON_SIZE - 30;
const commandVerticalStep = (commandBottom - CONFIG.visual.commandTop) / 3;
export const COMMAND_LAYOUT = {
  攻击: { x: 1253, y: commandBottom - commandVerticalStep },
  灵术: { x: 1253, y: commandBottom - commandVerticalStep * 2 },
  道具: { x: 1253, y: CONFIG.visual.commandTop },
  自动: { x: 918, y: commandBottom },
  抓取: { x: 985, y: commandBottom }, 逃跑: { x: 1052, y: commandBottom }, 撤退: { x: 1052, y: commandBottom },
  召唤: { x: 1119, y: commandBottom }, 保护: { x: 1186, y: commandBottom }, 防御: { x: 1253, y: commandBottom },
} as const;

export function growth(base: number, aptitude: number, level: number, hp = false): number {
  return base + Math.floor(aptitude * (level - 1) / (hp ? 18 : 52));
}
