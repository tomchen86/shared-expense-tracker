import { html, raw } from 'hono/html';
import { encodeBase64 } from 'hono/utils/encode';
import type { AppLinks } from './app-links';

const title = 'Shared Expense Tracker';
const description =
  'Keep personal and shared expenses in one place, with your partner or friends.';

// Only the browser has the fragment. Keep the request URL out of the document.
const script = `document.getElementById('open-app').href =
  'shared-expense-tracker://' + location.pathname.slice(1) + location.hash;`;

const style = `
  :root { color-scheme: light dark; font: 100%/1.5 system-ui, sans-serif; }
  body { margin: 0; padding: 12vh 1.25rem 2rem; }
  main { max-width: 28rem; margin: auto; }
  h1 { margin: 0; font-size: 2rem; line-height: 1.15; }
  #open-app {
    display: inline-block; margin: .5rem 0 1rem; padding: .75rem 1.25rem;
    border-radius: .65rem; background: #1654ad; color: white;
    font-weight: 600; text-decoration: none;
  }
  .downloads { display: flex; flex-wrap: wrap; gap: .75rem 1.25rem; }
`;

async function hashSource(source: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(source),
  );
  return `'sha256-${encodeBase64(digest)}'`;
}

let policy: string | undefined;
export async function downloadPagePolicy(): Promise<string> {
  return (policy ??= [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    `script-src ${await hashSource(script)}`,
    `style-src ${await hashSource(style)}`,
  ].join('; '));
}

export function downloadPage({ iosDownloadUrl, androidDownloadUrl }: AppLinks) {
  const instruction =
    iosDownloadUrl || androidDownloadUrl
      ? "Don't have the app? Install it, then tap your invite link again."
      : "Don't have the app? It isn't available to download yet.";
  const iphone =
    iosDownloadUrl && html`<a href="${iosDownloadUrl}">Download for iPhone</a>`;
  const android =
    androidDownloadUrl &&
    html`<a href="${androidDownloadUrl}">Download for Android</a>`;
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <meta name="description" content="${description}" />
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${description}" />
        ${raw(`<style>${style}</style>`)}
      </head>
      <body>
        <main>
          <h1>${title}</h1>
          <p>You've been invited to join a group.</p>
          <a id="open-app">Open in App</a>
          <p>${instruction}</p>
          <div class="downloads">${iphone} ${android}</div>
        </main>
        ${raw(`<script>${script}</script>`)}
      </body>
    </html>`;
}
