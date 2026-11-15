import { create } from 'zustand';

import { useHermesVideoStore } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { isPodcast } from '/@/renderer/features/sour/podcasts/podcast-id';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { songKeysFor } from '/@/renderer/features/sour/versions/version-keys';
import { type QueueSong, type Song } from '/@/shared/types/domain-types';

// Sour Player 0.15, with Hermes Music 3.16: versions of a song (a Kasane Teto cover, a sped-up edit...) live under
// the song on Hermes Music, so search and the library only show the song itself. Starting the song asks which
// version to play; everywhere else (albums, playlists, shuffle, Auto DJ) it's the version you've played most, or
// the original until you've played another. Hermes measures where each version sits against the original, so
// versions that line up switch mid-song in step (see version-deck.tsx).

export const ORIGINAL = 'original';

export interface SongVersion {
    at?: string;
    by: null | string;
    gain: number;
    id: string;
    label: string;
    // plays in step with the original (the same arrangement and tempo)
    lineUp: boolean;
    link: null | string;
    moved: boolean;
    // seconds to add to a moment in the original to get the same moment in this version
    offset: number;
    profile: null | string;
    requested: boolean;
    seconds: number;
    timing: string;
    video: null | {
        channel: string;
        // where this version's audio starts in its video
        offset: number;
        timing: string;
        title: string;
        videoId: string;
    };
}

export interface VersionedSong {
    artist: string;
    key: string;
    keys: string[];
    title: string;
    versions: SongVersion[];
}

interface VersionsState {
    // when the list last changed (hooks re-read on it)
    at: number;
    byKey: Record<string, VersionedSong>;
    // my plays: song key -> version id ("original" too) -> plays
    mine: Record<string, Record<string, number>>;
    url: string;
}

const CACHE = 'sour-versions';
const index = (songs: VersionedSong[]) => {
    const out: Record<string, VersionedSong> = {};
    for (const s of songs) for (const k of s.keys?.length ? s.keys : [s.key]) out[k] = s;
    return out;
};
// the last list, so the first song after starting the app already plays the right version
const readCache = (): VersionsState => {
    try {
        const raw = JSON.parse(localStorage.getItem(CACHE) || 'null');
        if (raw && Array.isArray(raw.songs))
            return { at: 1, byKey: index(raw.songs), mine: raw.mine || {}, url: raw.url || '' };
    } catch {
        // nothing saved
    }
    return { at: 0, byKey: {}, mine: {}, url: '' };
};

export const useVersions = create<VersionsState>(() => readCache());

const hermes = () => useHermesVideoStore.getState().url;
const me = () => useSourStore.getState().me;

const save = () => {
    const { byKey, mine, url } = useVersions.getState();
    const songs = [...new Set(Object.values(byKey))];
    try {
        localStorage.setItem(CACHE, JSON.stringify({ mine, songs, url }));
    } catch {
        // not kept then
    }
};

export const loadVersions = async () => {
    const url = hermes();
    if (!url) return;
    const who = me();
    const res = await fetch(
        `${url}/api/versions${who ? `?profile=${encodeURIComponent(who.id)}` : ''}`,
    );
    if (!res.ok) return; // an older Hermes Music: no versions
    const json = await res.json().catch(() => null);
    if (!json || !Array.isArray(json.songs)) return;
    useVersions.setState({ at: Date.now(), byKey: index(json.songs), mine: json.mine || {}, url });
    save();
};

type SongLike = Partial<Pick<Song, 'id'>> &
    Pick<Song, 'albumArtistName' | 'albumArtists' | 'artistName' | 'artists' | 'name'>;

// the song's versions (null when it has none)
export const versionsOf = (song?: null | SongLike): null | VersionedSong => {
    if (!song?.name || isPodcast(song as QueueSong)) return null;
    const { byKey, url } = useVersions.getState();
    if (!url || url !== hermes()) return null;
    for (const k of songKeysFor(song)) if (byKey[k]?.versions?.length) return byKey[k];
    return null;
};

// the same, re-read when the list changes
export const useSongVersions = (song?: null | SongLike) => {
    useVersions((s) => s.at);
    useHermesVideoStore((s) => s.url);
    return versionsOf(song);
};

export const findVersion = (entry: null | VersionedSong, id: string) =>
    id === ORIGINAL ? null : (entry?.versions.find((v) => v.id === id) ?? null);
export const versionLabel = (entry: null | VersionedSong, id: string) =>
    id === ORIGINAL ? 'Original' : (findVersion(entry, id)?.label ?? 'Another version');
// seconds from the original's timeline to this version's
export const versionOffset = (entry: null | VersionedSong, id: string) =>
    findVersion(entry, id)?.offset ?? 0;
// plays in step with the original (so it can switch mid-song, and share the ears)
export const inStep = (entry: null | VersionedSong, id: string) =>
    id === ORIGINAL || !!findVersion(entry, id)?.lineUp;
// how much louder or quieter it has to play to match the original
export const versionGain = (entry: null | VersionedSong, id: string) => {
    const g = findVersion(entry, id)?.gain ?? 1;
    return g > 0 ? g : 1;
};

export const myPlays = (entry: VersionedSong) => useVersions.getState().mine[entry.key] || {};

// the version you've played most (the original until you've played another; ties stay with the original)
export const favouriteVersion = (entry: VersionedSong) => {
    const plays = myPlays(entry);
    let best = ORIGINAL;
    let most = plays[ORIGINAL] || 0;
    for (const v of entry.versions) {
        const n = plays[v.id] || 0;
        if (n > most) {
            best = v.id;
            most = n;
        }
    }
    return best;
};

// ---- which version each song in the queue plays ----
// queue item (_uniqueId) -> version: decided when it's first loaded, so it never changes under the player
const picks = new Map<string, string>();
// "Which version?": the version picked for the song that's about to start
let pending: null | { at: number; songId: string; version: string } = null;

export const startWithVersion = (songId: string, version: string) => {
    pending = { at: Date.now(), songId, version };
};
export const setPick = (uniqueId: string, version: string) => picks.set(uniqueId, version);

export const pickFor = (song: QueueSong): string => {
    const entry = versionsOf(song);
    const uid = song._uniqueId;
    const had = uid ? picks.get(uid) : undefined;
    if (had && (had === ORIGINAL || findVersion(entry, had))) return had;
    if (pending && pending.songId === song.id && Date.now() - pending.at < 20000) {
        const version =
            pending.version === ORIGINAL || findVersion(entry, pending.version)
                ? pending.version
                : ORIGINAL;
        pending = null;
        if (uid) picks.set(uid, version);
        return version;
    }
    // not decided while the list isn't here yet (it may still come before the song starts)
    if (!entry) return ORIGINAL;
    const version = favouriteVersion(entry);
    if (uid) picks.set(uid, version);
    return version;
};

export const versionFileUrl = (id: string) =>
    `${hermes()}/api/versions/file?id=${encodeURIComponent(id)}`;

// what the player plays for a queue item: a version's address, or nothing (the music server's own)
export const versionStream = (song?: QueueSong) => {
    if (!song || isPodcast(song)) return { url: undefined, version: ORIGINAL };
    const version = pickFor(song);
    return { url: version === ORIGINAL ? undefined : versionFileUrl(version), version };
};

// which version each queue item's player actually loaded (the song that's playing keeps its address)
export const useLoaded = create<{ v: Record<string, string> }>(() => ({ v: {} }));
export const noteLoaded = (uniqueId: string, version: string) => {
    const { v } = useLoaded.getState();
    if (v[uniqueId] === version) return;
    const keys = Object.keys(v);
    const kept = keys.length > 300 ? Object.fromEntries(keys.slice(-200).map((k) => [k, v[k]])) : v;
    useLoaded.setState({ v: { ...kept, [uniqueId]: version } });
};
export const loadedVersion = (uniqueId?: string) =>
    (uniqueId && useLoaded.getState().v[uniqueId]) || ORIGINAL;

// Lyrics, karaoke and music videos are timed to the original: when the player plays a version, take this many
// seconds off its position (inStep false: the version doesn't line up, so they can't follow it)
export const useOriginalShift = (song?: null | QueueSong) => {
    const entry = useSongVersions(song);
    const main = useLoaded((s) => (song?._uniqueId ? s.v[song._uniqueId] : undefined)) ?? ORIGINAL;
    return { entry, inStep: inStep(entry, main), shift: versionOffset(entry, main), version: main };
};

// the iPhone player stays silent while split ears play both versions through their own sound (see the deck)
export const useMainMute = create<{ on: boolean }>(() => ({ on: false }));

// switching by reloading the player (iPhones, and versions that don't line up): the song's address changes
// once more, and where to carry on from
export const useVersionReloads = create<{ n: Record<string, number> }>(() => ({ n: {} }));
let reloadSeek: null | { at: number; seconds: number; uid: string } = null;
export const reloadWith = (uniqueId: string, version: string, seconds: number) => {
    picks.set(uniqueId, version);
    reloadSeek = { at: Date.now(), seconds, uid: uniqueId };
    useVersionReloads.setState((s) => ({ n: { ...s.n, [uniqueId]: (s.n[uniqueId] || 0) + 1 } }));
};
// the player asks where to start once the new address has loaded
export const takeReloadSeek = (uniqueId?: string) => {
    if (!reloadSeek || reloadSeek.uid !== uniqueId || Date.now() - reloadSeek.at > 20000)
        return null;
    const { seconds } = reloadSeek;
    reloadSeek = null;
    return seconds;
};

// ---- Hermes Music ----
const post = async <T = any>(path: string, body: Record<string, unknown>): Promise<T> => {
    const res = await fetch(`${hermes()}${path}`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Hermes Music returned ${res.status}`);
    return json as T;
};
const auth = () => {
    const who = me();
    return who ? { key: who.key, profile: who.id } : {};
};
const songArtist = (song: Song) => song.artistName || song.albumArtistName || '';

export const versionsApi = {
    // admins: a song in the library becomes a version of another
    link: (song: Song, under: { artist: string; file?: string; title: string }, label?: string) =>
        post<{ id: string; label: string; under: { artist: string; title: string } }>(
            '/api/versions/link',
            {
                ...auth(),
                album: song.album,
                artist: songArtist(song),
                file: song.path,
                label,
                title: song.name,
                under,
            },
        ),
    played: (key: string, version: string) =>
        post('/api/versions/played', { ...auth(), song: key, version }),
    remove: (id: string) => post('/api/versions/remove', { ...auth(), id }),
    rename: (id: string, label: string) => post('/api/versions/rename', { ...auth(), id, label }),
    // "Request a version": a link, or a few words to look for
    request: (song: Song, query: string, label?: string, by?: string) =>
        post('/api/requests', {
            by,
            label,
            of: { artist: songArtist(song), file: song.path, title: song.name },
            profile: me()?.id,
            query,
            type: 'version',
        }),
    unlink: (id: string) => post('/api/versions/unlink', { ...auth(), id }),
    video: (id: string, link: string) => post('/api/versions/video', { ...auth(), id, link }),
};

// a play counts right away here too, so the next start already knows your favourite
export const countPlay = (entry: VersionedSong, version: string) => {
    useVersions.setState((s) => {
        const row = { ...(s.mine[entry.key] || {}) };
        row[version] = (row[version] || 0) + 1;
        return { at: Date.now(), mine: { ...s.mine, [entry.key]: row } };
    });
    save();
    versionsApi.played(entry.key, version).catch(() => undefined);
};
