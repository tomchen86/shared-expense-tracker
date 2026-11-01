import { Alert } from 'react-native';
import { router, useNavigationContainerRef } from 'expo-router';
import { useLocalIdentity } from '../shell';

/** Both entry points to New Group require a saved name. */
export function useRequireName() {
  const identity = useLocalIdentity();
  const navigation = useNavigationContainerRef();
  return () => {
    if (identity.name) return false;
    Alert.alert(
      'Username Required',
      'Please set your username in Settings before creating a group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go to Settings',
          onPress: () => {
            const settings = navigation
              .getRootState()
              ?.routes.find((route) => route.name === '__root')
              ?.state?.routes.find((route) => route.name === '(tabs)')
              ?.state?.routes.find((route) => route.name === 'settings');
            if (router.canDismiss()) router.dismissAll();
            router.navigate('/settings');
            if ((settings?.state?.index ?? 0) > 0) router.dismissAll();
          },
        },
      ],
    );
    return true;
  };
}
