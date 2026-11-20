import type { ComponentProps } from 'react';
import type Animated from 'react-native-reanimated';

export interface PeriodNameProps {
  /** The name of the period a list shows. A screen reader reads it as Choose period. <name>. */
  name: string;
  /** The six choices in the period menu (LEDGER-110.1, LEDGER-111.2). */
  options: { id: string; name: string }[];
  /** The ID of the option that is the period shown, when one is. */
  selected?: string;
  /**
   * Moves the name as drawn while the periods are paged. The menu's anchor stays in place.
   */
  slideStyle?: ComponentProps<typeof Animated.View>['style'];
  /** Receives the ID of the option chosen in the menu. */
  onSelect: (id: string) => void;
}

export { PeriodName } from './period-name.android';
