// Build-time constants from vite.config.ts `define`. src/telemetry/app-info.ts guards their absence under bun test.
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
