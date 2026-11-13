// Each look's styles load the first time it's used, so nobody downloads looks they never pick.
// Bubble (0.13) builds on the v2 panels like v0.10 does; Classic needs nothing extra.
const STYLES: Record<string, () => Promise<unknown>> = {
    bubble: () => import('/@/shared/styles/sour-bubble.css'),
    v8: () => import('/@/shared/styles/sour-v8.css'),
    v10: () => import('/@/shared/styles/sour-v10.css'),
};
const loaded = new Set<string>();

export const LOOK_STYLES: Record<string, string[]> = {
    bubble: ['v8', 'bubble'],
    classic: [],
    liquid: ['v8', 'v10'],
    new: ['v8'],
};

export const loadLookStyles = (ui?: null | string) => {
    for (const name of LOOK_STYLES[ui ?? 'bubble'] ?? LOOK_STYLES.bubble) {
        if (loaded.has(name)) continue;
        loaded.add(name);
        STYLES[name]().catch(() => loaded.delete(name));
    }
};
