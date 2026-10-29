import type { ReactNode } from 'react';

export interface ReduceTransparencyController {
  waitUntilReady: () => Promise<void>;
}

const DEFAULT_CONTROLLER: ReduceTransparencyController = {
  waitUntilReady: () => Promise.resolve(),
};

export function useReduceTransparencyController(): ReduceTransparencyController {
  return DEFAULT_CONTROLLER;
}

export function ReduceTransparencyProvider({
  children,
}: {
  controller: ReduceTransparencyController;
  children: ReactNode;
}) {
  return <>{children}</>;
}

export function useReduceTransparency(): boolean {
  return true;
}
