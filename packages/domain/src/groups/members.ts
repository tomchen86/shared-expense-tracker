/** Only local additions to a shared group are limited. Former members do not count. */
export function canAddGroupMember(
  shared: boolean,
  activeCount: number,
): boolean {
  return !shared || activeCount < 20;
}
