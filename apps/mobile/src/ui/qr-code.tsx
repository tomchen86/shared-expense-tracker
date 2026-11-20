import type { ReactNode } from 'react';

/**
 * A QR code that holds `value` (SHARING-98.1), named `accessibilityLabel` for a screen
 * reader. Nothing draws it yet: the tests read these two props, so keep the name and the
 * props when you replace the body.
 */
export function QrCode(props: {
  value: string;
  accessibilityLabel: string;
}): ReactNode {
  throw new Error(`Nothing draws a QR code for ${props.value} yet`);
}
