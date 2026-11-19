import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { downloadPage, downloadPagePolicy } from './download-page';

export const appLinkRoutes = new Hono<AppEnv>()
  .get('/.well-known/apple-app-site-association', (c) => {
    const appIDs = c.env.appLinks.iosAppIds ?? [];
    const details = appIDs.length
      ? [{ appIDs, components: [{ '/': '/i/*' }] }]
      : [];
    return c.json({ applinks: { details } });
  })
  .get('/.well-known/assetlinks.json', (c) => {
    const apps = c.env.appLinks.androidApps ?? [];
    return c.json(
      apps.map((app) => ({
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: app.packageName,
          sha256_cert_fingerprints: app.certFingerprints,
        },
      })),
    );
  })
  .get('/i/:code', async (c) => {
    c.header('Content-Security-Policy', await downloadPagePolicy());
    return c.html(downloadPage(c.env.appLinks));
  });
