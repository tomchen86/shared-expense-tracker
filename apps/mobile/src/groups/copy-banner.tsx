import { Pressable, StyleSheet, Text } from 'react-native';
import type { ReadOnlyCopy } from '../sync/read-only-copy';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';

const COPY_BANNERS: Record<ReadOnlyCopy['reason'], string> = {
  'not-a-member':
    "You're no longer a member of this group. This copy is read-only and won't update.",
  left: "You left this group. This copy is read-only and won't update.",
  lapsed:
    "This phone can't sync this group anymore. This copy is read-only and won't update.",
};

/** What a read-only copy's screen shows under its title: why it is one, what it never sent, and Delete Copy (GROUPS-155.1, GROUPS-157.1). */
export function CopyBanner({
  copy,
  deleting,
  onDelete,
}: {
  copy: ReadOnlyCopy;
  deleting: boolean;
  onDelete: () => void;
}) {
  const colors = useThemeColors();
  return (
    <GroupedSection style={styles.banner}>
      <Text style={{ color: colors.text, fontSize: 16 }}>
        {COPY_BANNERS[copy.reason]}
      </Text>
      {copy.unsent > 0 && (
        <Text style={[styles.unsent, { color: colors.textMuted }]}>
          {copy.unsent === 1
            ? '1 change made on this phone was never sent to the group.'
            : `${copy.unsent} changes made on this phone were never sent to the group.`}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete Copy"
        accessibilityState={{ disabled: deleting }}
        disabled={deleting}
        onPress={onDelete}
        style={({ pressed }) => [
          styles.action,
          pressed && { backgroundColor: colors.pressedSurface },
        ]}
      >
        <Text style={{ color: colors.error, fontSize: 17 }}>Delete Copy</Text>
      </Pressable>
    </GroupedSection>
  );
}

const styles = StyleSheet.create({
  banner: { marginBottom: 20, padding: 16 },
  unsent: { fontSize: 15, lineHeight: 20, marginTop: 8 },
  action: { minHeight: 44, justifyContent: 'center', marginTop: 8 },
});
