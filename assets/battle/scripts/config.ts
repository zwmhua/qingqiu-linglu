const formation = {
  enemyColumnX: 125, enemyColumnY: 65, enemyRowX: 130, enemyRowY: 100,
  allyColumnX: 110, allyColumnY: 60, allyRowX: 260, allyRowY: 55,
  enemyBackStart: { x: 90, y: 480 }, allyFrontStart: { x: 545, y: 635 },
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
  width: 1334, height: 750,
  visual: {
    petTint: { normal: '#FFFFFF', mutated: '#D49CFF' },
    unitScale: 0.5, heroHeight: 240, frogHeight: 170, enemyFlipX: true,
    footOffset: { frog: 22, hero: 6 },
    barWidth: 70, barHeight: 6, barGap: 3, headGap: 8, nameGap: 3, nameSize: 18,
    heroHeadOffsetX: 10, petNameOffsetX: -25, petNameWidth: 80, nameWidth: 128,
    ringBreathSeconds: 0.8, ringOpacityMin: 130, ringOpacityMax: 210,
    commandTop: 185, commandStep: 74, commandHeight: 64,
  },
  animation: {
    idleSeconds: 2.2, idleHeight: 4, idleScale: 0.02, idleStagger: 0.31,
    attackSeconds: 0.3, attackDistance: 56,
    hitSeconds: 0.2, hitDistance: 7, defendDistance: 4, flashSeconds: 0.08,
    fadeSeconds: 0.4, floatDistance: 40, floatSeconds: 0.32,
    captureSeconds: 0.35, captureScale: 0.18, captureFailSeconds: 0.18, captureFailDistance: 4,
    fastMultiplier: 2,
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
const commandHorizontalStep = 80;
export const COMMAND_LAYOUT = {
  攻击: { x: 1253, y: commandBottom - commandVerticalStep },
  灵术: { x: 1253, y: commandBottom - commandVerticalStep * 2 },
  道具: { x: 1253, y: CONFIG.visual.commandTop },
  自动: { x: 1253 - commandHorizontalStep * 5, y: commandBottom },
  抓取: { x: 1253 - commandHorizontalStep * 4, y: commandBottom }, 逃跑: { x: 1253 - commandHorizontalStep * 3, y: commandBottom },
  撤退: { x: 1253 - commandHorizontalStep * 3, y: commandBottom }, 召唤: { x: 1253 - commandHorizontalStep * 2, y: commandBottom },
  保护: { x: 1253 - commandHorizontalStep, y: commandBottom }, 防御: { x: 1253, y: commandBottom },
} as const;
