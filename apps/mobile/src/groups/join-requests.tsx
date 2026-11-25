import { useEffect, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_SHARED_GROUP_MEMBERS } from '@shared-expense/domain';
import { useLocalDatabase } from '../shell';
import {
  joinRequestDecision,
  type JoinDecision,
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
import { memberNameKey, type GroupMember } from './index';

const CANNOT = "This request can't be approved.";
const WENT_WRONG = 'Something went wrong. Try again later.';

/** The sentence a request's menu shows in place of Approve (SHARING-194.2). */
function cannotApproveText({ reason, member }: JoinDecision) {
  switch (reason) {
    case 'not-a-member':
      return `The member this request chose is no longer in this group. ${CANNOT}`;
    case 'is-you':
      return `You're already in this group as ${member?.name}. ${CANNOT}`;
    case 'has-a-phone':
      return `${member?.name} has already joined from another phone. ${CANNOT}`;
    case 'no-phone':
      return `${member?.name} hasn't joined from a phone, so there is nothing to take over. ${CANNOT}`;
    case 'revoking':
      return `This invite is no longer valid. Ask them to request again with a new link. ${CANNOT}`;
    case 'group-full':
      return `A shared group can have up to ${MAX_SHARED_GROUP_MEMBERS} members. ${CANNOT}`;
    case 'same-name':
      return `This group already has a member named ${member?.name}. ${CANNOT}`;
    default:
      return WENT_WRONG;
  }
}

/**
 * The Requests section of an unarchived shared ledger's Members (GROUPS-131.2): the join
 * requests the phone has listed, each with the menu that approves or declines it
 * (GROUPS-132.2). It lists them again as Members opens (SHARING-190.2).
 */
export function JoinRequests({
  groupId,
  members,
  formerMembers,
}: {
  groupId: string;
  members: readonly GroupMember[];
  /** The most recently removed first. */
  formerMembers: readonly GroupMember[];
}) {
  const database = useLocalDatabase();
  const colors = useThemeColors();
  const { requests, processing } = useReceivedRequests(database, groupId);
  const open = useRef(true);
  const openingMenu = useRef(false);
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
    addBack?: string,
  ) {
    const result = await answerJoinRequest(
      database,
      groupId,
      request,
      action,
      addBack,
    );
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
      case 'waiting-for-snapshot': {
        const latest = await joinRequestDecision(
          database,
          groupId,
          request,
        ).catch(() => undefined);
        const name =
          latest?.member?.name ??
          members.find((member) => member.id === request.memberId)?.name;
        message = name
          ? `This phone is still catching up with this group, so it can't approve this request yet. If ${name}'s old phone is the only other phone in this group, remove ${name} from the group and send a new invite link. When they ask to join as a new member named ${name}, choose Add Back.`
          : WENT_WRONG;
        break;
      }
      case 'cannot-approve': {
        const decision = await joinRequestDecision(
          database,
          groupId,
          request,
        ).catch(() => undefined);
        message =
          decision?.reason === result.reason
            ? cannotApproveText(decision)
            : WENT_WRONG;
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

  /**
   * Approves, after asking first when the request is for a new member whose name a
   * former member has: someone who left can only ask as a new member, and a member says
   * whether it is the same person (SHARING-288.1).
   */
  function approve(request: ReceivedJoinRequest) {
    const former =
      request.memberId === null
        ? formerMembers.find(
            ({ name }) => memberNameKey(name) === memberNameKey(request.name),
          )
        : undefined;
    if (!former) return void answer(request, 'approve');
    Alert.alert(
      `Add ${former.name} Back?`,
      `${former.name} was in this group before. Adding them back reconnects their past payments and shares.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add Back',
          onPress: () => void answer(request, 'approve', former.id),
        },
      ],
      { cancelable: true },
    );
  }

  async function openMenu(request: ReceivedJoinRequest) {
    if (openingMenu.current) return;
    openingMenu.current = true;
    const decision = await joinRequestDecision(
      database,
      groupId,
      request,
    ).catch(() => undefined);
    openingMenu.current = false;
    if (!open.current) return;
    const blocked = !decision || !!decision.reason;
    const name = decision?.member?.name;
    showActionMenu({
      title: request.name,
      message: blocked
        ? cannotApproveText(decision ?? {})
        : request.takeover
          ? `${request.name} wants to take over ${name}. ${name}'s current phone will lose access to this group right away.`
          : "They'll see this group's expenses and can add and change them.",
      actions: [
        ...(blocked
          ? []
          : [
              {
                label: 'Approve',
                onPress: () => approve(request),
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
                  ? request.takeover
                    ? `Wants to take over ${member.name}`
                    : `Wants to join as ${member.name}`
                  : 'Wants to join as a member who left';
          return (
            <Pressable
              key={request.deviceId}
              accessibilityRole="button"
              accessibilityLabel={`${request.name}, ${line}`}
              // One request at a time: no row answers while one is being answered.
              onPress={() => {
                if (!processing) void openMenu(request);
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
