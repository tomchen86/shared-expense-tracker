import { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { FadeText } from '../ui/fade-text';
import { useThemeColors } from '../ui/theme';

/** Whether the large title has scrolled out of view, at which point the bar shows the name. */
export function useLargeTitleScroll() {
  const titleBottom = useRef(0);
  // Under a see-through header the content rests at a negative offset, which the scroll view reports
  // as it opens. The header's height can't say where: it starts as a guess, even that of another screen.
  const restOffset = useRef<number>(undefined);
  const [scrolledAway, setScrolledAway] = useState(false);
  return {
    scrolledAway,
    onTitleLayout: ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      titleBottom.current = layout.y + layout.height;
    },
    onScroll: ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { y } = nativeEvent.contentOffset;
      restOffset.current ??= Math.min(y, 0);
      setScrolledAway(y - restOffset.current > titleBottom.current);
    },
  };
}

/** The group's name in large type: a press opens and closes the full name, a long press renames. */
export function GroupLargeTitle({
  name,
  onLayout,
  onRename,
}: {
  name: string;
  onLayout: (event: LayoutChangeEvent) => void;
  /** None on an archived group. */
  onRename?: () => void;
}) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ expanded }}
      accessibilityHint={
        onRename
          ? 'Shows the full name. Long press renames the group.'
          : undefined
      }
      onPress={() => setExpanded((current) => !current)}
      onLongPress={onRename}
      onLayout={onLayout}
      style={styles.button}
    >
      <FadeText
        expanded={expanded}
        minFontSize={24}
        style={[styles.title, { color: colors.text }]}
      >
        {name}
      </FadeText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { marginLeft: -4, marginTop: -16, marginBottom: 16 },
  title: { fontSize: 34, fontWeight: '700' },
});
