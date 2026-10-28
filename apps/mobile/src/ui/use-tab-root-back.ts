import type { Href } from 'expo-router';

// Other platforms keep their native navigation behavior.
export const useTabRootBack: (href: Href) => void = () => {};
