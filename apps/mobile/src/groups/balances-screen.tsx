import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useLocales } from 'expo-localization';
import { formatCurrency, groupAmounts } from '@shared-expense/domain';
import { useLocalIdentity } from '../shell';
import { useExpenses } from '../ledger/use-expenses';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { useSheetScroll } from '../ui/use-sheet-scroll';
import { useGroup } from './use-group';
import { formatBalance } from './format-balance';

export function BalancesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group] = useGroup(id);
  const expenses = useExpenses();
  const { userId } = useLocalIdentity();
  const colors = useThemeColors();
  const sheetScroll = useSheetScroll();
  const locale = useLocales()[0].languageTag;
  const amounts = group && expenses ? groupAmounts(expenses, group) : [];
  return (
    <>
      <Stack.Screen
        options={{
          ...sheetScroll.screenOptions,
          contentStyle: { backgroundColor: colors.background },
        }}
      />

      <HeaderActions
        cancel={{ label: 'Close', onPress: () => router.back() }}
      />
      <ScrollView
        collapsable={false}
        {...sheetScroll.scrollProps}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 32 + sheetScroll.bottomPadding },
        ]}
      >
        {group &&
          amounts.map(({ currency, members }) => (
            <View key={currency} style={styles.section}>
              {amounts.length > 1 && (
                <Text style={[styles.heading, { color: colors.textMuted }]}>
                  {currency}
                </Text>
              )}
              <GroupedSection>
                {[
                  ...group.members,
                  ...group.formerMembers
                    .slice()
                    .reverse()
                    .filter((member) => members.has(member.id)),
                ].map((member) => {
                  const balance = members.get(member.id)!;
                  return (
                    <View key={member.id} style={styles.row}>
                      <Text style={{ color: colors.text, fontSize: 17 }}>
                        {member.name}
                        {member.userId === userId ? ' (You)' : ''}
                      </Text>
                      <Text style={{ color: colors.text }}>
                        {formatBalance(balance.net, currency, locale, false)}
                      </Text>
                      <Text style={{ color: colors.textMuted }}>
                        Paid {formatCurrency(balance.paid, currency, locale)} ·
                        Share {formatCurrency(balance.share, currency, locale)}
                      </Text>
                    </View>
                  );
                })}
              </GroupedSection>
            </View>
          ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32 },
  section: { marginBottom: 20 },
  heading: { fontSize: 13, marginHorizontal: 16, marginBottom: 8 },
  row: { padding: 16, gap: 8 },
});
