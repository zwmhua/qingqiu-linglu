import { APTITUDE_KEYS, type Aptitudes } from './aptitude';

export const MUTATION_CONFIG = { rate: 0.025, multiplier: 1.18 } as const;

export const isMutation = (roll: number, rate: number): boolean => roll < rate;

export function mutateAptitudes(aptitudes: Aptitudes, multiplier: number): Aptitudes {
  return Object.fromEntries(APTITUDE_KEYS.map(key =>
    [key, Math.round(aptitudes[key] * multiplier)])) as Aptitudes;
}
