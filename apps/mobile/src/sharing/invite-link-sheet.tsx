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
  const { page, close, cards, submit, retry, askToCancel } = useJoinGroup();
  const { name } = useLocalIdentity();
  const colors = useThemeColors();
  const text = [styles.text, { color: colors.text }];
  const title = [styles.title, { color: colors.text }];
  function content() {
    if (!page) return null;
    switch (page.kind) {
      case 'form':
        return (
          <JoinForm
            key={`${page.link.code}#${page.link.secret}`}
            card={page.card}
            initialName={name}
            preparing={page.preparing}
            onSend={submit}
          />
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
              onPress={() => askToCancel(page.request)}
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

const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { fontSize: 22, textAlign: 'center', fontWeight: '600' },
  text: { fontSize: 17, textAlign: 'center' },
});
