import { useRef, useState, type ComponentType, type ReactElement } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import UntypedMaskedView from '@react-native-masked-view/masked-view';

// Its types look for React's beside the package, where pnpm has none.
const MaskedView = UntypedMaskedView as unknown as ComponentType<
  ViewProps & { maskElement: ReactElement }
>;

/**
 * One line of text whose end fades out, instead of ending in "…", when it does not fit. With
 * `minFontSize` it first shrinks down to that size. `expanded` shows all of it, wrapped, at the
 * size the line uses.
 */
export function FadeText({
  children,
  style,
  containerStyle,
  minFontSize,
  expanded = false,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  minFontSize?: number;
  expanded?: boolean;
}) {
  const fontSize = StyleSheet.flatten(style)?.fontSize ?? 14;
  // Most text fits: only a change in the fit renders again, which a long list of cards would feel.
  const boxWidth = useRef(0);
  const textWidth = useRef(0);
  const [fit, setFit] = useState({ scale: 1, fades: false });
  function measured() {
    if (boxWidth.current === 0) return;
    const tooWide = textWidth.current > boxWidth.current + 0.5;
    // A little under the exact fit: a line over by a fraction loses its last word on Android.
    const scale =
      minFontSize && tooWide
        ? Math.max(
            minFontSize / fontSize,
            (boxWidth.current / textWidth.current) * 0.98,
          )
        : 1;
    const fades = tooWide && textWidth.current * scale > boxWidth.current + 0.5;
    setFit((current) =>
      current.scale === scale && current.fades === fades
        ? current
        : { scale, fades },
    );
  }

  const shownFontSize = fontSize * fit.scale;
  const shownStyle = [style, { fontSize: shownFontSize }];
  const line = expanded ? (
    <Text style={shownStyle}>{children}</Text>
  ) : (
    <Text numberOfLines={1} ellipsizeMode="clip" style={shownStyle}>
      {children}
    </Text>
  );
  return (
    <View
      style={containerStyle}
      onLayout={(event) => {
        boxWidth.current = event.nativeEvent.layout.width;
        measured();
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.measure}
      >
        <Text
          style={style}
          onTextLayout={(event) => {
            textWidth.current = event.nativeEvent.lines[0]?.width ?? 0;
            measured();
          }}
        >
          {children}
        </Text>
      </View>
      {fit.fades && !expanded ? (
        <MaskedView
          maskElement={
            <View style={styles.mask}>
              <View style={styles.solid} />
              <View
                style={[
                  styles.fade,
                  { width: Math.max(64, shownFontSize * 3.5) },
                ]}
              />
            </View>
          }
        >
          {line}
        </MaskedView>
      ) : (
        line
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Wide enough that the first line reports the width the text wants.
  measure: { position: 'absolute', width: 4000, opacity: 0 },
  mask: { flex: 1, flexDirection: 'row' },
  solid: { flex: 1, backgroundColor: '#000' },
  fade: {
    experimental_backgroundImage:
      'linear-gradient(to right, #000, transparent 88%)',
  },
});
