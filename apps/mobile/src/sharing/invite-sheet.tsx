import { useEffect, useRef, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalDatabase } from '../shell';
import { subscribeToAppliedEvents } from '../sync/apply';
import { inviteByCode } from '../sync/invites';
import { InviteAction } from '../ui/invite-action';
import { QrCode } from '../ui/qr-code';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { apiUrl } from './api-address';
import { InviteRequestError } from './invite-api';
import { prepareInvite, revokeInvite, type InviteResult } from './invites';

const messages = {
  offline: 'Connect to the internet to invite people to this group.',
  unavailable: "This group can't be shared from this phone.",
  exists:
    'Another member has already created an invite link. It appears here after this phone syncs.',
  error: 'Something went wrong. Try again later.',
  members:
    'A shared group can have up to 20 members. Remove members to invite people.',
  size: 'The group and member names are too long to invite people. Shorten them and try again.',
};

/** The wire permits whole milliseconds past the end of JavaScript's Date range. */
function expiryDate(ms: number, locale: string) {
  const format = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const lastDate = 8_640_000_000_000_000;
  if (ms <= lastDate) return format.format(ms);
  // A Gregorian cycle has exactly 146097 days and repeats the weekdays and leap years.
  const cycle = 146097 * 86_400_000;
  const cycles = Math.ceil((ms - lastDate) / cycle);
  return format
    .formatToParts(ms - cycles * cycle)
    .map(({ type, value }) =>
      type === 'year' ? String(Number(value) + 400 * cycles) : value,
    )
    .join('');
}

export function InviteContent({
  groupId,
  onClose,
}: {
  groupId: string;
  onClose: () => void;
}) {
  const database = useLocalDatabase();
  const colors = useThemeColors();
  const locale = useDisplayLocale();
  const [result, setResult] = useState<InviteResult>();
  const [attempt, setAttempt] = useState(0);
  const revoking = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    void prepareInvite(database, groupId).then((next) => {
      if (mounted.current) setResult(next);
    });
    return () => {
      mounted.current = false;
    };
  }, [database, groupId, attempt]);

  const invite = typeof result === 'object' ? result : undefined;
  const code = invite?.code;
  useEffect(() => {
    if (!code) return;
    let open = true;
    const read = () => {
      void inviteByCode(database, groupId, code)
        .then((stored) => {
          if (!open) return;
          if (stored) setResult(stored);
          else onClose();
        })
        .catch(() => undefined);
    };
    const unsubscribe = subscribeToAppliedEvents(database, (changed) => {
      if (changed === groupId) read();
    });
    read();
    return () => {
      open = false;
      unsubscribe();
    };
  }, [database, groupId, code, onClose]);

  async function revoke(codeToRevoke: string) {
    if (revoking.current) return;
    revoking.current = true;
    try {
      await revokeInvite(database, groupId, codeToRevoke);
      // The same notification closes the sheet for a local or remote revocation.
    } catch (error) {
      if (mounted.current)
        Alert.alert(
          'Unable to Revoke Link',
          error instanceof InviteRequestError && error.reason === 'no-answer'
            ? 'Connect to the internet and try again.'
            : messages.error,
        );
    } finally {
      revoking.current = false;
    }
  }

  const askToRevoke = () => {
    if (!code || revoking.current) return;
    Alert.alert(
      'Revoke Link?',
      "People who haven't joined yet won't be able to use this link.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => void revoke(code),
        },
      ],
      { cancelable: true },
    );
  };
  const link = invite && `${apiUrl()}/i/${invite.code}#${invite.secret}`;
  const textStyle = [styles.text, { color: colors.text }];
  return (
    <View style={styles.content}>
      {invite && link ? (
        <>
          <QrCode value={link} accessibilityLabel="Invite link QR code" />
          <Text selectable style={textStyle}>
            {link}
          </Text>
          <InviteAction
            label="Share Link"
            onPress={() => {
              void Share.share({ message: link }).catch(() => undefined);
            }}
          />
          <Text style={textStyle}>
            Anyone with this link can ask to join. A member has to approve each
            request.
          </Text>
          <Text style={[styles.text, { color: colors.textMuted }]}>
            {'Expires ' + expiryDate(invite.expiresAtMs, locale)}
          </Text>
          <InviteAction label="Revoke Link" destructive onPress={askToRevoke} />
        </>
      ) : (
        <>
          <Text style={textStyle}>
            {typeof result === 'string' ? messages[result] : 'Creating link…'}
          </Text>
          {(result === 'error' ||
            result === 'offline' ||
            result === 'exists') && (
            <InviteAction
              label="Try Again"
              onPress={() => {
                setResult(undefined);
                setAttempt(attempt + 1);
              }}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  text: { fontSize: 17, textAlign: 'center' },
});
