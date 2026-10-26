import type { Custom10 } from '/@/renderer/features/sour/components/customize';
import type { V10Style } from '/@/renderer/features/sour/visualizer/v10-scenes';

import { useQuery } from '@tanstack/react-query';
import { persist } from 'zustand/middleware';
import { createWithEqualityFn } from 'zustand/traditional';

import { type GroupSong } from '/@/renderer/features/group-play/store/group-play.store';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { type Me, sourApi } from '/@/renderer/features/sour/api/sour-api';
import { type Song } from '/@/shared/types/domain-types';

export type BarVisualizerStyle = 'bars' | 'glow' | 'halo' | 'pulp' | 'river';

// a song played on this computer (queue history, "on repeat")
export interface HistoryEntry {
    at: number;
    song: GroupSong;
}

export interface Pin {
    id: string;
    imageId: null | string;
    kind: 'album' | 'playlist' | 'profile';
    name: string;
}

export interface SavedGroup {
    djRotation: boolean;
    guestControl: boolean;
    listed: boolean;
    name: string;
}

// Sour Player's look and comfort switches (Settings > Sour Player and the Sour Studio)
export interface SourLook {
    albumAccent: boolean;
    animatedBackground: boolean;
    // restart into a downloaded update by itself when nothing is playing
    autoUpdate: boolean;
    autoVideo: boolean;
    barLayout: 'classic' | 'floating';
    // the look of the small visualizer in the player bar and the mini player
    barStyle: BarVisualizerStyle;
    barVisualizer: boolean;
    corners: 'normal' | 'round' | 'sharp';
    cursor: boolean;
    // Sour Studio > Customize (0.10)
    custom10?: Partial<Custom10>;
    dailyTheme: boolean;
    density: number;
    fadeCovers: boolean;
    glass: boolean;
    hiddenButtons: string[];
    holidays: boolean;
    // a picture (or GIF) behind the Home page (stored on this computer), and how much it's dimmed
    homeBackground: boolean;
    homeBackgroundDim: number;
    hoverPreview: boolean;
    iconPack: string;
    // when the queue runs out, add songs like the last one
    keepPlaying: boolean;
    lemonLoader: boolean;
    // the Sour Stage's lyrics text size (1 = normal)
    lyricScale: number;
    lyricStyle: 'centered' | 'huge' | 'karaoke';
    pressFx: boolean;
    reducedMotion: boolean;
    seasonal: boolean;
    sidebarRight: boolean;
    // Simple mode: only the basics (play, search, playlists, requests), no extras or effects
    simple: boolean;
    socialToasts: boolean;
    splash: boolean;
    stageScene: 'concert' | 'drive' | 'none' | 'rain' | 'snow' | 'stars';
    stageVinyl: boolean;
    startupSound: boolean;
    // the whole app's look: the v0.8 redesign, or Classic (how it looked up to v0.7)
    // liquid = the v0.10 look, new = v2 (v0.8-0.9), classic = v0.7
    ui: 'classic' | 'liquid' | 'new';
    // a heads-up with the next song a few seconds before this one ends
    upNext: boolean;
    visualizer: VisualizerStyle;
    // Mix your own: two v0.10 visualizers drawn on top of each other
    vizMix: [V10Style, V10Style];
}

export type VisualizerStyle =
    | 'bars'
    | 'glow'
    | 'halo'
    | 'lightning'
    | 'mix'
    | 'orbit'
    | 'pulp'
    | 'river'
    | 'soul'
    | V10Style;

export const DEFAULT_LOOK: SourLook = {
    albumAccent: false,
    animatedBackground: false,
    autoUpdate: true,
    autoVideo: false,
    barLayout: 'classic',
    barStyle: 'bars',
    barVisualizer: true,
    corners: 'normal',
    cursor: false,
    dailyTheme: false,
    density: 1,
    fadeCovers: true,
    glass: false,
    hiddenButtons: [],
    holidays: true,
    homeBackground: false,
    homeBackgroundDim: 45,
    hoverPreview: false,
    iconPack: 'classic',
    keepPlaying: true,
    lemonLoader: true,
    lyricScale: 1,
    lyricStyle: 'centered',
    pressFx: true,
    reducedMotion: false,
    seasonal: false,
    sidebarRight: false,
    simple: false,
    socialToasts: true,
    splash: true,
    stageScene: 'none',
    stageVinyl: false,
    startupSound: false,
    ui: 'liquid',
    upNext: false,
    visualizer: 'bars',
    vizMix: ['aurora', 'constellations'],
};

interface BlockedArtist {
    id: null | string;
    name: string;
}

// This computer's Sour Player state: the profile key (what lets it change the profile), blocked
// artists, private song notes, pinned sidebar items, saved groups and look settings.
interface SourStore {
    // 0.10.3 playback tools
    abLoop: null | { a: number; b: number; id: string };
    // songs heard while listening along (newest first)
    alongHistory: { at: number; friend: string; song: GroupSong }[];
    // when the friend you listen along with stops, follow someone else who is listening
    alongKeepGoing: boolean;
    // 0.10.4: the admins' announcement already seen, the lyrics wall, duets
    announcementSeen: number;
    block: (artist: BlockedArtist) => void;
    blocked: BlockedArtist[];
    bookmarks: Record<string, number[]>;
    // big updates already celebrated (the 0.10 confetti shows once)
    celebrated: string[];
    // 0.10.5
    closeFriends: string[];
    closeOnlyNudges: boolean;
    crossfade: Record<string, number>;
    duet: boolean;
    // focus mode (Ctrl+Shift+F): only the page and the player
    focusMode: boolean;
    greeted: string;
    // Group Play quiet mode: no soundboard or join sounds
    groupQuiet: boolean;
    // playlists hidden from this computer's sidebar (right-click a playlist > Hide)
    hiddenPlaylists?: { id: string; name: string }[];
    history: HistoryEntry[];
    holidayRestore: null | { holiday: string; theme: string };
    lastInbox: number;
    lastSocial: number;
    listenAlong: null | string;
    listenAlongName?: null | string;
    look: SourLook;
    me: Me | null;
    notes: Record<string, string>;
    outfits: { looks: Record<string, string | undefined>; name: string }[];
    pins: Pin[];
    // private session: nothing you play is counted or shown to friends
    privateSession: boolean;
    queueSnapshots: { at: number; ids: string[]; name: string }[];
    // quiet hours: no pop-ups from friends between these hours
    quietHours: { from: number; on: boolean; to: number };
    repeatNotified: Record<string, string>;
    savedGroups: SavedGroup[];
    savedLines: { artist: string; at: number; song: string; text: string }[];
    seenMilestones: string[];
    set: (changes: Partial<Omit<SourStore, 'block' | 'set' | 'setLook' | 'unblock'>>) => void;
    setLook: (changes: Partial<SourLook>) => void;
    setMe: (me: Me | null) => void;
    setupDone: boolean;
    songVolumes: Record<string, number>;
    unblock: (name: string) => void;
    volumeMemory: boolean;
}

// Simple mode is on (Settings > Sour Player)
export const useSimpleMode = () => useSourStore((state) => !!state.look.simple);

export const useSourStore = createWithEqualityFn<SourStore>()(
    persist(
        (set) => ({
            abLoop: null,
            alongHistory: [],
            alongKeepGoing: false,
            announcementSeen: 0,
            block: (artist) =>
                set((state) =>
                    state.blocked.some((b) => b.name.toLowerCase() === artist.name.toLowerCase())
                        ? state
                        : { blocked: [...state.blocked, artist] },
                ),
            blocked: [],
            bookmarks: {},
            celebrated: [],
            closeFriends: [],
            closeOnlyNudges: false,
            crossfade: {},
            duet: false,
            focusMode: false,
            greeted: '',
            groupQuiet: false,
            hiddenPlaylists: [],
            history: [],
            holidayRestore: null,
            lastInbox: 0,
            lastSocial: 0,
            listenAlong: null,
            listenAlongName: null,
            look: DEFAULT_LOOK,
            me: null,
            notes: {},
            outfits: [],
            pins: [],
            privateSession: false,
            queueSnapshots: [],
            quietHours: { from: 23, on: false, to: 8 },
            repeatNotified: {},
            savedGroups: [],
            savedLines: [],
            seenMilestones: [],
            set: (changes) => set(changes),
            setLook: (changes) => set((state) => ({ look: { ...state.look, ...changes } })),
            setMe: (me) => set({ me }),
            setupDone: false,
            songVolumes: {},
            unblock: (name) =>
                set((state) => ({
                    blocked: state.blocked.filter(
                        (b) => b.name.toLowerCase() !== name.toLowerCase(),
                    ),
                })),
            volumeMemory: false,
        }),
        {
            merge: (persisted, current) => {
                const saved = (persisted || {}) as Partial<SourStore>;
                const look = { ...current.look, ...(saved.look || {}) };
                // older versions could leave odd values behind; keep the look within range
                look.density = Math.min(1.25, Math.max(0.8, Number(look.density) || 1));
                if (!Array.isArray(look.hiddenButtons)) look.hiddenButtons = [];
                return {
                    ...current,
                    ...saved,
                    history: Array.isArray(saved.history) ? saved.history.slice(0, 300) : [],
                    look,
                };
            },
            name: 'sour-player',
        },
    ),
);

// true when any of the song's artists is blocked from Auto DJ
export const isBlockedSong = (song: Song) => {
    const { blocked } = useSourStore.getState();
    if (!blocked.length) return false;
    const names = new Set(blocked.map((b) => b.name.toLowerCase()));
    const ids = new Set(blocked.map((b) => b.id).filter(Boolean));
    const artists = [...(song.artists || []), ...(song.albumArtists || [])];
    return (
        names.has((song.artistName || '').toLowerCase()) ||
        artists.some((a) => (a.id && ids.has(a.id)) || names.has((a.name || '').toLowerCase()))
    );
};

// everyone with a Sour Player profile, refreshed every 15 seconds
export const useSourProfiles = () => {
    const url = useHermesUrl();
    return useQuery({
        enabled: !!url,
        queryFn: () => sourApi.list(url),
        queryKey: ['sour-profiles', url],
        refetchInterval: 15000,
        // many parts of the app read this; one fetch serves them all
        staleTime: 10000,
    });
};

// your own profile, with the private bits (picture history, resume point)
export const useMyProfile = () => {
    const url = useHermesUrl();
    const me = useSourStore((state) => state.me);
    return useQuery({
        enabled: !!url && !!me,
        queryFn: () => sourApi.me(url, me as Me),
        queryKey: ['sour-me', url, me?.id],
        refetchInterval: 60000,
        staleTime: 30000,
    });
};
