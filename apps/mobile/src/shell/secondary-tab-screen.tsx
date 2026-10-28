import { useTabRootBack } from '../ui/use-tab-root-back';
import { HomeScreen } from './home-screen';

export function SecondaryTabScreen() {
  useTabRootBack('/');
  return <HomeScreen />;
}
