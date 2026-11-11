export const APTITUDE_RANGES = {
  attack: [918, 1080], defense: [714, 840], stamina: [2295, 2700],
  mana: [1020, 1200], dodge: [867, 1020], speed: [1122, 1320],
} as const;
export const APTITUDE_KEYS = ['attack', 'defense', 'stamina', 'mana', 'dodge', 'speed'] as const;
export type Aptitudes = Record<(typeof APTITUDE_KEYS)[number], number>;

export function generateAptitudes(isBaby: boolean, random: () => number): Aptitudes {
  return Object.fromEntries(APTITUDE_KEYS.map(key => {
    const [min, max] = APTITUDE_RANGES[key];
    const low = isBaby ? Math.ceil((min + max) / 2) : min;
    const roll = () => low + Math.min(max - low, Math.floor(random() * (max - low + 1)));
    return [key, Math.round((roll() + roll()) / 2)];
  })) as Aptitudes;
}
