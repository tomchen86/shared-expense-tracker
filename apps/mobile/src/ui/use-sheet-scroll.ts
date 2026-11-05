export function useSheetScroll(enabled = true) {
  // Android keeps the normal scroll view layout for both presentation styles.
  void enabled;
  return {
    screenOptions: {},
    scrollProps: { contentInsetAdjustmentBehavior: 'automatic' as const },
    bottomPadding: 0,
  };
}
