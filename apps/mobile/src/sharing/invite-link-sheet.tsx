import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Text } from 'react-native';
import { ScreenWithSheet } from '../ui/screen-with-sheet';
import { useThemeColors } from '../ui/theme';
import { onInviteLink } from './invite-links';

/** The system's invite opens a sheet outside the router's path table. */
export function InviteLinkSheet({ children }: { children: ReactNode }) {
  const [link, setLink] = useState<string>();
  const colors = useThemeColors();
  const close = useCallback(() => setLink(undefined), []);
  useEffect(() => onInviteLink(setLink), []);

  return (
    <ScreenWithSheet
      title="Invite Link"
      onClose={close}
      sheet={
        link === undefined ? null : (
          <Text style={{ color: colors.text, fontSize: 17 }}>{link}</Text>
        )
      }
    >
      {children}
    </ScreenWithSheet>
  );
}
