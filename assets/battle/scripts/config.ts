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
  explorationRun: { fps: 11, frames: 6, rows: 2, width: 144, height: 256, axisTolerance: 1,
    // Match the existing six-frame cadence at 180 world units/s.
    spineDuration: 2 / 3, spineStride: 180 * 6 / 11 },
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
    attackMoveSeconds: 0.25, attackBeatSeconds: 0.05, attackStrikeSeconds: 0.15, attackReach: 82, attackScale: 1.08,
    hitSeconds: 0.2, hitDistance: 10, defendDistance: 8, flashSeconds: 0.15, hpSeconds: 0.18,
    critFlashSeconds: 0.18, critShakeDistance: 5, critShakeSeconds: 0.15,
    reactionFlashSeconds: 0.09, counterSeconds: 0.18, counterDistance: 22, floatStackGap: 53, floatHitOffset: 61,
    fadeSeconds: 0.4, deathSink: 15,
    floatPopSeconds: 0.15, floatPopScale: 1.22, floatHoldSeconds: 0.25, floatDistance: 40, floatSeconds: 0.4,
    spellSeconds: 0.3, spellTargetGap: 0.08, spellCastScale: 1.06, spellHeight: 58,
    spellRingX: 48, spellRingY: 17, spellRingWidth: 4, spellRadius: 30, spellCoreRadius: 12,
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
export const SPELL_TINTS: Record<string, string> = {
  thunder: '#D0B5FF', fireball: '#FF976A', waterarrow: '#77DBFF',
};
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

const polygon = (...xy: number[]) => Array.from({ length: xy.length / 2 }, (_, i) =>
  ({ x: xy[i * 2], y: xy[i * 2 + 1] }));

// Foot-point walk areas traced over town_qingqiu_streets.jpg (1672 x 941).
export const WALKABLE_CONFIG = {
  cell: 20, debugQuery: 'walkableDebug',
  townRegions: [
    polygon(500,405, 650,370, 970,360, 1015,390, 1005,490, 525,505),
    polygon(440,420, 555,352, 705,360, 725,470, 610,540, 475,525),
    polygon(665,357, 925,335, 1030,370, 1050,425, 970,485, 735,480),
    polygon(600,480, 710,457, 760,505, 720,555, 650,585, 595,560),
    polygon(730,457, 970,450, 1010,480, 760,490),
    polygon(975,374, 1060,340, 1110,385, 1085,450, 1010,480, 970,450),
    polygon(635,535, 735,510, 760,545, 720,635, 650,650, 605,605),
    polygon(575,630, 640,620, 675,670, 620,740, 505,800, 480,760),
    polygon(460,620, 520,590, 600,620, 610,680, 540,720, 465,700),
    polygon(625,650, 715,595, 755,615, 755,650, 700,730, 610,740),
    polygon(650,630, 735,605, 755,650, 680,720, 620,715),
    polygon(620,690, 700,710, 650,780, 550,820, 530,780),
    polygon(180,840, 420,760, 560,735, 590,790, 360,870, 185,900),
    polygon(250,385, 335,375, 365,405, 345,430, 260,440),
    polygon(0,380, 280,370, 330,395, 315,440, 0,455),
    polygon(350,345, 470,310, 515,320, 530,360, 395,400, 350,390),
    polygon(435,350, 520,335, 565,380, 520,440, 465,445),
    polygon(505,308, 545,242, 607,236, 680,336, 625,370, 550,350),
    polygon(920,350, 1040,315, 1080,348, 1000,395),
    polygon(1030,315, 1310,262, 1360,300, 1080,365),
    polygon(1300,267, 1435,150, 1510,112, 1575,145, 1530,225, 1380,330),
    polygon(1480,130, 1650,0, 1672,0, 1672,110, 1550,188),
    polygon(1000,478, 1090,443, 1160,473, 1160,520, 1065,565, 970,540),
    polygon(1100,472, 1245,458, 1300,480, 1270,515, 1140,535, 1090,510),
    polygon(1080,500, 1240,475, 1290,505, 1250,560, 1100,565, 1040,535),
    polygon(970,545, 1070,505, 1150,520, 1190,565, 1120,615, 1000,615),
    polygon(1010,620, 1110,565, 1210,560, 1250,595, 1160,650, 1040,650),
    polygon(1160,575, 1220,550, 1300,565, 1300,605, 1210,625),
    polygon(1100,550, 1230,530, 1330,555, 1340,605, 1200,630, 1110,600),
    polygon(1220,565, 1310,545, 1455,605, 1490,645, 1420,680, 1280,625),
    polygon(1260,560, 1370,570, 1500,625, 1530,665, 1500,700, 1270,625),
    polygon(1440,635, 1672,595, 1672,675, 1500,715, 1430,680),
    polygon(1490,700, 1672,640, 1672,725, 1300,940, 1220,940),
  ],
};
