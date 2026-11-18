import {
  ANDROID_APP,
  ANDROID_DOWNLOAD,
  CODE,
  EVERYTHING,
  FINGERPRINTS,
  IOS_APP,
  IOS_DOWNLOAD,
  NO_DATABASE,
  ORIGIN,
  SECRET,
  WHOLE_LINK,
  contentType,
  directives,
  downloadPage,
  getWithOnly,
  hashSource,
  inline,
  linkTo,
  mediaType,
  metaNamed,
  metaStartingWith,
  pageLinks,
  pageTexts,
  parse,
  show,
  useLinksApi,
} from './sharing-links-app';

// No request here is signed or names a device: anyone may ask for these.

const api = useLinksApi();

const APP_NAME = 'Shared Expense Tracker';
const INVITED = "You've been invited to join a group.";
const OPEN = 'Open in App';
const INSTALL =
  "Don't have the app? Install it, then tap your invite link again.";
const NOT_AVAILABLE = "Don't have the app? It isn't available to download yet.";
const FOR_IPHONE = 'Download for iPhone';
const FOR_ANDROID = 'Download for Android';
const ABOUT =
  'Keep personal and shared expenses in one place, with your partner or friends.';
const APP_LINK = `shared-expense-tracker://i/${CODE}#${SECRET}`;

const ASSOCIATION = '/.well-known/apple-app-site-association';
const ASSET_LINKS = '/.well-known/assetlinks.json';
const INVITE = `/i/${CODE}`;

const association = (...appIDs: string[]) => ({
  applinks: { details: [{ appIDs, components: [{ '/': '/i/*' }] }] },
});

const statement = (app: {
  packageName: string;
  certFingerprints: readonly string[];
}) => ({
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: app.packageName,
    sha256_cert_fingerprints: app.certFingerprints,
  },
});

describe('apple-app-site-association', () => {
  test('[SHARING-60.1] names the configured iOS app and the invite paths, as JSON, with no redirect', async () => {
    const response = await (await api.start(EVERYTHING)).fetch(ASSOCIATION);

    expect(response.status).toBe(200);
    expect(mediaType(response)).toBe('application/json');
    expect(await response.json()).toEqual(association(IOS_APP));
  });

  test('[SHARING-60.1] lists two iOS apps in one entry, in the configured order', async () => {
    const other = 'FGHIJ67890.com.example.other';
    const response = await (
      await api.start({ iosAppIds: [IOS_APP, other] })
    ).fetch(ASSOCIATION);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(association(IOS_APP, other));
  });

  test.each([
    ['no app links at all', undefined],
    ['an empty list of iOS apps', { iosAppIds: [] }],
    ['only an Android app', { androidApps: [ANDROID_APP] }],
  ])(
    '[SHARING-60.1] has no details when the environment has %s',
    async (_, appLinks) => {
      const response = await (await api.start(appLinks)).fetch(ASSOCIATION);

      expect(response.status).toBe(200);
      expect(mediaType(response)).toBe('application/json');
      expect(await response.json()).toEqual({ applinks: { details: [] } });
    },
  );
});

describe('assetlinks.json', () => {
  test("[SHARING-61.1] names the configured Android app with both of its certificates' fingerprints, as JSON, with no redirect", async () => {
    const response = await (await api.start(EVERYTHING)).fetch(ASSET_LINKS);

    expect(response.status).toBe(200);
    expect(mediaType(response)).toBe('application/json');
    expect(await response.json()).toEqual([statement(ANDROID_APP)]);
  });

  test('[SHARING-61.1] lists two Android apps in the configured order, each with its own fingerprints', async () => {
    const first = {
      packageName: 'com.tomchen.sharedexpensetracker',
      certFingerprints: [FINGERPRINTS[0]],
    };
    const second = {
      packageName: 'com.example.other',
      certFingerprints: [FINGERPRINTS[1]],
    };
    const response = await (
      await api.start({ androidApps: [first, second] })
    ).fetch(ASSET_LINKS);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      statement(first),
      statement(second),
    ]);
  });

  test.each([
    ['no app links at all', undefined],
    ['an empty list of Android apps', { androidApps: [] }],
    ['only an iOS app', { iosAppIds: [IOS_APP] }],
  ])(
    '[SHARING-61.1] is an empty list when the environment has %s',
    async (_, appLinks) => {
      const response = await (await api.start(appLinks)).fetch(ASSET_LINKS);

      expect(response.status).toBe(200);
      expect(mediaType(response)).toBe('application/json');
      expect(await response.json()).toEqual([]);
    },
  );
});

describe('the download page, whatever the code', () => {
  test("[SHARING-62.1] answers an invite link's path with the download page as HTML, with no redirect and no cookie", async () => {
    const response = await (await api.start(EVERYTHING)).fetch(INVITE);

    expect(response.status).toBe(200);
    expect(contentType(response)).toBe('text/html;charset=utf-8');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(parse(await response.text()).title).toBe(APP_NAME);
  });

  test('[SHARING-62.1] answers the same page and policy for every code, and writes none of them into the page', async () => {
    const server = await api.start(EVERYTHING);
    const first = await downloadPage(server);
    expect(first.status).toBe(200);

    for (const code of [
      'a',
      'a'.repeat(2000),
      'abc.png',
      '%3Cscript%3Ealert(1)%3C%2Fscript%3E',
    ])
      expect(await downloadPage(server, `/i/${code}`)).toEqual(first);
    expect(first.html).not.toContain(CODE);
    expect(first.html).not.toContain('alert(1)');
  });

  test('[SHARING-62.1] answers the same page and policy whatever query the link carries', async () => {
    const server = await api.start(EVERYTHING);
    const first = await downloadPage(server);
    expect(first.status).toBe(200);

    for (const query of [
      '?openExternalBrowser=1',
      '?fbclid=IwAR0abc&utm_source=line',
    ])
      expect(await downloadPage(server, `${INVITE}${query}`)).toEqual(first);
  });

  test('[SHARING-62.1] answers the same page to an iPhone, an Android phone, an in-app browser, and a request that names no browser or language', async () => {
    const server = await api.start(EVERYTHING);
    const first = await downloadPage(server);
    expect(first.status).toBe(200);

    for (const userAgent of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/15.19.0',
    ])
      for (const language of ['zh-TW', 'en-AU']) {
        const response = await server.fetch(INVITE, {
          headers: { 'User-Agent': userAgent, 'Accept-Language': language },
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-security-policy')).toBe(
          first.policy,
        );
        expect(await response.text()).toBe(first.html);
      }
    expect(await getWithOnly(server, INVITE)).toEqual({
      status: 200,
      body: first.html,
    });
  });

  test.each(['/i', '/i/', '/i/a/b', '/i/a/', '/i//a'])(
    '[SHARING-63.1] answers %s with a 4xx and not the download page, while /i/a gets the page',
    async (path) => {
      const server = await api.start(EVERYTHING);
      const page = await downloadPage(server, '/i/a');
      expect(page.status).toBe(200);
      expect(parse(page.html).title).toBe(APP_NAME);

      const response = await server.fetch(path);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      const body = await response.text();
      expect(body).not.toBe(page.html);
      expect(body).not.toContain(OPEN);
    },
  );
});

describe('what the download page shows', () => {
  test('[SHARING-64.1] [SHARING-65.1] shows the name, the invitation, Open in App, how to install and both download links, top to bottom, and nothing else', async () => {
    const { html } = await downloadPage(await api.start(EVERYTHING));
    const { document } = await show(html, WHOLE_LINK);

    expect(pageTexts(document)).toEqual([
      APP_NAME,
      INVITED,
      OPEN,
      INSTALL,
      FOR_IPHONE,
      FOR_ANDROID,
    ]);
    expect(document.title).toBe(APP_NAME);
    const headings = [...document.querySelectorAll('h1')];
    expect(headings.map((heading) => heading.textContent?.trim())).toEqual([
      APP_NAME,
    ]);
    expect(pageLinks(document)).toEqual([
      [OPEN, expect.any(String)],
      [FOR_IPHONE, IOS_DOWNLOAD],
      [FOR_ANDROID, ANDROID_DOWNLOAD],
    ]);
  });

  test("[SHARING-64.1] is marked as English and laid out to the device's width", async () => {
    const { html } = await downloadPage(await api.start(EVERYTHING));
    const document = parse(html);

    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(metaNamed(document, 'viewport')).toEqual([
      'width=device-width, initial-scale=1',
    ]);
  });

  test('[SHARING-65.1] lists only Download for iPhone when the environment has no Android download link', async () => {
    const { html } = await downloadPage(
      await api.start({ ...EVERYTHING, androidDownloadUrl: undefined }),
    );
    const { document } = await show(html, WHOLE_LINK);

    expect(pageTexts(document)).toEqual([
      APP_NAME,
      INVITED,
      OPEN,
      INSTALL,
      FOR_IPHONE,
    ]);
    expect(pageLinks(document).slice(1)).toEqual([[FOR_IPHONE, IOS_DOWNLOAD]]);
  });

  test('[SHARING-65.1] lists only Download for Android when the environment has no iPhone download link', async () => {
    const { html } = await downloadPage(
      await api.start({ ...EVERYTHING, iosDownloadUrl: undefined }),
    );
    const { document } = await show(html, WHOLE_LINK);

    expect(pageTexts(document)).toEqual([
      APP_NAME,
      INVITED,
      OPEN,
      INSTALL,
      FOR_ANDROID,
    ]);
    expect(pageLinks(document).slice(1)).toEqual([
      [FOR_ANDROID, ANDROID_DOWNLOAD],
    ]);
  });

  test.each([
    ['no app links at all', undefined],
    ['apps but no download link', { iosAppIds: [IOS_APP] }],
  ])(
    '[SHARING-65.1] says the app is not available to download yet, with Open in App as its only link, when the environment has %s',
    async (_, appLinks) => {
      const { html } = await downloadPage(await api.start(appLinks));
      const { document } = await show(html, WHOLE_LINK);

      expect(pageTexts(document)).toEqual([
        APP_NAME,
        INVITED,
        OPEN,
        NOT_AVAILABLE,
      ]);
      expect(pageLinks(document)).toEqual([[OPEN, expect.any(String)]]);
    },
  );
});

describe('Open in App', () => {
  test('[SHARING-66.1] leads to the whole invite link on the app scheme', async () => {
    const { html } = await downloadPage(await api.start(EVERYTHING));

    const { document } = await show(html, WHOLE_LINK);

    expect(linkTo(document, OPEN)).toBe(APP_LINK);
  });

  test('[SHARING-66.1] leaves out the query', async () => {
    const { html } = await downloadPage(await api.start(EVERYTHING));

    const { document } = await show(
      html,
      `${ORIGIN}/i/${CODE}?openExternalBrowser=1#${SECRET}`,
    );

    expect(linkTo(document, OPEN)).toBe(APP_LINK);
  });

  test.each([`${ORIGIN}/i/${CODE}`, `${ORIGIN}/i/${CODE}#`])(
    '[SHARING-66.1] adds no # for %s, which has nothing after it',
    async (address) => {
      const { html } = await downloadPage(await api.start(EVERYTHING));

      const { document } = await show(html, address);

      expect(linkTo(document, OPEN)).toBe(`shared-expense-tracker://i/${CODE}`);
    },
  );

  test('[SHARING-66.1] carries what follows the # as the address writes it', async () => {
    const { html } = await downloadPage(await api.start(EVERYTHING));

    const { document } = await show(
      html,
      `${ORIGIN}/i/abc#k-1_2.3~4%2F5=6&7+8?9`,
    );

    expect(linkTo(document, OPEN)).toBe(
      'shared-expense-tracker://i/abc#k-1_2.3~4%2F5=6&7+8?9',
    );
  });

  test('[SHARING-66.1] goes nowhere and opens nothing until it is pressed', async () => {
    const { html } = await downloadPage(await api.start(EVERYTHING));

    const page = await show(html, WHOLE_LINK);

    expect(linkTo(page.document, OPEN)).toBe(APP_LINK);
    expect(page.address).toBe(WHOLE_LINK);
    expect(page.errors).toEqual([]);
    expect(page.reached).toEqual([]);
  });
});

describe('what the download page loads and sends', () => {
  test('[SHARING-67.1] has nothing that loads from elsewhere, and no link but Open in App and the two download links', async () => {
    const { html, status } = await downloadPage(await api.start(EVERYTHING));
    expect(status).toBe(200);
    const document = parse(html);
    const all = [...document.querySelectorAll('*')];

    expect(
      [
        ...document.querySelectorAll(
          '[src], [srcset], link, iframe, frame, object, embed, form, base',
        ),
        ...[...document.querySelectorAll('meta[http-equiv]')].filter(
          (meta) =>
            meta.getAttribute('http-equiv')?.toLowerCase() === 'refresh',
        ),
      ].map((element) => element.outerHTML),
    ).toEqual([]);
    expect(
      all.flatMap((element) =>
        element
          .getAttributeNames()
          .filter((name) => name === 'style' || name.startsWith('on'))
          .map((name) => `${element.nodeName} ${name}`),
      ),
    ).toEqual([]);
    expect(pageLinks(document).map(([text]) => text)).toEqual([
      OPEN,
      FOR_IPHONE,
      FOR_ANDROID,
    ]);
    expect(inline(document, 'script').length).toBeGreaterThan(0);
  });

  test('[SHARING-67.1] sends a Content-Security-Policy that allows only its own inline script and style', async () => {
    const { html, policy, status } = await downloadPage(
      await api.start(EVERYTHING),
    );
    expect(status).toBe(200);
    const document = parse(html);
    const scripts = inline(document, 'script').map(hashSource);
    const styles = inline(document, 'style').map(hashSource);

    const allowed = directives(policy);

    expect(allowed.get('default-src')).toEqual(["'none'"]);
    expect(allowed.get('base-uri')).toEqual(["'none'"]);
    expect(allowed.get('form-action')).toEqual(["'none'"]);
    expect(allowed.get('frame-ancestors')).toEqual(["'none'"]);
    expect(scripts.length).toBeGreaterThan(0);
    expect([...(allowed.get('script-src') ?? [])].sort()).toEqual(
      [...new Set(scripts)].sort(),
    );
    expect([...(allowed.get('style-src') ?? [])].sort()).toEqual(
      [...new Set(styles)].sort(),
    );
    expect(
      [...allowed.keys()].filter(
        (name) =>
          ![
            'default-src',
            'base-uri',
            'form-action',
            'frame-ancestors',
            'script-src',
            'style-src',
          ].includes(name),
      ),
    ).toEqual([]);
  });

  test('[SHARING-67.1] requests nothing, makes nothing that loads, writes no cookie, and puts what follows the # only into Open in App', async () => {
    const { html } = await downloadPage(await api.start(EVERYTHING));

    const page = await show(html, WHOLE_LINK);

    expect(linkTo(page.document, OPEN)).toBe(APP_LINK);
    expect(page.reached).toEqual([]);
    expect(page.loading).toEqual([]);
    expect(page.errors).toEqual([]);
    expect(page.cookie).toBe('');
    expect(page.address).toBe(WHOLE_LINK);
    const shown = page.document.documentElement.outerHTML;
    expect(shown.split(SECRET)).toHaveLength(2);
  });
});

describe('link previews', () => {
  test('[SHARING-68.1] describes only the app: its name and one sentence, with no image and no address', async () => {
    const { html, status } = await downloadPage(await api.start(EVERYTHING));
    expect(status).toBe(200);
    const document = parse(html);

    expect(document.title).toBe(APP_NAME);
    expect(metaStartingWith(document, 'og:').sort()).toEqual([
      ['og:description', ABOUT],
      ['og:title', APP_NAME],
    ]);
    expect(metaNamed(document, 'description')).toEqual([ABOUT]);
    expect(metaStartingWith(document, 'twitter:')).toEqual([]);
    expect(document.querySelectorAll('img, picture, svg, video')).toHaveLength(
      0,
    );
  });

  test.each([
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'WhatsApp/2.23.20.0',
    'TelegramBot (like TwitterBot)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  ])(
    '[SHARING-68.1] answers %s with the page a browser gets, which has nothing about the invite',
    async (userAgent) => {
      const server = await api.start(EVERYTHING);
      const page = await downloadPage(server);
      expect(page.status).toBe(200);

      const response = await server.fetch(INVITE, {
        headers: { 'User-Agent': userAgent },
      });

      expect(response.status).toBe(200);
      const preview = await response.text();
      expect(preview).toBe(page.html);
      expect(preview).not.toContain(CODE);
      expect(pageTexts(parse(preview))).toEqual([
        APP_NAME,
        INVITED,
        OPEN,
        INSTALL,
        FOR_IPHONE,
        FOR_ANDROID,
      ]);
    },
  );
});

describe('without its database', () => {
  test('[SHARING-69.1] answers both verification files and the download page as it does with its database', async () => {
    const withDatabase = await api.start(EVERYTHING);
    const without = await api.start(EVERYTHING, NO_DATABASE);

    for (const path of [ASSOCIATION, ASSET_LINKS, INVITE]) {
      const expected = await withDatabase.fetch(path);
      const response = await without.fetch(path);

      expect(expected.status).toBe(200);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(
        expected.headers.get('content-type'),
      );
      expect(await response.text()).toBe(await expected.text());
    }
  });
});

describe('HEAD', () => {
  test.each([ASSOCIATION, ASSET_LINKS, INVITE])(
    '[SHARING-76.1] answers HEAD %s as it answers GET, with no content',
    async (path) => {
      const server = await api.start(EVERYTHING);
      const get = await server.fetch(path);
      expect(get.status).toBe(200);

      const head = await server.fetch(path, { method: 'HEAD' });

      expect(head.status).toBe(200);
      expect(head.headers.get('content-type')).toBe(
        get.headers.get('content-type'),
      );
      expect(head.headers.get('content-security-policy')).toBe(
        get.headers.get('content-security-policy'),
      );
      expect(await head.text()).toBe('');
    },
  );

  test('[SHARING-76.1] answers HEAD /i/a/b with a 4xx, while HEAD /i/a is answered', async () => {
    const server = await api.start(EVERYTHING);
    expect((await server.fetch('/i/a', { method: 'HEAD' })).status).toBe(200);

    const response = await server.fetch('/i/a/b', { method: 'HEAD' });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});
