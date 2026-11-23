import { useEffect, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_SHARED_GROUP_MEMBERS } from '@shared-expense/domain';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import {
  whyNotApprove,
  type ReceivedJoinRequest,
} from '../sharing/join-decisions';
import {
  answerJoinRequest,
  refreshReceivedRequests,
  useReceivedRequests,
} from '../sharing/received-requests';
import { showActionMenu } from '../ui/action-menu';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';
import { listGroups, type GroupMember } from './index';

const CANNOT = "This request can't be approved.";
const WENT_WRONG = 'Something went wrong. Try again later.';

/** The sentence a request's menu shows in place of Approve (SHARING-194.1). */
function cannotApproveText({
  reason,
  member,
}: NonNullable<ReturnType<typeof whyNotApprove>>) {
  switch (reason) {
    case 'not-a-member':
      return `The member this request chose is no longer in this group. ${CANNOT}`;
    case 'is-you':
      return `You're already in this group as ${member?.name}. ${CANNOT}`;
    case 'has-a-phone':
      return `${member?.name} has already joined from another phone. ${CANNOT}`;
    case 'group-full':
      return `A shared group can have up to ${MAX_SHARED_GROUP_MEMBERS} members. ${CANNOT}`;
    case 'same-name':
      return `This group already has a member named ${member?.name}. ${CANNOT}`;
  }
}

/**
 * The Requests section of an unarchived shared ledger's Members (GROUPS-131.1): the join
 * requests the phone has listed, each with the menu that approves or declines it
 * (GROUPS-132.1). It lists them again as Members opens (SHARING-190.1).
 */
export function JoinRequests({
  groupId,
  members,
}: {
  groupId: string;
  members: readonly GroupMember[];
}) {
  const database = useLocalDatabase();
  const { userId } = useLocalIdentity();
  const colors = useThemeColors();
  const { requests, processing } = useReceivedRequests(database, groupId);
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    void refreshReceivedRequests(database, groupId);
    return () => {
      open.current = false;
    };
  }, [database, groupId]);

  async function answer(
    request: ReceivedJoinRequest,
    action: 'approve' | 'reject',
  ) {
    const result = await answerJoinRequest(database, groupId, request, action);
    // Once Members is closed the answer stands, and nothing is said (SHARING-202.1).
    if (!result || !open.current) return;
    let message: string;
    switch (result.outcome) {
      case 'approved':
      case 'rejected':
        return;
      case 'no-answer':
        message = 'Connect to the internet and try again.';
        break;
      case 'answered':
        message = 'This request has already been answered.';
        break;
      case 'members-full':
        message = `This group is full. A shared group can have up to ${MAX_SHARED_GROUP_MEMBERS} members.`;
        break;
      case 'cannot-approve': {
        // Against the group as it is now, which is what the phone looked at.
        const group = (await listGroups(database).catch(() => [])).find(
          ({ id }) => id === groupId,
        );
        const blocked = group && whyNotApprove(group.members, userId, request);
        message = blocked ? cannotApproveText(blocked) : WENT_WRONG;
        break;
      }
      default:
        message = WENT_WRONG;
    }
    if (open.current)
      Alert.alert(
        action === 'approve' ? 'Unable to Approve' : 'Unable to Decline',
        message,
      );
  }

  function openMenu(request: ReceivedJoinRequest) {
    const blocked = whyNotApprove(members, userId, request);
    showActionMenu({
      title: request.name,
      message: blocked
        ? cannotApproveText(blocked)
        : "They'll see this group's expenses and can add and change them.",
      actions: [
        ...(blocked
          ? []
          : [
              {
                label: 'Approve',
                onPress: () => void answer(request, 'approve'),
              },
            ]),
        {
          label: 'Decline',
          destructive: true,
          onPress: () => void answer(request, 'reject'),
        },
      ],
    });
  }

  if (requests.length === 0) return null;
  return (
    <>
      <Text style={[styles.header, { color: colors.textMuted }]}>Requests</Text>
      <GroupedSection style={styles.section}>
        {requests.map((request) => {
          const member = members.find(({ id }) => id === request.memberId);
          const line =
            processing?.deviceId === request.deviceId
              ? processing.action === 'approve'
                ? 'Approving…'
                : 'Declining…'
              : request.memberId === null
                ? 'Wants to join as a new member'
                : member
                  ? `Wants to join as ${member.name}`
                  : 'Wants to join as a member who left';
          return (
            <Pressable
              key={request.deviceId}
              accessibilityRole="button"
              accessibilityLabel={`${request.name}, ${line}`}
              // One request at a time: no row answers while one is being answered.
              onPress={() => {
                if (!processing) openMenu(request);
              }}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.pressedSurface },
              ]}
            >
              <View style={styles.lines}>
                <Text style={[styles.name, { color: colors.text }]}>
                  {request.name}
                </Text>
                <Text style={[styles.line, { color: colors.textMuted }]}>
                  {line}
                </Text>
              </View>
              <Text accessible={false} style={{ color: colors.textMuted }}>
                ›
              </Text>
            </Pressable>
          );
        })}
      </GroupedSection>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: 13,
    textTransform: 'uppercase',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  section: { marginBottom: 20 },
  row: {
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lines: { flex: 1, gap: 2 },
  name: { fontSize: 17 },
  line: { fontSize: 14 },
});
