# ADR-0023: Invite links open the app through the API's own domain

- Date: 2026-11-18
- Status: Accepted

## Context

ADR-0015 gave an invite link its shape, `https://<domain>/i/<code>#<secret>`, and left open which domain that is and what answers there. The proposal wants a tap on the link to open the app, and someone without the app to reach a web page, install it, and tap the link again, with no third-party deferred deep link service. Until now the API's only address is its Worker's name under `workers.dev` (ADR-0019), and the app takes links only on its own scheme, `shared-expense-tracker://`.

What the platforms require, as of 2026-11-18:

- iOS opens an `https` link in an app only when the link's domain serves `/.well-known/apple-app-site-association` naming the app, and the app's Associated Domains name the domain (Universal Links). Apple's table of capabilities gives Associated Domains to Apple Developer Program members and not to a free Personal Team, which is what the app is signed with today. Apple's servers fetch the file within about a day and phones take it from them when the app is installed, then about once a week, so a wrong file stays wrong for a while.
- Android does the same with `/.well-known/assetlinks.json`, which names the app's package and the SHA-256 fingerprint of the certificate it is signed with, and an intent filter with `autoVerify` (App Links). Expo's template signs a Release build with a keystore that ships in a public package, so anyone can sign an app that matches its fingerprint.
- Both files must come over HTTPS, with no redirect.
- A browser does not hand a link to the app when the user is already on the link's domain, when the address is typed or pasted, or when the browser is one that does not support it (Apple's TN3155). A chat app's own browser, such as LINE's, is where most invite links will be tapped. In those cases the link lands on the web page, which then needs a way of its own to pass the link on.
- What follows `#` never reaches a server, so only script running on the page can read it.

ADR-0015 already accepts that whoever serves the page could read the secret, because the same party ships the app. Script from anyone else on that page could read it too.

Also considered:

- A static site apart from the API for the page and the two files, such as Cloudflare Pages: one more thing to deploy and keep in step with each environment, for three small responses.
- Passing the link on through a second hostname, as TN3155 suggests: a link to another hostname is a Universal Link again, and with the app missing it lands on the same page. It needs two hostnames and their files in every environment and does nothing for Android, where a chat app's browser decides for itself whether an `https` link leaves it, and where an `intent:` link, the other way to name the app, uses the `#` part for itself and so cannot carry the secret there.
- Opening the app by script as soon as the page loads: without the app, Safari shows an error over the page the person needs to read.
- Showing only the download link for the visitor's device, read from `User-Agent`: a wrong guess, as in an in-app browser or on an iPad, hides the link the person needs.

## Decision

- Each environment's API answers on a hostname of its own under a domain the project owns, and that hostname is the `<domain>` of its invite links. The names live in `apps/api/wrangler.jsonc` and the app's configuration, not here.
- The API itself serves the two verification files and the page, to anyone, without a signature. They never touch the database, so a sleeping database delays none of them.
- What the files and the page say comes from each environment's configuration: the iOS apps, the Android apps with their certificate fingerprints, and where to download each. Production lists only certificates of builds that are given to people. The template keystore's fingerprint is listed only where local builds are checked.
- The app's configuration claims the path `/i/` on every environment's hostname, so one build opens the links of each. The app takes an `https` invite link by its path, whatever its host: the system hands it only links of the domains it verified.
- The page is one static document, the same for every code, so the code is never written into it. Its script and style are inline, it loads nothing from anywhere, and its `Content-Security-Policy` lets the browser run only that inline script and style and connect nowhere.
- The page's `Open in App` link is the same invite link on the app's own scheme, `shared-expense-tracker://i/<code>#<secret>`, built by the script from the page's own address. The page never opens it by itself. The app treats it as it treats the `https` link.
- The page lists both download links and reads no `User-Agent`. A link preview gets the app's name and one sentence about it.

## Consequences

- A tap on an invite link opens the app directly wherever the system hands links over: Messages, Mail, Notes, the camera's QR reader, and browsers that support it. In a chat app's own browser it takes a second tap, on `Open in App`. Whether such a browser lets a page open another app's scheme shows only on a phone, so the `sharing` spec has a hand check with LINE.
- With the app missing, `Open in App` does nothing or shows the browser's error. The page cannot tell whether the app is installed, so it always shows both the button and the download links.
- Nothing proves who owns a scheme. Any page or app can send the app a link on it, which is no more than an `https` link can do. Another app on the same phone can also claim the scheme and receive what `Open in App` sends, secret included. Such an app gets what a leaked link gives (ADR-0015): the group's name and its members' names, and the chance to apply. A member still has to approve.
- The domain is in every link, in the app's entitlements, and in its manifest. Changing it later needs a new build and breaks the links already sent, which last seven days.
- The app is signed with a team in the Apple Developer Program from now on, which has a yearly fee.
- An app ID or fingerprint has to be right before a build reaches people: Apple's servers and installed apps pick up a corrected file only after a day to a week.
- On Android 11 and lower, an app opens its links directly only when every hostname it claims lists its certificate. So each environment also lists the certificates of the builds given to people, and a locally built app, whose certificate production does not list, opens no link directly there: hand checks of the links use Android 12 or later.
- The page is the first HTML the API serves, and the API now answers people as well as phones. It stays one document with no build step. A second page is the time to decide where web pages live.
- The download links come from configuration, so the internal test's links (#158) and later the stores' are a change of configuration, not of code.
- The hostnames and the configuration are in `apps/api/wrangler.jsonc`, so the change that adds them runs `AGENTS.md`'s rule 9.
