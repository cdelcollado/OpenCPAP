/** The app version, injected at build time from package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
