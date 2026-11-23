import { Platform, type ViewStyle } from 'react-native';

// On Android expo-symbols draws a font glyph. Let its frame fit the scaled text.
export const materialSymbolFrame = Platform.select<ViewStyle>({
  android: { width: 'auto', height: 'auto' },
});
