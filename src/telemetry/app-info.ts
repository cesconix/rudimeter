// Which build logged a line: `hello` and `session:start` carry it, so a session can be re-judged with the
// rules of its day when the log format or the judge moves. Vite defines the two globals at build time
// (vite.config.ts); under `bun test` they do not exist, hence the `typeof` guards.
export const APP_INFO = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
  commit: typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'unknown',
}
