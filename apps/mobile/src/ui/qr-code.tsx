import { useMemo } from 'react';
import {
  PixelRatio,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { toQR } from 'toqr';

export function QrCode({
  value,
  accessibilityLabel,
}: {
  value: string;
  accessibilityLabel: string;
}) {
  const matrix = useMemo(() => toQR(value), [value]);
  const side = Math.sqrt(matrix.length);
  const { width } = useWindowDimensions();
  // Align modules to physical pixels and leave four white modules on every side.
  const density = PixelRatio.get();
  const cell =
    Math.max(
      1,
      Math.floor((Math.min(240, width - 40) * density) / (side + 8)),
    ) / density;
  const size = (side + 8) * cell;
  const ink = useMemo(() => {
    const runs = [];
    for (let row = 0; row < side; row++) {
      for (let col = 0; col < side;) {
        const start = col++;
        if (!matrix[row * side + start]) continue;
        while (col < side && matrix[row * side + col]) col++;
        runs.push(
          <View
            key={row * side + start}
            style={[
              styles.ink,
              {
                top: (row + 4) * cell,
                left: (start + 4) * cell,
                width: (col - start) * cell,
                height: cell,
              },
            ]}
          />,
        );
      }
    }
    return runs;
  }, [matrix, side, cell]);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.paper, { width: size, height: size }]}
    >
      {ink}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { alignSelf: 'center', backgroundColor: 'white' },
  ink: { position: 'absolute', backgroundColor: 'black' },
});
