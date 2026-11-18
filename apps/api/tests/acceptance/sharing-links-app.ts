import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { JSDOM, VirtualConsole } from 'jsdom';
import { runMigrations } from '../../src/database/migrate';
import { migrations } from '../../src/migrations';
import { startServer, type NodeServer } from '../../src/node';
import type { AppLinks } from '../../src/sharing/app-links';
import { createTestDatabase, type TestDatabase } from '../support/database';

// The invite link tests ask the API, through its Node entry file, for the two verification
// files and the download page, as Apple's and Google's servers and a browser do. They read
// the page as a browser shows it: jsdom parses it, runs its scripts at the address the
// test gives, and the tests read the document that comes out. jsdom enforces no
// Content-Security-Policy, so the tests check the policy against the page themselves.

export const CODE = '3q2-7wEjRWeJq83vEjRWeA';
/** What follows the `#` of the specs' whole link. */
export const SECRET = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
export const ORIGIN = 'https://links.example.test';
export const WHOLE_LINK = `${ORIGIN}/i/${CODE}#${SECRET}`;

export const IOS_APP = 'ABCDE12345.com.tomchen.sharedexpensetracker';
export const FINGERPRINTS = [
  '14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5',
  'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C',
];
export const ANDROID_APP = {
  packageName: 'com.tomchen.sharedexpensetracker',
  certFingerprints: FINGERPRINTS,
};
export const IOS_DOWNLOAD = 'https://testflight.apple.com/join/AbCd1234';
export const ANDROID_DOWNLOAD =
  'https://play.google.com/apps/internaltest/4701234567890123456';
/** An environment with both apps and both download links. */
export const EVERYTHING: AppLinks = {
  iosAppIds: [IOS_APP],
  androidApps: [ANDROID_APP],
  iosDownloadUrl: IOS_DOWNLOAD,
  androidDownloadUrl: ANDROID_DOWNLOAD,
};

/** A database server that refuses connections. */
export const NO_DATABASE = 'postgres://postgres:postgres@127.0.0.1:1/postgres';

export interface LinksApi {
  url: string;
  /** Requests `path` as written, following no redirect. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

/**
 * In the calling scope: one database with the real migrations for all its tests, and
 * `start`, which serves the API on it with one environment's app links. Each server stops
 * after its test.
 */
export function useLinksApi() {
  let database: TestDatabase | undefined;
  const servers: NodeServer[] = [];
  beforeAll(async () => {
    database = await createTestDatabase();
    await runMigrations(database.sql, migrations);
  });
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });
  afterAll(async () => {
    await database?.drop();
  });
  return {
    async start(appLinks?: AppLinks, databaseUrl?: string): Promise<LinksApi> {
      const server = await startServer({
        databaseUrl: databaseUrl ?? database!.url,
        appLinks,
      });
      servers.push(server);
      return {
        url: server.url,
        fetch: (path, init) =>
          fetch(`${server.url}${path}`, { redirect: 'manual', ...init }),
      };
    },
  };
}

/** A response's media type, without its parameters. */
export const mediaType = (response: Response) =>
  response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();

/** A response's Content-Type, in lower case and without spaces. */
export const contentType = (response: Response) =>
  response.headers.get('content-type')?.replaceAll(' ', '').toLowerCase();

/** Requests `path` with exactly `headers`, so with no User-Agent unless they have one. */
export function getWithOnly(
  api: LinksApi,
  path: string,
  headers: Record<string, string> = {},
) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    request(`${api.url}${path}`, { headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    })
      .on('error', reject)
      .end();
  });
}

/** The download page, as the API answers it for the specs' code. */
export async function downloadPage(api: LinksApi, path = `/i/${CODE}`) {
  const response = await api.fetch(path);
  return {
    status: response.status,
    policy: response.headers.get('content-security-policy'),
    html: await response.text(),
  };
}

/** The page's HTML as a document, with none of its scripts run. */
export const parse = (html: string) =>
  // A console of its own, which goes nowhere: jsdom reports style sheets it cannot read.
  new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document;

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/** What the page shows a person, top to bottom: its text outside scripts and styles. */
export function pageTexts(document: Document) {
  const hidden = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const texts: string[] = [];
  const visit = (node: Node) => {
    // 3 is a text node, 1 an element.
    if (node.nodeType === 3) {
      const text = collapse(node.textContent ?? '');
      if (text !== '') texts.push(text);
    } else if (node.nodeType === 1 && !hidden.has(node.nodeName)) {
      node.childNodes.forEach(visit);
    }
  };
  visit(document.body);
  return texts;
}

/** The page's links, top to bottom, as [text, where it leads]. */
export const pageLinks = (document: Document) =>
  [...document.querySelectorAll('a')].map((link) => [
    collapse(link.textContent ?? ''),
    link.getAttribute('href'),
  ]);

/** Where the link named `text` leads, when the page has exactly one. */
export function linkTo(document: Document, text: string) {
  const links = pageLinks(document).filter(([name]) => name === text);
  expect(links).toHaveLength(1);
  return links[0][1];
}

const metaContents = (document: Document, selector: string) =>
  [...document.querySelectorAll(selector)].map((meta) =>
    meta.getAttribute('content'),
  );

/** The content of each `<meta name=…>` with this name. */
export const metaNamed = (document: Document, name: string) =>
  metaContents(document, `meta[name="${name}"]`);

/** Every `<meta>` whose property or name starts with `prefix`, as [property or name, content]. */
export const metaStartingWith = (document: Document, prefix: string) =>
  [...document.querySelectorAll('meta')]
    .map((meta) => [
      meta.getAttribute('property') ?? meta.getAttribute('name') ?? '',
      meta.getAttribute('content'),
    ])
    .filter(([key]) => key?.startsWith(prefix));

/** A Content-Security-Policy as its directives: name to sources. */
export function directives(policy: string | null) {
  const parsed = new Map<string, string[]>();
  for (const directive of (policy ?? '').split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    if (name !== '') parsed.set(name.toLowerCase(), sources);
  }
  return parsed;
}

/** What a policy calls an inline script or style with this text. */
export const hashSource = (text: string) =>
  `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** The text of each inline `<script>` or `<style>` in the page. */
export const inline = (document: Document, tag: 'script' | 'style') =>
  [...document.querySelectorAll(tag)].map(
    (element) => element.textContent ?? '',
  );

export interface ShownPage {
  document: Document;
  /** The page's address once its scripts have run. */
  address: string;
  /** Everything the page's scripts tried to request, open, or connect to. */
  reached: string[];
  /** Elements the scripts made that load something: those with a `src`. */
  loading: string[];
  /**
   * What the browser would report: script errors, and navigation, which jsdom does not do.
   * A style sheet that jsdom cannot read is not one of them.
   */
  errors: string[];
  cookie: string;
}

/**
 * Shows the page as a browser would at `url`: runs its scripts, waits for it to load, and
 * lets every timer the scripts set run. Each way a script could reach a server is replaced
 * with one that only records the attempt.
 */
export async function show(html: string, url: string): Promise<ShownPage> {
  const reached: string[] = [];
  const errors: string[] = [];
  const made: Element[] = [];
  const timers: (() => void)[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  virtualConsole.on('error', (...parts) => errors.push(parts.join(' ')));

  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      const page = window as unknown as Record<string, unknown>;
      const describe = (args: unknown[]) => args.map(String).join(', ');
      page.fetch = (...args: unknown[]) => {
        reached.push(`fetch(${describe(args)})`);
        return new Promise(() => undefined);
      };
      page.open = (...args: unknown[]) => {
        reached.push(`window.open(${describe(args)})`);
        return null;
      };
      for (const name of [
        'XMLHttpRequest',
        'WebSocket',
        'EventSource',
        'Image',
        'Audio',
        'Worker',
        'SharedWorker',
        'RTCPeerConnection',
      ])
        page[name] = function (...args: unknown[]) {
          reached.push(`new ${name}(${describe(args)})`);
        };
      Object.defineProperty(window.navigator, 'sendBeacon', {
        configurable: true,
        value: (...args: unknown[]) => {
          reached.push(`navigator.sendBeacon(${describe(args)})`);
          return true;
        },
      });
      const createElement = window.document.createElement.bind(window.document);
      window.document.createElement = ((name: string, options?: unknown) => {
        const element = createElement(name, options as ElementCreationOptions);
        made.push(element);
        return element;
      }) as typeof window.document.createElement;
      // A timer runs once the page has loaded, however long it was set for.
      const later = (callback: unknown) => {
        if (typeof callback === 'function') timers.push(callback as () => void);
        return timers.length;
      };
      page.setTimeout = later;
      page.setInterval = later;
      page.requestAnimationFrame = later;
    },
  });
  const { window } = dom;
  if (window.document.readyState !== 'complete')
    await new Promise((resolve) => window.addEventListener('load', resolve));
  // A timer may set another; none of them is left waiting.
  for (let round = 0; round < 10 && timers.length > 0; round += 1)
    for (const timer of timers.splice(0)) timer();

  const { document } = window;
  return {
    document,
    address: window.location.href,
    reached,
    loading: [...made, ...document.querySelectorAll('*')]
      .filter((element) => element.hasAttribute('src'))
      .map((element) => element.outerHTML),
    errors: errors.filter(
      (error) => !error.startsWith('Could not parse CSS stylesheet'),
    ),
    cookie: document.cookie,
  };
}
