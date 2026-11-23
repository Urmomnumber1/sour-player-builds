import isElectron from 'is-electron';

import { isAndroidApp, sourMedia } from '/@/renderer/features/sour/mobile/android';
import { type SourLook, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { useSettingsStore } from '/@/renderer/store/settings.store';
import { CITRUS, CITRUS_MODE_KEY } from '/@/shared/citrus';

// Citrus mode (Sour Player 0.16): Citrus Player used to be an app of its own; now it's this app in its lighter
// set-up, with Citrus Player's name and icon. Switching remembers the look each mode had (so going back and
// forth loses nothing), sets the other one, and restarts the app's page.

interface Kept {
    look: Pick<SourLook, LightKeys>;
    pictures: Pictures;
}
type LightKeys =
    | 'barVisualizer'
    | 'fadeCovers'
    | 'lemonLoader'
    | 'pressFx'
    | 'reducedMotion'
    | 'ui';
type Pictures = {
    fullScreenPlayer: number;
    header: number;
    itemCard: number;
    sidebar: number;
    table: number;
};

// what Citrus mode starts with: the plain look, nothing moving, smaller pictures (less to download, decode
// and keep in memory)
const LIGHT: Kept = {
    look: {
        barVisualizer: false,
        fadeCovers: false,
        lemonLoader: false,
        pressFx: false,
        reducedMotion: true,
        ui: 'classic',
    },
    pictures: { fullScreenPlayer: 600, header: 500, itemCard: 300, sidebar: 300, table: 96 },
};
// ...and Sour Player's own, for a Citrus Player that never looked any other way
const FULL: Kept = {
    look: {
        barVisualizer: true,
        fadeCovers: true,
        lemonLoader: true,
        pressFx: true,
        reducedMotion: false,
        ui: 'bubble',
    },
    pictures: { fullScreenPlayer: 0, header: 1000, itemCard: 600, sidebar: 600, table: 160 },
};

const keptKey = (citrus: boolean) => (citrus ? 'sour-citrus-look-citrus' : 'sour-citrus-look-sour');

const read = (citrus: boolean): Kept | null => {
    try {
        const raw = JSON.parse(localStorage.getItem(keptKey(citrus)) || 'null') as Kept | null;
        return raw?.look && raw.pictures ? raw : null;
    } catch {
        return null;
    }
};

export const setCitrusMode = (on: boolean) => {
    if (on === CITRUS) return;
    const { look, setLook } = useSourStore.getState();
    const settings = useSettingsStore.getState();
    const mine: Kept = {
        look: {
            barVisualizer: look.barVisualizer,
            fadeCovers: look.fadeCovers,
            lemonLoader: look.lemonLoader,
            pressFx: look.pressFx,
            reducedMotion: look.reducedMotion,
            ui: look.ui,
        },
        pictures: { ...(settings.general.imageRes as Pictures) },
    };
    const next = read(on) ?? (on ? LIGHT : FULL);
    try {
        localStorage.setItem(keptKey(CITRUS), JSON.stringify(mine));
        localStorage.setItem(CITRUS_MODE_KEY, on ? '1' : '0');
    } catch {
        // nowhere to keep it (private browsing): the mode can't be changed
        return;
    }
    setLook(next.look);
    settings.actions.setSettings({ general: { imageRes: next.pictures } });
    // the tray and the window's icon at the next start (computers), the home screen icon and name (Android)
    if (isElectron()) window.api?.ipc?.send('sour-citrus-mode', on);
    if (isAndroidApp())
        void sourMedia('setIcon', { citrus: on, pack: look.iconPack }).catch(() => {});
    // a moment for the settings to be written, then the page starts again in the new mode
    window.setTimeout(() => window.location.reload(), 450);
};
