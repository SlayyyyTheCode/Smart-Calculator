import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shell.
 *
 * Capacitor serves the built bundle from the app package rather than over the
 * network, so a native build starts offline by definition. The service worker
 * still earns its place: it is what makes the installable web version behave
 * the same way, and the web version is how most people will try this first.
 *
 * `androidScheme: "https"` is deliberate. Under the default `http` scheme the
 * WebView is not a secure context, and without a secure context there is no
 * OPFS — which is where the database lives. The app would launch, find no
 * storage, and quietly keep everything in memory until the process is killed.
 */
const config: CapacitorConfig = {
  appId: "com.smartplanner.app",
  appName: "Smart Planner",
  webDir: "dist",
  android: {
    androidScheme: "https",
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
