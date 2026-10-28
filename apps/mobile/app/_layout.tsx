import { Stack } from 'expo-router';
import { PhoneLocalData } from '../src/shell/phone-local-data';

export default function RootLayout() {
  return (
    <PhoneLocalData>
      <Stack screenOptions={{ headerShown: false }} />
    </PhoneLocalData>
  );
}
