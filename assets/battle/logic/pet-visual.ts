export function petTint(isMutated: boolean | undefined,
  colors: { readonly normal: string; readonly mutated: string }): string {
  return isMutated ? colors.mutated : colors.normal;
}
