// set at build time (electron.vite.config.ts, web.vite.config.ts): true in Citrus Player, the lighter build
interface ImportMetaEnv {
    readonly SOUR_CITRUS?: boolean | string;
}
