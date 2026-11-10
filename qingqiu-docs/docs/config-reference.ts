/**
 * 本文件是模拟用的数值参考，从模拟器配置复制而来，供查阅公式和数字。
 * 实现时以仓库内的配置文件为准，不要直接当运行时代码引用。
 */

/**
 * 青丘灵录 · 第一阶段数值草案（全部原创命名）
 * 灵感来自回合制抓宠，但不使用既有作品的物种/技能/门派名。
 */

export const STATS = ["atk", "def", "sta", "spd"] as const;
export type Stat = (typeof STATS)[number];
export const STAT_LABEL: Record<Stat, string> = {
  atk: "攻",
  def: "防",
  sta: "体",
  spd: "速",
};

export type AptitudeRange = Record<Stat, readonly [number, number]>;

export interface Species {
  id: string;
  name: string;
  /** 一句话定位，便于对照调参 */
  role: string;
  /** 1 级基础属性（不含资质成长） */
  base: { hp: number; atk: number; def: number; spd: number };
  /** 资质上下限（含） */
  aptitude: AptitudeRange;
  /** 天生技能 id（占 1 格） */
  innateSkill: string;
  /** 本物种可学技能（含天生） */
  skillPool: string[];
  /** 满血时基础抓取率 */
  baseCatch: number;
  /** 野外遭遇等级（成长对照用固定营地） */
  wildLevel: number;
}

export const SKILLS: Record<string, { name: string; desc: string }> = {
  dew_shot: { name: "露珠弹", desc: "水珠拍打，基础攻击技能" },
  damp_skin: { name: "湿润皮肤", desc: "略微提高防御" },
  frog_leap: { name: "蛙跳", desc: "提高速度，先手更稳" },
  mud_pool: { name: "泥沼", desc: "降低对手速度" },
  dew_recover: { name: "复苏露", desc: "回复少量生命" },
  horn_rush: { name: "角抵", desc: "冲撞攻击" },
  stone_hide: { name: "岩甲", desc: "显著提高防御" },
  steady: { name: "稳重", desc: "降低所受暴击与波动" },
  brute: { name: "蛮力", desc: "提高攻击" },
  quake: { name: "震地", desc: "对全体（原型里视作高伤单体）" },
  swift_cut: { name: "迅斩", desc: "高先手攻击" },
  afterimage: { name: "疾影", desc: "提高速度" },
  find_flaw: { name: "寻隙", desc: "降低对手防御" },
  combo: { name: "连击", desc: "有概率打出第二次攻击" },
  wind_blade: { name: "风刃", desc: "远程风系伤害" },
};

export const SPECIES: Record<string, Species> = {
  dew_frog: {
    id: "dew_frog",
    name: "露珠蛙",
    role: "入门均衡，体高攻低，好抓",
    base: { hp: 38, atk: 11, def: 10, spd: 10 },
    aptitude: {
      atk: [50, 90],
      def: [55, 95],
      sta: [70, 110],
      spd: [50, 90],
    },
    innateSkill: "dew_shot",
    skillPool: ["dew_shot", "damp_skin", "frog_leap", "mud_pool", "dew_recover"],
    baseCatch: 0.20,
    wildLevel: 1,
  },
  rock_ram: {
    id: "rock_ram",
    name: "岩角羊",
    role: "防体高、速度低，中等难度",
    base: { hp: 44, atk: 12, def: 14, spd: 7 },
    aptitude: {
      atk: [55, 95],
      def: [75, 115],
      sta: [75, 115],
      spd: [40, 80],
    },
    innateSkill: "horn_rush",
    skillPool: ["horn_rush", "stone_hide", "steady", "brute", "quake"],
    baseCatch: 0.11,
    wildLevel: 6,
  },
  gale_mink: {
    id: "gale_mink",
    name: "疾风貂",
    role: "攻速高、体防低，难抓",
    base: { hp: 30, atk: 14, def: 8, spd: 15 },
    aptitude: {
      atk: [70, 110],
      def: [40, 80],
      sta: [45, 85],
      spd: [75, 115],
    },
    innateSkill: "swift_cut",
    skillPool: ["swift_cut", "afterimage", "find_flaw", "combo", "wind_blade"],
    baseCatch: 0.07,
    wildLevel: 12,
  },
};

export const SPECIES_ORDER = ["dew_frog", "rock_ram", "gale_mink"] as const;

/**
 * 玩家角色：先只做 1 种。本阶段只用 1 级基础属性，没有资质和成长公式
 * （成长数字还没模拟，不先拍脑袋）。装备以后给角色穿，本阶段不做。
 */
export const HERO = {
  id: "spirit_seeker",
  name: "撷灵客",
  role: "御灵者，生命和防御略高，攻击一般",
  /** 1 级基础属性 */
  base: { hp: 58, atk: 10, def: 13, spd: 9 },
} as const;

/**
 * 阵型：两边各预留 10 个站位，跟 10v10 框架对齐。
 * 我方 0–4 后排（角色），5–9 前排（宝宝，站在对应角色前侧，槽位 = 角色槽 + 5）。
 * 敌方 0–9。当前战斗只用我方 0（角色）+ 5（宝宝），敌方最多 0–2。
 */
export const FORMATION = {
  sideSlots: 10,
  playerCharSlots: [0, 1, 2, 3, 4] as const,
  playerPetSlots: [5, 6, 7, 8, 9] as const,
  currentCharSlot: 0,
  currentPetSlot: 5,
  currentEnemySlots: [0, 1, 2] as const,
} as const;

/** 指令名全部原创。原型里未开放的按钮置灰。 */
export const COMMANDS = {
  rightColumn: [
    { id: "spirit_art", name: "灵术", enabled: false },
    { id: "secret", name: "秘技", enabled: false },
    { id: "attack", name: "攻击", enabled: true },
    { id: "pack", name: "行囊", enabled: false },
  ],
  bottomRow: [
    { id: "catch", name: "抓取", enabledInCard01: false, enabledInCard02: true },
    { id: "retreat", name: "撤离", enabled: false },
    { id: "defend", name: "防御", enabled: true },
    { id: "auto", name: "自动", enabled: false },
  ],
} as const;

/** 野外遭遇：当前只刷露珠蛙，数量 1–3 */
export const ENCOUNTER = {
  speciesId: "dew_frog",
  minCount: 1,
  maxCount: 3,
  /**
   * 下标即数量：P(1)=0.50，P(2)=0.35，P(3)=0.15。
   * 前 5 分钟多数是 1–2 只好打，偶尔 3 只给压力。
   */
  countWeights: [0, 0.5, 0.35, 0.15] as const,
} as const;

/** 抓取、变异、资质、打书、成长、战斗公式 */
export const RULES = {
  /** 抓取：p = clamp(baseCatch + hpBonus * (1 - hpRatio)^hpExp, min, max) */
  catch: {
    hpBonus: 0.58,
    hpExp: 1.15,
    min: 0.06,
    max: 0.82,
    /** 模拟里开始抓取的目标剩余血量比例 */
    attemptHpRatio: 0.22,
  },

  /** 仅在抓取成功时判定变异 */
  mutation: {
    rate: 0.025,
    /** 各资质乘区，再截断到 cap */
    aptitudeMul: 1.18,
    aptitudeCap: 130,
  },

  /** 资质：在物种区间内取两次均匀再平均（偏中间，两端更少） */
  aptitude: {
    rolls: 2,
  },

  book: {
    maxSlots: 4,
    /** 技能格已满且本书技能未学会时，顶掉一个旧技能的概率 */
    replaceChance: 0.32,
    /** 默认模拟打书次数 */
    bookCounts: [5, 10, 20, 30],
  },

  /**
   * 成长（1 级只用基础值；目前只用于灵宠，角色成长未定）：
   *   hp  = base.hp  + floor(sta * hpPerApt * (lv - 1))
   *   atk = base.atk + floor(atk * statPerApt * (lv - 1))
   *   def / spd 同 atk
   */
  growth: {
    hpPerApt: 1 / 18,
    statPerApt: 1 / 52,
  },

  /**
   * 伤害：dmg = max(1, round((atk - def * defFactor) * rand(1-var, 1+var)))
   * 先手：速度高者先行动；同速时我方先于敌方，同阵营按站位从小到大。
   * 防御：本回合不出手，受到物理伤害乘 defendDamageFactor。
   */
  combat: {
    defFactor: 0.40,
    variance: 0.14,
    maxTurns: 40,
    commandTimeLimitSec: 29,
    defendDamageFactor: 0.5,
  },

  /**
   * 野外个体略弱于同种养成宠（幼体/未养成），
   * 让 1 级中资质露珠蛙能压血抓露珠蛙，并留下丢球空间。
   */
  wildStatScale: 0.88,
} as const;

export const SIM = {
  seed: 20261110,
  catchTrials: 80_000,
  aptitudeSamples: 40_000,
  bookTrials: 30_000,
  combatTrialsPerCell: 4_000,
  partyTrials: 8_000,
  levels: [1, 3, 5, 6, 8, 10, 12, 15, 20],
  /** 成长对照所用玩家宠：露珠蛙、各资质取区间中点、非变异 */
  playerSpeciesId: "dew_frog",
} as const;
