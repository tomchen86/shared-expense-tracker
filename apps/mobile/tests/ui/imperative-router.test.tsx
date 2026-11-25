import { useEffect } from 'react';
import { Text } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { router, useNavigationContainerRef, useRouter } from 'expo-router';

let container: ReturnType<typeof useNavigationContainerRef>;

function Expenses() {
  const scoped = useRouter();
  const ref = useNavigationContainerRef();
  useEffect(() => {
    container = ref;
  }, [ref]);
  return <Text onPress={() => scoped.push('/insights')}>Open insights</Text>;
}

const routes = {
  index: Expenses,
  insights: () => <Text>Insights</Text>,
  groups: () => <Text>Brisbane</Text>,
};

async function mountOverlappingRoots() {
  const older = await renderRouter(routes);
  // Both the linking handler and the queue bridge warn about this intentional overlap.
  const reportError = console.error;
  const warnings = jest
    .spyOn(console, 'error')
    .mockImplementation((...args) => {
      if (!String(args[0]).includes('multiple NavigationContainers')) {
        reportError(...args);
      }
    });
  const newer = await renderRouter(routes).finally(() =>
    warnings.mockRestore(),
  );
  return { older, newer };
}

/** `router.canGoBack()` and the container ref both read the root that shows `route`. */
function expectContainerOn(route: string) {
  expect({
    bound: container.current !== null,
    canGoBack: router.canGoBack(),
    route: container.getCurrentRoute()?.name,
  }).toEqual({ bound: true, canGoBack: true, route });
}

test('the recreated root can navigate with both routers after the old root unmounts', async () => {
  const { older, newer } = await mountOverlappingRoots();
  await older.unmount();

  await fireEvent.press(newer.getByText('Open insights'));
  expect(newer.getByText('Insights')).toBeOnTheScreen();
  await act(() => router.push('/groups'));
  expect(newer.getByText('Brisbane')).toBeOnTheScreen();
  expectContainerOn('groups');

  await newer.unmount();
  expect(container.current).toBeNull();
  expect(() => router.push('/')).toThrow(/imperative router is unavailable/);
});

test('the shared router follows the newest mounted root and returns to the older one when it closes', async () => {
  const { older, newer } = await mountOverlappingRoots();
  await act(() => router.push('/insights'));
  expect(newer.getByText('Insights')).toBeOnTheScreen();
  expect(older.queryByText('Insights')).toBeNull();
  expectContainerOn('insights');

  await newer.unmount();
  await act(() => router.push('/groups'));
  expect(older.queryByText('Brisbane')).not.toBeNull();
  expectContainerOn('groups');
});

test('a single root exposes its stack after an imperative push', async () => {
  await renderRouter(routes);
  await act(() => router.push('/insights'));
  expectContainerOn('insights');
});
