import { createJSONStorage, persist } from 'zustand/middleware';
import { createWithEqualityFn } from 'zustand/traditional';

import { useRadioStore } from '/@/renderer/features/radio/hooks/use-radio-player';
import { hermesBase } from '/@/renderer/features/sour/podcasts/podcast-id';
import { useAuthStore, useSettingsStore } from '/@/renderer/store';
import { PlayerType } from '/@/shared/types/types';

// The radio, redone (0.13): stations from your music server, ones you saved from the directory, the ones
// you played lately, and a directory of thousands more (radio-browser.info, a free community list).
// A station that a browser isn't allowed to play directly goes through Hermes Music instead.

export interface Station {
    country?: string;
    id: string;
    image?: null | string;
    // where it came from: the music server, saved from the directory, or just the directory
    kind: 'directory' | 'saved' | 'server';
    name: string;
    tags?: string;
    url: string;
}

interface RadioPlusState {
    recent: Station[];
    saved: Station[];
}

export const useRadioPlus = createWithEqualityFn<RadioPlusState>()(
    persist((): RadioPlusState => ({ recent: [], saved: [] }), {
        name: 'sour-radio',
        storage: createJSONStorage(() => localStorage),
    }),
);

export const saveStation = (s: Station) =>
    useRadioPlus.setState((st) => ({
        saved: [{ ...s, kind: 'saved' as const }, ...st.saved.filter((x) => x.url !== s.url)],
    }));

export const forgetStation = (url: string) =>
    useRadioPlus.setState((st) => ({ saved: st.saved.filter((x) => x.url !== url) }));

// ---- the directory (radio-browser.info has a few mirrors; the first that answers wins)
const MIRRORS = ['de1', 'nl1', 'at1', 'de2'];
let mirror = 0;

const directory = async <T>(path: string): Promise<T> => {
    for (let i = 0; i < MIRRORS.length; i++) {
        const host = MIRRORS[(mirror + i) % MIRRORS.length];
        try {
            const r = await fetch(`https://${host}.api.radio-browser.info/json/${path}`, {
                signal: AbortSignal.timeout(8000),
            });
            if (r.ok) {
                mirror = (mirror + i) % MIRRORS.length;
                return (await r.json()) as T;
            }
        } catch {
            // try the next mirror
        }
    }
    throw new Error("Couldn't reach the radio directory. Try again in a bit.");
};

interface DirectoryStation {
    codec: string;
    countrycode: string;
    favicon: string;
    hls: number;
    lastcheckok: number;
    name: string;
    stationuuid: string;
    tags: string;
    url: string;
    url_resolved: string;
}

export const findStations = async (args: { country?: string; name?: string; tag?: string }) => {
    const q = new URLSearchParams({
        hidebroken: 'true',
        limit: '48',
        order: 'clickcount',
        reverse: 'true',
    });
    if (args.name) q.set('name', args.name);
    if (args.tag) q.set('tag', args.tag);
    if (args.country) q.set('countrycode', args.country);
    const list = await directory<DirectoryStation[]>(`stations/search?${q}`);
    const seen = new Set<string>();
    return list
        .filter((s) => !s.hls && s.lastcheckok !== 0 && (s.url_resolved || s.url))
        .map(
            (s): Station => ({
                country: s.countrycode,
                id: s.stationuuid,
                image: s.favicon || null,
                kind: 'directory',
                name: s.name.trim().replace(/\s+/g, ' '),
                tags: s.tags,
                url: s.url_resolved || s.url,
            }),
        )
        .filter((s) => {
            // the directory has many copies of the big stations
            const key = s.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 36);
};

// where you are, from the app's language (en-GB -> GB): for "Near you"
export const myCountry = () => {
    const tag = navigator.language || '';
    const m = tag.match(/[-_]([A-Za-z]{2})$/);
    return m ? m[1].toUpperCase() : '';
};

// ---- playing
const relay = (url: string) => `${hermesBase()}/api/radio/relay?url=${encodeURIComponent(url)}`;

// can the app play this station itself? (it asks for the stream and stops as soon as it answers)
const playableHere = async (url: string) => {
    if (location.protocol === 'https:' && url.startsWith('http:')) return false;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 6000);
    try {
        const r = await fetch(url, { signal: ctrl.signal });
        return r.ok;
    } catch {
        return false;
    } finally {
        window.clearTimeout(timer);
        ctrl.abort();
    }
};

// the address the player is using for a station (it may be the relayed one)
const playing = new Map<string, string>();
export const isStationPlaying = (current: null | string, url: string) =>
    !!current && (current === url || playing.get(url) === current);

export const playStation = async (s: Station) => {
    const server = useAuthStore.getState().currentServer;
    const mpv = useSettingsStore.getState().playback.type === PlayerType.LOCAL;
    let src = s.url;
    // the desktop's other player (mpv) plays anything; the built-in one needs the station's permission
    if (!mpv && hermesBase() && !(await playableHere(s.url))) src = relay(s.url);
    playing.set(s.url, src);
    useRadioStore.getState().actions.play(src, s.name, {
        id: s.id,
        imageId: null,
        imageUrl: s.image || null,
        serverId: server?.id ?? '',
        thumbHash: null,
    });
    useRadioPlus.setState((st) => ({
        recent: [s, ...st.recent.filter((x) => x.url !== s.url)].slice(0, 12),
    }));
    // the directory counts plays to rank its stations
    if (s.kind !== 'server') void directory(`url/${s.id}`).catch(() => null);
};

export const stopStation = () => useRadioStore.getState().actions.stop();

// a colour for a station without a picture, always the same one for the same name
export const stationHue = (name: string) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
};
