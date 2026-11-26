import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import {
  canAddGroupMember,
  groupAmounts,
  MAX_SHARED_GROUP_MEMBERS,
  toLocalDate,
} from '@shared-expense/domain';
import { listExpenses } from '../ledger/expenses';
import { formatExpenseDate } from '../ledger/format-date';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { apiUrl } from '../sharing/api-address';
import { InviteContent } from '../sharing/invite-sheet';
import { leaveSharedGroup, removeMemberDevices } from '../sharing/removal';
import { useRefreshReceivedRequests } from '../sharing/request-refresh';
import { fetchDeviceSyncTimes } from '../sync/roster';
import { showActionMenu } from '../ui/action-menu';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { Sheet } from '../ui/sheet';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { useSheetScroll } from '../ui/use-sheet-scroll';
import { useKeyboardScroll } from '../ui/use-keyboard-scroll';

import { yourBalanceLines } from './format-balance';
import {
  addGroupMember,
  isReadOnlyGroup,
  listGroups,
  memberNameKey,
  MemberNameExistsError,
  removeGroupMember,
  type GroupMember,
} from './index';
import { JoinRequests } from './join-requests';
import { nameSaveErrorMessage } from './name-save-error';
import { readGroupDetails, useGroup } from './use-group';

const ALREADY_EXISTS = 'A member with this name already exists.';
const CONNECT = 'Connect to the internet and try again.';
const WENT_WRONG = 'Something went wrong. Try again later.';

function memberSyncLine(ms: number | undefined, locale: string) {
  if (ms === undefined) return 'Joined';
  const now = new Date();
  // Future times also say today, including times past the range of a JavaScript Date.
  if (ms >= now.getTime()) return 'Last synced today';
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const day = toLocalDate(new Date(ms), zone);
  return day === toLocalDate(now, zone)
    ? 'Last synced today'
    : `Last synced ${formatExpenseDate(day, locale)}`;
}

export function MembersScreen({
  inSettings = false,
}: {
  inSettings?: boolean;
}) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const database = useLocalDatabase();
  const identity = useLocalIdentity();
  const colors = useThemeColors();
  const sheetScroll = useSheetScroll();
  const keyboardScroll = useKeyboardScroll(
    sheetScroll.scrollProps.contentInsetAdjustmentBehavior,
  );
  const sheetScrollProps: ScrollViewProps = sheetScroll.scrollProps;

  const locale = useDisplayLocale();
  const [group, setGroup, pendingRead] = useGroup(id, {
    startFromLatest: true,
  });
  const restartRequestTimer = useRefreshReceivedRequests(database, id, group);
  const [progress, setProgress] = useState<{
    groupId: string;
    times: Map<string, number | null>;
  }>();
  useEffect(() => {
    const url = apiUrl();
    if (!url) return;
    let open = true;
    async function load(url: string) {
      const fresh = await (pendingRead() ?? readGroupDetails(database, id));
      if (
        !open ||
        !fresh?.shared ||
        fresh.archived ||
        !fresh.members.some(
          (m) => m.userId !== null && m.userId !== identity.userId,
        )
      )
        return;
      const times = await fetchDeviceSyncTimes(database, id, url);
      if (open && times) setProgress({ groupId: id, times });
    }
    void load(url).catch(() => undefined);
    return () => {
      open = false;
    };
  }, [database, id, identity.userId, pendingRead]);

  // The answer belongs to this opening. The roster can still change while Members is open.
  const memberTimes = new Map<string, number>();
  if (progress?.groupId === id) {
    for (const { deviceId, memberId, userId } of group?.phones ?? []) {
      const ms = progress.times.get(deviceId);
      if (ms != null && userId !== identity.userId)
        memberTimes.set(
          memberId,
          Math.max(ms, memberTimes.get(memberId) ?? ms),
        );
    }
  }
  // An archived group and a read-only copy only list their members (GROUPS-156.1).
  const editable = group && !isReadOnlyGroup(group);
  const canAdd = group && canAddGroupMember(group.shared, group.members.length);
  const base = inSettings ? '/settings/archived-groups' : '/groups';
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // The member whose phones are being removed, or you while you leave (GROUPS-151.1).
  const [working, setWorking] = useState<{
    memberId: string;
    line: 'Removing…' | 'Leaving…';
  }>();
  // Members closes once you have left, when nothing keeps it from closing any more.
  const [left, setLeft] = useState(false);
  useEffect(() => {
    if (left && !busy) router.back();
  }, [left, busy]);
  const [adding, setAdding] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const closeInvite = useCallback(() => setInviteOpen(false), []);
  const [name, setName] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  usePreventRemove(busy, () => {});
  // Another phone took the last place: the field closes, and is empty when it opens again.
  if (adding && canAdd === false) {
    setAdding(false);
    setName('');
    setDuplicate(false);
  }

  function showDuplicate() {
    setDuplicate(true);
    AccessibilityInfo.announceForAccessibility(ALREADY_EXISTS);
  }

  async function add(text: string, former?: GroupMember) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await addGroupMember(database, id, text, former?.id);
      const updated = (await listGroups(database)).find(
        (item) => item.id === id,
      )!;
      setGroup(
        (current) =>
          current && {
            ...current,
            ...updated,
            formerMembers: current.formerMembers.filter(
              (member) => member.id !== former?.id,
            ),
          },
      );
      setName('');
      setDuplicate(false);
      if (canAddGroupMember(updated.shared, updated.members.length))
        field.current?.focus();
      else setAdding(false);
    } catch (error) {
      if (error instanceof MemberNameExistsError) showDuplicate();
      else
        Alert.alert(
          'Unable to Add Member',
          nameSaveErrorMessage(error, 'member'),
        );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // `text` is what the field holds when Return is pressed. The name in state can be older:
  // keys typed just before Return reach React in the same batch as Return when the phone
  // is busy, and `name` here is still from the render before them.
  function submit(text: string) {
    if (busyRef.current || !group) return;
    if (!text.trim()) {
      setAdding(false);
      setName('');
      setDuplicate(false);
      return;
    }
    if (
      group.members.some(
        (member) => memberNameKey(member.name) === memberNameKey(text),
      )
    ) {
      showDuplicate();
      return;
    }
    const former = group.formerMembers.find(
      (member) => memberNameKey(member.name) === memberNameKey(text),
    );
    if (former) {
      Alert.alert(
        `Add ${former.name} Back?`,
        `${former.name} was in this group before. Adding them back reconnects their past payments and shares.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add Back', onPress: () => void add(text, former) },
        ],
        { cancelable: true },
      );
    } else void add(text);
  }

  async function remove(member: GroupMember) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await removeGroupMember(database, id, member.id);
      setGroup(
        (current) =>
          current && {
            ...current,
            members: current.members.filter(
              (candidate) => candidate.id !== member.id,
            ),
            formerMembers: [member, ...current.formerMembers],
          },
      );
    } catch {
      Alert.alert(
        'Unable to Remove Member',
        'The member could not be removed. Please try again.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** Runs a removal or a leave with Members locked, and resolves once it has ended. */
  async function locked<T>(
    lock: NonNullable<typeof working>,
    work: () => Promise<T>,
  ): Promise<T | undefined> {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    setWorking(lock);
    try {
      return await work();
    } finally {
      // What the removal's own sync left, whether or not it went through.
      const fresh = await readGroupDetails(database, id).catch(() => undefined);
      if (fresh) setGroup(fresh);
      busyRef.current = false;
      setBusy(false);
      setWorking(undefined);
    }
  }

  /** Asks first: the member's phones lose access at once, and it needs the network (GROUPS-150.1). */
  function confirmRemove(member: GroupMember) {
    Alert.alert(
      `Remove ${member.name}?`,
      `${member.name}'s phone will lose access to this group right away. Their past payments and shares will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            void locked({ memberId: member.id, line: 'Removing…' }, () =>
              removeMemberDevices(database, id, member.id),
            ).then((result) => {
              if (result && result.outcome !== 'removed')
                Alert.alert(
                  'Unable to Remove Member',
                  result.outcome === 'no-answer' ? CONNECT : WENT_WRONG,
                );
            }),
        },
      ],
      { cancelable: true },
    );
  }

  /** Asks first, with what you still owe or are owed (GROUPS-152.1). */
  async function confirmLeave(you: GroupMember) {
    if (!group) return;
    const amounts = groupAmounts(await listExpenses(database, id), group);
    const balance = yourBalanceLines(amounts, you.id, locale).filter(
      (line) => line !== 'Settled up',
    );
    const message = [
      "This phone keeps a read-only copy. You won't see new expenses or be able to change this group.",
      balance.join('\n'),
      ...(group.phones.length === 0
        ? [
            'No other phone has joined this group, so nobody else will have its expenses.',
          ]
        : []),
    ]
      .filter(Boolean)
      .join('\n\n');
    Alert.alert(
      `Leave ${group.name}?`,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () =>
            void locked({ memberId: you.id, line: 'Leaving…' }, () =>
              leaveSharedGroup(database, id),
            ).then((result) => {
              if (!result) return;
              if (result.outcome === 'left') setLeft(true);
              else
                Alert.alert(
                  'Unable to Leave Group',
                  result.outcome === 'no-answer' ? CONNECT : WENT_WRONG,
                );
            }),
        },
      ],
      { cancelable: true },
    );
  }

  function openMenu(member: GroupMember) {
    if (busyRef.current || !group) return;
    const own = member.userId === identity.userId;
    // Another phone represents him: it is removed with him, online (GROUPS-25.4).
    const hasPhone = group.phones.some((phone) => phone.memberId === member.id);
    showActionMenu({
      title: member.name,
      message: own
        ? undefined
        : 'If removed, their historical payments and shares will be retained.',
      actions: [
        {
          label: 'Rename',
          onPress: () => {
            if (!busyRef.current)
              router.navigate({
                pathname: `${base}/rename-member`,
                params: { id, memberId: member.id },
              });
          },
        },
        ...(own
          ? group.shared
            ? [
                {
                  label: 'Leave Group',
                  destructive: true,
                  onPress: () =>
                    void confirmLeave(member).catch(() => undefined),
                },
              ]
            : []
          : [
              {
                label: 'Remove from Group',
                destructive: true,
                onPress: () =>
                  hasPhone ? confirmRemove(member) : void remove(member),
              },
            ]),
      ],
    });
  }

  function scrollToField() {
    if (field.current?.isFocused()) {
      keyboardScroll.ref.current?.scrollToEnd({ animated: true });
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...sheetScroll.screenOptions,
          gestureEnabled: !busy,
          contentStyle: { backgroundColor: colors.background },
        }}
      />

      <HeaderActions
        cancel={{
          label: 'Close',
          disabled: busy,
          onPress: () => {
            if (!busyRef.current) router.back();
          },
        }}
      />
      <ScrollView
        {...keyboardScroll}
        keyboardShouldPersistTaps="handled"
        {...sheetScrollProps}
        onContentSizeChange={(width, height) => {
          sheetScrollProps.onContentSizeChange?.(width, height);
          scrollToField();
        }}
        onLayout={scrollToField}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 32 + sheetScroll.bottomPadding },
        ]}
      >
        {editable && (
          <GroupedSection style={{ marginBottom: 20 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Invite with Link"
              disabled={busy}
              onPress={() => {
                restartRequestTimer();
                field.current?.blur();
                setInviteOpen(true);
              }}
              android_ripple={{ color: colors.pressedSurface }}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.pressedSurface },
              ]}
            >
              <Text
                style={[styles.label, styles.name, { color: colors.accent }]}
              >
                Invite with Link
              </Text>
              <Text accessible={false} style={{ color: colors.textMuted }}>
                ›
              </Text>
            </Pressable>
          </GroupedSection>
        )}
        {editable && group.shared && (
          <JoinRequests
            groupId={id}
            members={group.members}
            formerMembers={group.formerMembers}
          />
        )}
        <GroupedSection>
          {group?.members.map((member) => {
            const you = member.userId === identity.userId;
            const label = member.name + (you ? ' (You)' : '');
            // Someone else whose own phone is in the shared ledger (GROUPS-24.5), unless
            // the row says what is being done about him or you (GROUPS-151.1).
            const second =
              working?.memberId === member.id
                ? working.line
                : group.shared && !you && member.userId !== null
                  ? memberSyncLine(memberTimes.get(member.id), locale)
                  : undefined;
            if (!editable)
              return (
                <View key={member.id} style={styles.row}>
                  <Text
                    style={[styles.label, styles.name, { color: colors.text }]}
                  >
                    {label}
                  </Text>
                </View>
              );
            return (
              <Pressable
                key={member.id}
                accessibilityRole="button"
                accessibilityLabel={second ? `${label}, ${second}` : label}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => openMenu(member)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.pressedSurface },
                ]}
              >
                <View style={styles.label}>
                  <Text style={[styles.name, { color: colors.text }]}>
                    {label}
                  </Text>
                  {second && (
                    <Text style={[styles.joined, { color: colors.textMuted }]}>
                      {second}
                    </Text>
                  )}
                </View>
                <Text accessible={false} style={{ color: colors.textMuted }}>
                  ›
                </Text>
              </Pressable>
            );
          })}
          {editable &&
            canAdd &&
            (adding ? (
              <View>
                <TextInput
                  ref={field}
                  accessibilityLabel="Member name"
                  placeholder="Enter member name"
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  autoFocus
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  submitBehavior="submit"
                  onChangeText={(value) => {
                    if (!busyRef.current) {
                      setName(value);
                      setDuplicate(false);
                    }
                  }}
                  onSubmitEditing={({ nativeEvent }) =>
                    submit(nativeEvent.text)
                  }
                  style={[styles.input, { color: colors.text }]}
                />
                {duplicate && (
                  <Text style={[styles.error, { color: colors.error }]}>
                    {ALREADY_EXISTS}
                  </Text>
                )}
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add Member"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => {
                  if (!busyRef.current) setAdding(true);
                }}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.pressedSurface },
                ]}
              >
                <Text
                  style={[styles.label, styles.name, { color: colors.accent }]}
                >
                  Add Member
                </Text>
              </Pressable>
            ))}
        </GroupedSection>
        {editable && !canAdd && (
          <Text style={[styles.footer, { color: colors.textMuted }]}>
            {`A shared group can have up to ${MAX_SHARED_GROUP_MEMBERS} members.`}
          </Text>
        )}
      </ScrollView>
      <Sheet
        visible={inviteOpen}
        title="Invite"
        cancel={{ label: 'Close', icon: 'close', onPress: closeInvite }}
        onClose={closeInvite}
        measureDetent
      >
        {inviteOpen && <InviteContent groupId={id} onClose={closeInvite} />}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32 },
  row: {
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: { flex: 1 },
  name: { fontSize: 17 },
  joined: { fontSize: 15 },
  input: { minHeight: 54, paddingHorizontal: 16, fontSize: 17 },
  error: { fontSize: 15, marginHorizontal: 16, marginBottom: 12 },
  footer: { fontSize: 13, marginHorizontal: 16, marginTop: 8 },
});
