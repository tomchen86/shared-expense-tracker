export const formPresentation = {
  presentation: 'formSheet' as const,
  headerShown: true,
  headerTransparent: false,
  sheetAllowedDetents: 'fitToContents' as const,
  sheetGrabberVisible: true,
};

// The native sheet already reserves its header's safe area.
export const formScrollInsetAdjustment = 'never' as const;
