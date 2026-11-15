import type { QueueSong, Song } from '/@/shared/types/domain-types';

import isElectron from 'is-electron';

import { api } from '/@/renderer/api';
import { isIosApp, isNativeApp, sourMedia } from '/@/renderer/features/sour/mobile/android';
import { usePhoneStore } from '/@/renderer/features/sour/mobile/phone-store';
import { useAuthStore } from '/@/renderer/store/auth.store';
import { useSettingsStore } from '/@/renderer/store/settings.store';
import { SongListSort, SortOrder } from '/@/shared/types/domain-types';
import { PlayerType } from '/@/shared/types/types';

// Offline listening: what you pick (playlists, albums, single songs, and your favourites if you switch that
// on) is saved on the phone, and the player uses the saved copy instead of streaming whenever there is one.
// The Android app keeps them as files; the web app (Hermes Music's /app/, the iPhone app) keeps them in the
// browser's storage. Each saved song remembers why it's there, so it leaves when the last reason goes.

// the web app served by Hermes Music (Safari > Add to Home Screen on an iPhone)
export const isWebApp = () => !isNativeApp() && window.location.pathname.startsWith('/app/');
// the desktop app keeps offline songs in its own browser storage too (played by the built-in player)
const isDesktop = () => !isNativeApp() && isElectron();
const webPlayer = () => useSettingsStore.getState().playback.type === PlayerType.WEB;
export const offlineAvailable = () => isNativeApp() || isWebApp() || isDesktop();
// phones and the web app: "Download" saves into the app (on the computer it saves a file)
export const phoneOffline = () => isNativeApp() || isWebApp() || isIosApp();
// browser storage: the web app, and the iPhone app (it runs from Hermes over http, where the app's own
// files can't be played)
const inBrowserStore = () => isWebApp() || isIosApp() || isDesktop();

const CACHE = 'sour-offline';
const cacheKey = (id: string) => `/app/__offline/${encodeURIComponent(id)}`;
// song id -> a blob: link to its saved copy (made when the app starts, so playing is instant)
const webUrls = new Map<string, string>();

// why a song is on the phone
const ALBUM = 'album:';
const SONG = 'song';
const FAV = 'fav';

export const loadWebOffline = async () => {
    if (!inBrowserStore() || !('caches' in window)) return;
    navigator.storage?.persist?.().catch(() => false); // ask the browser not to clear them
    const cache = await caches.open(CACHE);
    for (const id of Object.keys(usePhoneStore.getState().offline)) {
        if (webUrls.has(id)) continue;
        const hit = await cache.match(cacheKey(id));
        if (hit) webUrls.set(id, URL.createObjectURL(await hit.blob()));
    }
};

const saveCopy = async (
    song: Song,
    url: string,
): Promise<null | { path: string; size: number }> => {
    if (!inBrowserStore()) {
        const ext = (song.container || 'mp3').toLowerCase();
        return sourMedia('saveOffline', { ext, id: song.id, url }).catch(() => null);
    }
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        const cache = await caches.open(CACHE);
        await cache.put(
            cacheKey(song.id),
            new Response(blob, { headers: { 'content-type': blob.type || 'audio/mpeg' } }),
        );
        webUrls.set(song.id, URL.createObjectURL(blob));
        return { path: song.id, size: blob.size };
    } catch {
        return null; // offline, or the phone is out of space
    }
};

const removeCopy = async (id: string) => {
    if (!inBrowserStore()) return sourMedia('removeOffline', { id }).catch(() => undefined);
    const link = webUrls.get(id);
    if (link) URL.revokeObjectURL(link);
    webUrls.delete(id);
    if ('caches' in window) await (await caches.open(CACHE)).delete(cacheKey(id));
    return undefined;
};

const fileUrl = (path: string) => {
    const cap = (window as any).Capacitor;
    return cap?.convertFileSrc ? cap.convertFileSrc(`file://${path}`) : `file://${path}`;
};

// the saved copy of a song, if there is one (used by the player for every song it plays)
export const offlineUrl = (song?: null | QueueSong | { id: string }): string | undefined => {
    if (!song) return undefined;
    if (isDesktop() && !webPlayer()) return undefined; // the other player can't play the saved copies
    if (inBrowserStore()) return webUrls.get(song.id);
    if (!isNativeApp()) return undefined;
    const saved = usePhoneStore.getState().offline[song.id];
    return saved ? fileUrl(saved.path) : undefined;
};

export const offlineBytes = () =>
    Object.values(usePhoneStore.getState().offline).reduce((n, s) => n + (s.size || 0), 0);

let running = false;
let again = false;
let progress: (text: string) => void = () => undefined;
export const onOfflineProgress = (fn: (text: string) => void) => {
    progress = fn;
};

const onWifi = async () => {
    if (!isNativeApp()) {
        // browsers on iPhone don't tell; Android Chrome does
        const type = (navigator as any).connection?.type;
        return type !== 'cellular';
    }
    const net = await sourMedia('network').catch(() => ({ type: 'wifi' }));
    return net.type === 'wifi';
};

// is this reason still wanted? (the user may switch things off while a download runs)
const stillWanted = (tag: string, songId: string) => {
    const s = usePhoneStore.getState();
    if (tag === SONG) return !!s.offlineSongs[songId];
    if (tag === FAV) return s.settings.offlineFavorites;
    if (tag.startsWith(ALBUM)) return !!s.offlineAlbums[tag.slice(ALBUM.length)];
    return !!s.offlinePlaylists[tag];
};

// takes a reason away from the saved songs (all of them, or one); a song with no reason left is deleted
const dropReason = async (tag: string, onlyId?: string) => {
    const { offline } = usePhoneStore.getState();
    const keep: typeof offline = {};
    for (const [id, item] of Object.entries(offline)) {
        const reasons =
            onlyId && id !== onlyId ? item.playlists : item.playlists.filter((p) => p !== tag);
        if (reasons.length)
            keep[id] = reasons === item.playlists ? item : { ...item, playlists: reasons };
        else await removeCopy(id);
    }
    usePhoneStore.setState({ offline: keep });
};

// downloads whatever is wanted and missing (one at a time, respecting Wi-Fi only and the size limit), and
// clears out what isn't wanted any more
export const syncOffline = async () => {
    if (!offlineAvailable()) return;
    if (running) {
        again = true; // something changed meanwhile: go round once more after this
        return;
    }
    if (isDesktop() && (!webPlayer() || !('caches' in window))) {
        progress('Offline songs need the built-in player: Settings > Playback > Web');
        return;
    }
    running = true;
    try {
        const state = usePhoneStore.getState();
        const { offlineFavorites, offlineLimitMb, offlineWifiOnly } = state.settings;
        // everything that should be on the phone, and why
        const wanted = new Map<string, { song: Song; tags: Set<string> }>();
        let complete = true;
        const want = (songs: Song[], tag: string) => {
            for (const song of songs) {
                const w = wanted.get(song.id) ?? { song, tags: new Set<string>() };
                w.tags.add(tag);
                wanted.set(song.id, w);
            }
        };
        for (const [playlistId, serverId] of Object.entries(state.offlinePlaylists)) {
            const res = await api.controller
                .getPlaylistSongList({
                    apiClientProps: { serverId },
                    query: { id: playlistId },
                } as any)
                .catch(() => null);
            if (!res) complete = false;
            else want(((res as any).items ?? []) as Song[], playlistId);
        }
        for (const [albumId, serverId] of Object.entries(state.offlineAlbums)) {
            const album = await api.controller
                .getAlbumDetail({ apiClientProps: { serverId }, query: { id: albumId } } as any)
                .catch(() => null);
            if (!album) complete = false;
            else want(((album as any).songs ?? []) as Song[], ALBUM + albumId);
        }
        for (const { song } of Object.values(state.offlineSongs)) want([song], SONG);
        const serverId = useAuthStore.getState().currentServer?.id;
        if (offlineFavorites && serverId) {
            const res = await api.controller
                .getSongList({
                    apiClientProps: { serverId },
                    query: {
                        favorite: true,
                        limit: 5000,
                        sortBy: SongListSort.NAME,
                        sortOrder: SortOrder.ASC,
                        startIndex: 0,
                    },
                } as any)
                .catch(() => null);
            if (!res) complete = false;
            else want(((res as any).items ?? []) as Song[], FAV);
        }
        // the reasons each saved song has now (only when every list answered: being offline never deletes)
        if (complete) {
            const { offline } = usePhoneStore.getState();
            const keep: typeof offline = {};
            for (const [id, item] of Object.entries(offline)) {
                const w = wanted.get(id);
                if (w) keep[id] = { ...item, playlists: [...w.tags] };
                else await removeCopy(id);
            }
            usePhoneStore.setState({ offline: keep });
        }
        if (
            offlineWifiOnly &&
            [...wanted.keys()].some((id) => !usePhoneStore.getState().offline[id])
        ) {
            if (!(await onWifi())) {
                progress('Waiting for Wi-Fi to download');
                return;
            }
        }
        let fetched = 0;
        for (const [id, w] of wanted) {
            const now = usePhoneStore.getState();
            const have = now.offline[id];
            const tags = [...w.tags].filter((t) => stillWanted(t, id));
            if (!tags.length) continue; // switched off meanwhile
            if (have) {
                const merged = [...new Set([...have.playlists, ...tags])];
                if (merged.length !== have.playlists.length)
                    usePhoneStore.setState((s) => ({
                        offline: { ...s.offline, [id]: { ...have, playlists: merged } },
                    }));
                continue;
            }
            if (offlineBytes() > offlineLimitMb * 1024 * 1024) {
                progress('Storage limit reached (change it in Offline)');
                return;
            }
            if (offlineWifiOnly && fetched % 10 === 0 && !(await onWifi())) {
                progress('Waiting for Wi-Fi to download');
                return;
            }
            progress(`Downloading ${w.song.name}`);
            const url = await api.controller.getStreamUrl({
                apiClientProps: { serverId: w.song._serverId },
                query: { id: w.song.id, transcode: false } as any,
            });
            const saved = await saveCopy(w.song, url);
            if (!saved) continue;
            fetched++;
            usePhoneStore.setState((s) => ({
                offline: {
                    ...s.offline,
                    [id]: { path: saved.path, playlists: tags, size: saved.size, song: w.song },
                },
            }));
        }
        progress(wanted.size ? 'Everything is downloaded' : '');
    } finally {
        running = false;
        if (again) {
            again = false;
            void syncOffline();
        }
    }
};

export const setPlaylistOffline = async (playlistId: string, serverId: string, on: boolean) => {
    if (on) {
        usePhoneStore.setState((s) => ({
            offlinePlaylists: { ...s.offlinePlaylists, [playlistId]: serverId },
        }));
        void syncOffline();
        return;
    }
    const rest = { ...usePhoneStore.getState().offlinePlaylists };
    delete rest[playlistId];
    usePhoneStore.setState({ offlinePlaylists: rest });
    await dropReason(playlistId);
};

export const setAlbumOffline = async (albumId: string, serverId: string, on: boolean) => {
    if (on) {
        usePhoneStore.setState((s) => ({
            offlineAlbums: { ...s.offlineAlbums, [albumId]: serverId },
        }));
        void syncOffline();
        return;
    }
    const rest = { ...usePhoneStore.getState().offlineAlbums };
    delete rest[albumId];
    usePhoneStore.setState({ offlineAlbums: rest });
    await dropReason(ALBUM + albumId);
};

export const setSongOffline = async (song: Song, on: boolean) => {
    if (on) {
        usePhoneStore.setState((s) => ({
            offlineSongs: { ...s.offlineSongs, [song.id]: { serverId: song._serverId, song } },
        }));
        void syncOffline();
        return;
    }
    const rest = { ...usePhoneStore.getState().offlineSongs };
    delete rest[song.id];
    usePhoneStore.setState({ offlineSongs: rest });
    await dropReason(SONG, song.id);
};

export const setFavoritesOffline = async (on: boolean) => {
    usePhoneStore.getState().set({ offlineFavorites: on });
    if (on) void syncOffline();
    else await dropReason(FAV);
};

// why a saved song is there, for people: "Saved on its own", "In Favourites"...
export const offlineReasons = (tags: string[]) => ({
    album: tags.some((t) => t.startsWith(ALBUM)),
    favorite: tags.includes(FAV),
    playlist: tags.some((t) => t !== SONG && t !== FAV && !t.startsWith(ALBUM)),
    song: tags.includes(SONG),
});

// favourites changed (a heart was tapped): when favourites download by themselves, catch up in a moment
let favTimer = 0;
export const favoritesChanged = () => {
    if (!usePhoneStore.getState().settings.offlineFavorites) return;
    window.clearTimeout(favTimer);
    favTimer = window.setTimeout(() => void syncOffline(), 4000);
};

export const clearOffline = async () => {
    if (!inBrowserStore()) await sourMedia('clearOffline').catch(() => undefined);
    else {
        for (const link of webUrls.values()) URL.revokeObjectURL(link);
        webUrls.clear();
        if ('caches' in window) await caches.delete(CACHE);
    }
    usePhoneStore.setState({
        offline: {},
        offlineAlbums: {},
        offlinePlaylists: {},
        offlineSongs: {},
    });
    usePhoneStore.getState().set({ offlineFavorites: false });
};
