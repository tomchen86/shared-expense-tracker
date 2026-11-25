import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalIdentity } from '../shell';
import { InviteAction } from '../ui/invite-action';
import { ScreenWithSheet } from '../ui/screen-with-sheet';
import { useThemeColors } from '../ui/theme';
import { JoinForm } from './join-form';
import { RequestCardsContext, useJoinGroup } from './use-join-group';

/** The system's invite and a stored request open the same sheet over the current route. */
export function InviteLinkSheet({ children }: { children: ReactNode }) {
  const { page, close, cards, submit, retry, forget, askToCancel } =
    useJoinGroup();
  const { name } = useLocalIdentity();
  const colors = useThemeColors();
  const text = [styles.text, { color: colors.text }];
  const title = [styles.title, { color: colors.text }];
  function content() {
    if (!page) return null;
    switch (page.kind) {
      case 'form': {
        const { again } = page;
        return (
          <JoinForm
            key={`${page.link.code}#${page.link.secret}#${again ? 'again' : ''}`}
            card={page.card}
            initialName={again ? again.name : name}
            preparing={page.preparing}
            onSend={(name, memberId, takeover) =>
              submit(page, name, memberId, takeover)
            }
            onCancel={again && (() => askToCancel(page.link, again))}
          />
        );
      }
      case 'approved':
        return (
          <View style={styles.content}>
            <Text accessibilityRole="header" style={title}>
              Approved
            </Text>
            <Text style={text}>{page.request.groupName}</Text>
            <Text style={text}>
              {page.reason ? unfinished[page.reason] : 'Finishing up…'}
            </Text>
            {/* A newer app is what finishes it: trying again would not. */}
            {page.reason && page.reason !== 'update-needed' && (
              <InviteAction label="Try Again" inline onPress={retry} />
            )}
          </View>
        );
      case 'ended':
        return (
          <View style={styles.content}>
            <Text accessibilityRole="header" style={title}>
              {page.request.outcome === 'declined'
                ? 'Request Declined'
                : 'Invite No Longer Valid'}
            </Text>
            <Text style={text}>{page.request.groupName}</Text>
            <Text style={text}>
              {page.request.outcome === 'declined'
                ? 'A member of this group declined your request.'
                : 'This invite has expired or was turned off. Ask a member for a new link.'}
            </Text>
            <InviteAction label="OK" inline onPress={forget} />
          </View>
        );
      case 'loading':
        return <Text style={text}>Loading invite…</Text>;
      case 'sending':
        return <Text style={text}>Sending request…</Text>;
      case 'notice':
        return (
          <View style={styles.content}>
            <Text style={text}>{page.message}</Text>
            {page.retry && (
              <InviteAction label="Try Again" inline onPress={retry} />
            )}
          </View>
        );
      case 'request':
        return (
          <View style={styles.content}>
            {page.request.sent ? (
              <>
                <Text accessibilityRole="header" style={title}>
                  Waiting for Approval
                </Text>
                <Text style={text}>{page.request.groupName}</Text>
                <Text style={text}>
                  A member of this group has to approve your request. You can
                  keep using the app while you wait.
                </Text>
              </>
            ) : (
              <>
                <Text accessibilityRole="header" style={title}>
                  Your request hasn't been sent.
                </Text>
                {page.reason && <Text style={text}>{page.reason}</Text>}
                <InviteAction label="Try Again" inline onPress={retry} />
              </>
            )}
            <InviteAction
              label="Cancel Request"
              destructive
              onPress={() => askToCancel(page.link, page.request)}
            />
          </View>
        );
    }
  }
  return (
    <RequestCardsContext.Provider value={cards}>
      <ScreenWithSheet title="Join Group" onClose={close} sheet={content()}>
        {children}
      </ScreenWithSheet>
    </RequestCardsContext.Provider>
  );
}

/** Why joining did not finish, as an approved request says it (SHARING-221.1). */
const unfinished = {
  'no-answer': 'Connect to the internet to finish joining.',
  'update-needed': 'Update the app to finish joining this group.',
  failed: 'Something went wrong. Try again later.',
};

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 22, textAlign: 'center', fontWeight: '600' },
  text: { fontSize: 17, textAlign: 'center' },
});
