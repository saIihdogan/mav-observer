/**
 * IP & alias layer.
 *
 * Flip USE_ALIAS_NAMES to switch every player name in the game between the
 * alias ("M. Jordan") and the real name. Team names are always neutral
 * "<City> <Color>" names (see franchises.ts); official nicknames and logos are
 * never used.
 */
export const USE_ALIAS_NAMES: boolean = true;

export function displayName(p: { realName: string; aliasName: string }): string {
  return USE_ALIAS_NAMES ? p.aliasName : p.realName;
}
