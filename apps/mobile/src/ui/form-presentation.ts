export const formScreenOptions = {
  animation: 'slide_from_bottom' as const,
};

export const formPresentation = {
  ...formScreenOptions,
  presentation: 'modal' as const,
  headerShown: false,
};
