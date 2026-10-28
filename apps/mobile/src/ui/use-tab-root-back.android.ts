import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { type Href, router, useFocusEffect } from 'expo-router';

export function useTabRootBack(href: Href): void {
  // NativeTabs 57 ignores initialRouteName and treats the first visible tab as
  // initial. Handle only focused tab roots so a pushed screen still pops first.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          router.navigate(href);
          return true;
        },
      );
      return () => subscription.remove();
    }, [href]),
  );
}
