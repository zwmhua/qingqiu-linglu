export type TargetMode = 'attack' | 'capture' | 'protect';

export function toggleTarget(current: TargetMode | null, requested: TargetMode): TargetMode | null {
  return current === requested ? null : requested;
}

export function targetCommand(current: TargetMode | null): TargetMode {
  return current ?? 'attack';
}
