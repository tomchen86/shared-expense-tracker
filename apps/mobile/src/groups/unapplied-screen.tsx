import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  formatCurrency,
  moneyRefusal,
  type SyncEvent,
} from '@shared-expense/domain';
import { formatExpenseDate } from '../ledger/format-date';
import { moneyPeople, ReviewAction, ReviewPanel } from '../ledger/review-block';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { dismissUnapplied, listGroupUnapplied } from '../sync/unapplied';
import { useSyncedFocusEffect } from '../sync/use-synced-focus-effect';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { useSheetScroll } from '../ui/use-sheet-scroll';
import type { GroupMember } from './index';
import { useGroup } from './use-group';

type Changes = Awaited<ReturnType<typeof listGroupUnapplied>>;

const clockExplanation =
  "This phone's clock was too far ahead when you made this change, so the other phones in this group didn't accept it. It was undone on this phone. Check the date and time, then make the change again.";
const otherExplanation =
  "The other phones in this group couldn't accept this change, so it was undone on this phone. Make the change again if you still need it.";

function describe(
  change: Changes[number],
  members: GroupMember[],
  userId: string,
  locale: string,
) {
  const lines: string[] = [];
  if (change.reason === 'structure')
    return { title: 'Change not applied', lines };
  // Every other verdict has already passed the event's structural checks.
  const event = change.content as SyncEvent;
  if (event.type !== 'expense') {
    switch (event.type) {
      case 'group':
        lines.push(`Group name: ${event.units.name!.value}`);
        break;
      case 'category':
      case 'member': {
        const name =
          ('units' in event && event.units.name?.value) || change.currentName;
        const kind = event.type === 'category' ? 'Category' : 'Member';
        lines.push(name ? `${kind}: ${name}` : kind);
        break;
      }
      case 'invite':
        lines.push('Invite link');
        break;
      case 'distinct':
        lines.push('Not a Duplicate');
        break;
      case 'device':
        lines.push('Join approval');
        break;
    }
    return { title: 'Group change not applied', lines };
  }

  const units = 'units' in event ? event.units : undefined;
  const added = units && Object.keys(units).length === 6;
  if (!added && change.currentName) lines.push('EXPENSE', change.currentName);
  if (units) {
    lines.push('YOU ENTERED');
    if (units.title) lines.push(units.title.value);
    const money = units.money?.value;
    if (money && moneyRefusal(money) === undefined)
      lines.push(
        formatCurrency(money.amountMinor, money.currency, locale),
        ...moneyPeople(money, { members }, userId),
      );
    if (units.date) lines.push(formatExpenseDate(units.date.value, locale));
    if (units.category) lines.push(units.category.value.name);
    if (units.note) lines.push(units.note.value ?? 'No note');
    if (units.trashed && !added)
      lines.push(
        units.trashed.value ? 'Moved to Trash' : 'Restored from Trash',
      );
  }
  return {
    title: added ? 'Expense not added' : 'Expense change not applied',
    lines,
  };
}

export function UnappliedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const database = useLocalDatabase();
  const { userId } = useLocalIdentity();
  const [group] = useGroup(id, { startFromLatest: true });
  const locale = useDisplayLocale();
  const colors = useThemeColors();
  const scroll = useSheetScroll();
  const [changes, setChanges] = useState<Changes>([]);
  const [error, setError] = useState<unknown>();
  const saving = useRef(new Set<string>());
  useSyncedFocusEffect(
    database,
    id,
    useCallback(() => {
      let active = true;
      void listGroupUnapplied(database, id).then(
        (rows) => {
          if (!active) return;
          setChanges(rows);
          if (!rows.length && saving.current.size) router.back();
        },
        (failure: unknown) => {
          if (active) setError(failure);
        },
      );
      return () => {
        active = false;
      };
    }, [database, id]),
  );

  async function dismiss(changeId: string) {
    if (saving.current.has(changeId)) return;
    saving.current.add(changeId);
    try {
      await dismissUnapplied(database, id, changeId);
    } catch {
      saving.current.delete(changeId);
      Alert.alert(
        'Unable to Dismiss',
        'Your change could not be saved. Please try again.',
      );
    }
  }
  if (error) throw error;
  return (
    <>
      <Stack.Screen
        options={{
          ...scroll.screenOptions,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <HeaderActions
        cancel={{ label: 'Close', onPress: () => router.back() }}
      />
      <ScrollView
        collapsable={false}
        {...scroll.scrollProps}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 32 + scroll.bottomPadding,
        }}
      >
        {group &&
          changes.map((change) => {
            const { title, lines } = describe(
              change,
              [...group.members, ...group.formerMembers],
              userId,
              locale,
            );
            return (
              <ReviewPanel
                key={change.id}
                title={title}
                explanation={
                  change.reason === 'clock'
                    ? clockExplanation
                    : otherExplanation
                }
              >
                {lines.length > 0 && (
                  <View
                    style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 4 }}
                  >
                    {lines.map((line, index) => (
                      <Text
                        key={index}
                        style={{ fontSize: 16, color: colors.text }}
                      >
                        {line}
                      </Text>
                    ))}
                  </View>
                )}
                <ReviewAction
                  label="Dismiss"
                  onPress={() => void dismiss(change.id)}
                />
              </ReviewPanel>
            );
          })}
      </ScrollView>
    </>
  );
}
