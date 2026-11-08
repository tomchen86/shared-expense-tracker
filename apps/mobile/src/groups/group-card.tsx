import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { FadeText } from '../ui/fade-text';
import { GroupedSection } from '../ui/grouped-section';
import { SwipeAction } from '../ui/swipe-action';
import { useThemeColors } from '../ui/theme';
import type { Group } from './index';

/** A group on the Groups root: always this tall, whatever its two lines under the name say. */
export function GroupCard({
  group,
  lines,
  archiving,
  onPress,
  onArchive,
}: {
  group: Group;
  lines: [string, string];
  archiving: boolean;
  onPress: () => void;
  onArchive: () => void;
}) {
  const colors = useThemeColors();
  // iOS's accessibility text sizes start at 1.786, after 1.353; Android's 150% is 1.5, after 1.3.
  const stacked = useWindowDimensions().fontScale >= 1.5;
  const count = `${group.members.length} ${group.members.length === 1 ? 'member' : 'members'}`;
  return (
    <View style={styles.card}>
      <SwipeAction
        caption="Archive"
        icon={{ ios: 'archivebox.fill', android: 'archive' }}
        accessibilityLabel={`Archive ${group.name}`}
        disabled={archiving}
        onPress={onArchive}
      >
        <GroupedSection>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${group.name}`}
            accessibilityValue={{
              text: [count, ...lines].filter(Boolean).join(', '),
            }}
            accessibilityActions={
              archiving ? [] : [{ name: 'archive', label: 'Archive group' }]
            }
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'archive') onArchive();
            }}
            onPress={onPress}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.pressedSurface },
            ]}
          >
            <View style={[styles.nameRow, stacked && styles.stacked]}>
              <FadeText
                containerStyle={styles.nameBox}
                style={[styles.name, { color: colors.text }]}
              >
                {group.name}
              </FadeText>
              <Text style={[styles.count, { color: colors.textMuted }]}>
                {count}
              </Text>
            </View>
            {lines.map((line, index) => (
              <FadeText
                key={index}
                style={[styles.detail, { color: colors.textMuted }]}
              >
                {/* A space keeps the card's height while a line is empty. */}
                {line || ' '}
              </FadeText>
            ))}
          </Pressable>
        </GroupedSection>
      </SwipeAction>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  row: { padding: 16, minHeight: 56, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  nameBox: { flex: 1 },
  name: { fontSize: 18, fontWeight: '700' },
  count: { fontSize: 14 },
  detail: { fontSize: 14, marginTop: 8 },
});
