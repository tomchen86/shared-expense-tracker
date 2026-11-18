import { ScrollView, Text } from 'react-native';
import { router, Stack } from 'expo-router';
import { useRoute, type RouteProp } from 'expo-router/react-navigation';
import { HeaderActions } from '../../src/ui/header-actions';
import { useSheetScroll } from '../../src/ui/use-sheet-scroll';
import { useThemeColors } from '../../src/ui/theme';

export default function InviteLinkScreen() {
  // The route already holds the original string. useLocalSearchParams would
  // decode its percent escapes a second time.
  const { params } = useRoute<RouteProp<{ 'i/invite': { link: string } }>>();
  const colors = useThemeColors();
  const scroll = useSheetScroll();
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
        {...scroll.scrollProps}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 20 + scroll.bottomPadding,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 17 }}>{params.link}</Text>
      </ScrollView>
    </>
  );
}
