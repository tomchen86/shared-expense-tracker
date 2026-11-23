import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useIsFocused } from 'expo-router/react-navigation';
import { useLocalDatabase } from '../shell';
import { listJoinRequests, type JoinRequest } from '../sharing/join-requests';
import { useRequestCards } from '../sharing/use-join-group';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';

export function JoinRequestCards() {
  const db = useLocalDatabase();
  const colors = useThemeColors();
  const { revision, openRequest } = useRequestCards();
  const focused = useIsFocused();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (!focused) return;
    let current = true;
    void listJoinRequests(db).then(
      (rows) => {
        if (current) setRequests(rows);
      },
      (failure: unknown) => {
        if (current) setError(failure);
      },
    );
    return () => {
      current = false;
    };
  }, [focused, db, revision]);
  if (error) throw error;
  return requests.map((request) => {
    const status = request.sent ? 'Waiting for approval' : 'Not sent';
    return (
      <GroupedSection key={request.code} style={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open request to join ${request.groupName}`}
          accessibilityValue={{ text: status }}
          onPress={() => openRequest(request)}
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: colors.pressedSurface },
          ]}
        >
          <Text style={[styles.name, { color: colors.text }]}>
            {request.groupName}
          </Text>
          <Text style={[styles.status, { color: colors.textMuted }]}>
            {status}
          </Text>
        </Pressable>
      </GroupedSection>
    );
  });
}
const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  row: { padding: 16, gap: 8 },
  name: { fontSize: 18, fontWeight: '700' },
  status: { fontSize: 14 },
});
