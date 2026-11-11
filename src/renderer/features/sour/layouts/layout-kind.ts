import type { SourLook } from '/@/renderer/features/sour/store/sour.store';

// Sour Player 0.12: three whole-app layouts next to the older looks (Sour Studio > Layout > App look).
// Each has its own frame (menus, player, side panels) and its own colours; the pages inside are the
// same pages every look uses, restyled.
export type SourLayout = 'hifi' | 'mag' | 'pop';

export const NEW_LAYOUTS: SourLayout[] = ['mag', 'hifi', 'pop'];

export const LAYOUT_NAMES: Record<SourLayout, string> = {
    hifi: 'Hi-Fi',
    mag: 'Magazine',
    pop: 'Pop',
};

export const isNewLayout = (ui?: null | string): ui is SourLayout =>
    ui === 'hifi' || ui === 'mag' || ui === 'pop';

// Magazine comes on paper or at night, Pop in grape or midnight; Hi-Fi is always dark
export const layoutIsDark = (look: Pick<SourLook, 'tone' | 'ui'>) =>
    look.ui === 'hifi' || look.tone === 'dark';

// Mantine's colour scheme: Magazine on paper is the light one. Pop's pages sit on grape (light text),
// its cards bring their own cream colour.
export const layoutScheme = (look: Pick<SourLook, 'tone' | 'ui'>): 'dark' | 'light' =>
    look.ui === 'mag' && look.tone !== 'dark' ? 'light' : 'dark';

// Every look's styles load the first time it's used, so nobody downloads looks they never pick
const STYLES: Record<string, () => Promise<unknown>> = {
    hifi: () => import('./styles/x-hifi.css'),
    mag: () => import('./styles/x-mag.css'),
    pop: () => import('./styles/x-pop.css'),
    v8: () => import('/@/shared/styles/sour-v8.css'),
    v10: () => import('/@/shared/styles/sour-v10.css'),
    x: () => import('./styles/x-common.css'),
};
const loaded = new Set<string>();

export const loadLookStyles = (ui?: null | string) => {
    const look = ui ?? 'liquid';
    const wanted = isNewLayout(look)
        ? ['x', look]
        : look === 'liquid'
          ? ['v8', 'v10']
          : look === 'new'
            ? ['v8']
            : [];
    for (const name of wanted) {
        if (loaded.has(name)) continue;
        loaded.add(name);
        STYLES[name]().catch(() => loaded.delete(name));
    }
};
