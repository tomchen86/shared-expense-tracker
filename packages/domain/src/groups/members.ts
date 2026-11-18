/** The most members a shared group has when one is added to it (GROUPS-105.1). */
export const MAX_SHARED_GROUP_MEMBERS = 20;

/** Only local additions to a shared group are limited. Former members do not count. */
export function canAddGroupMember(
  shared: boolean,
  activeCount: number,
): boolean {
  return !shared || activeCount < MAX_SHARED_GROUP_MEMBERS;
}
