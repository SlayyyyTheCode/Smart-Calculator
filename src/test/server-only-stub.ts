/**
 * Stand-in for the `server-only` package under Vitest.
 *
 * The real module throws on import to stop server code being bundled into a
 * client component. That guard is a build-time concern; the test runner has no
 * client bundle, so importing it there would fail for no reason.
 */
export {};
