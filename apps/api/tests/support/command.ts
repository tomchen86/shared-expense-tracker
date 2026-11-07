import { spawn } from 'node:child_process';
import path from 'node:path';

const API_ROOT = path.resolve(__dirname, '../..');
const STARTUP_TIMEOUT_MS = 90_000;

export interface RunningCommand {
  url: string;
  stop(): Promise<void>;
}

function start(name: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawn(path.join(API_ROOT, 'node_modules/.bin', name), args, {
    cwd: API_ROOT,
    env: { ...process.env, NO_COLOR: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group, to stop what it starts as well (tsx's Node, Wrangler's workerd).
    detached: true,
  });
}

/** Starts a command from apps/api's node_modules and waits for it to print its URL. */
export function startServerCommand(
  name: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<RunningCommand> {
  const child = start(name, args, env);
  const exited = new Promise<void>((resolve) =>
    child.once('exit', () => resolve()),
  );
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      process.kill(-child.pid!, 'SIGTERM');
    }
    await exited;
  };
  return new Promise((resolve, reject) => {
    let output = '';
    const fail = (reason: string) => {
      clearTimeout(timer);
      reject(new Error(`${name} ${reason}:\n${output}`));
    };
    const timer = setTimeout(() => {
      fail(`printed no URL in ${STARTUP_TIMEOUT_MS} ms`);
      void stop();
    }, STARTUP_TIMEOUT_MS);
    const read = (chunk: Buffer) => {
      output += chunk.toString();
      // "API listening on" from src/node.ts, "Ready on" from Wrangler.
      const url = /(?:listening|Ready) on (http:\S+)/.exec(output)?.[1];
      if (url) {
        clearTimeout(timer);
        resolve({ url, stop });
      }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.once('exit', (code) => fail(`exited with code ${code}`));
    child.once('error', (error) => fail(`did not start: ${error.message}`));
  });
}

/** Runs a command from apps/api's node_modules to its end and resolves with its exit code. */
export function runCommand(
  name: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<number | null> {
  const child = start(name, args, env);
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
}
