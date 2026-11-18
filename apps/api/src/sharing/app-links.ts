/**
 * The apps that open an environment's invite links, and where to get them: what the two
 * verification files and the download page are made from (ADR-0022). Each environment has
 * its own, and every part may be missing.
 */
export interface AppLinks {
  /** The iOS apps, each as `<team ID>.<bundle ID>`. */
  iosAppIds?: readonly string[];
  androidApps?: readonly AndroidApp[];
  /** Where to get the iPhone app. */
  iosDownloadUrl?: string;
  /** Where to get the Android app. */
  androidDownloadUrl?: string;
}

export interface AndroidApp {
  packageName: string;
  /** SHA-256 of each certificate its builds are signed with, as Android writes them. */
  certFingerprints: readonly string[];
}
