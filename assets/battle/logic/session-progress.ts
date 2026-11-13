import { generateAptitudes } from './aptitude';
import { BATTLE_RULES, INITIAL_PET_IDS } from './battle-rules';
import { generateBaseStats } from './base-stats';
import { generateGrowth } from './growth';
import { confirmPotential, type HeroProgress, type LevelProgress } from './hero-progress';
import { petCombat } from './pet-panel';
import { petProgress, Roster, type CarriedPet, type RosterState } from './roster';
import { pickWildLevel } from './wild-encounter';

export class SessionProgress {
  readonly roster: Roster;
  selectedPetId: string;
  heroProgress?: HeroProgress;

  constructor(heroProgress?: HeroProgress, previous?: RosterState, selectedPetId?: string,
    petRandom = Math.random, aptitudeRandom = Math.random, growthRandom = Math.random,
    baseStatsRandom = Math.random) {
    this.heroProgress = heroProgress;
    this.selectedPetId = selectedPetId ?? previous?.entries[0]?.id ?? INITIAL_PET_IDS[0];
    const frog = BATTLE_RULES.frog;
    const pets = previous ? [] : INITIAL_PET_IDS.map(id => {
      const level = heroProgress ? pickWildLevel(petRandom()) : frog.level;
      const traits = { level, aptitudes: generateAptitudes(false, aptitudeRandom),
        growth: generateGrowth(false, growthRandom), baseStats: generateBaseStats(level, baseStatsRandom) };
      return { id, name: frog.name, species: 'tingwa' as const, skill: frog.innateSkill, ...traits, ...petCombat(traits) };
    });
    this.roster = new Roster(BATTLE_RULES.maxCarriedPets, pets, previous);
  }

  confirmHeroAllocation(inBattle: boolean, preview: HeroProgress, persist: (hero: HeroProgress) => void): boolean {
    if (inBattle || !this.heroProgress) return false;
    const next = confirmPotential(this.heroProgress, preview);
    if (!next) return false;
    persist(next);
    this.heroProgress = next;
    return true;
  }

  confirmPetAllocation(inBattle: boolean, id: string, preview: LevelProgress,
    persist: (pet: CarriedPet) => void): boolean {
    if (inBattle || !this.heroProgress) return false;
    const pet = this.roster.entries.find(entry => entry.id === id);
    if (!pet) return false;
    const next = confirmPotential(petProgress(pet), preview);
    if (!next) return false;
    const { hp: _fullHp, ...panel } = petCombat({ ...pet, baseStats: next.stats });
    const updated = { ...pet, ...panel, baseStats: next.stats, potential: next.potential };
    persist(updated);
    Object.assign(pet, updated);
    return true;
  }

  releasePet(inBattle: boolean, id: string, persist: (pets: CarriedPet[]) => void): boolean {
    return this.roster.release(id, this.selectedPetId, inBattle, persist);
  }
}
