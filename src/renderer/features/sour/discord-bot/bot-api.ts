import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { useMyProfile, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { toast } from '/@/shared/components/toast/toast';

// The Discord bot (Sour Player 0.10.10, Hermes Music 3.11): Hermes Music runs it and keeps its own songs,
// playlists, ambience and sound effects (apart from the music library). Admins, and the people they allow
// in Hermes Music > Config, run it from the Discord Bot tab.

export interface BotChannel {
    canJoin: boolean;
    id: string;
    members: BotMember[];
    name: string;
}

export interface BotGuild {
    channels: BotChannel[];
    id: string;
    name: string;
}

export interface BotItem {
    added: number;
    album: string;
    artist: string;
    by: string;
    duration: number;
    id: string;
    kind: BotKind;
    note: string;
    status: 'downloading' | 'failed' | 'ready';
    title: string;
}

export type BotKind = 'ambience' | 'music' | 'sfx';

export interface BotLibrary {
    items: BotItem[];
    playlists: BotPlaylist[];
}

export interface BotMember {
    avatar: string;
    bot?: boolean;
    id: string;
    name: string;
}

export interface BotPlaylist {
    by: string;
    id: string;
    items: string[];
    name: string;
}

// a song from the music library, the way Hermes Music finds its file
export interface BotSourceSong {
    album: string;
    artist: string;
    duration: number;
    path: string;
    title: string;
}

export interface BotState {
    ambience: (BotTrack & { volume: number })[];
    configured: boolean;
    error: string;
    fake: boolean;
    guilds: BotGuild[];
    installing: boolean;
    invite: string;
    music: {
        current: BotTrack | null;
        index: number;
        loop: 'all' | 'off' | 'one';
        paused: boolean;
        position: number;
        queue: BotTrack[];
        shuffle: boolean;
    };
    name: string;
    online: boolean;
    servers: number;
    sfx: BotTrack[];
    voice: null | {
        channelId: string;
        channelName: string;
        guildId: string;
        guildName: string;
        members: BotMember[];
        status: string;
    };
    volumes: { ambience: number; master: number; music: number; sfx: number };
}

export interface BotTrack {
    artist: string;
    duration: number;
    id: string;
    title: string;
}

export const KIND_LABEL: Record<BotKind, string> = {
    ambience: 'Ambience',
    music: 'Music',
    sfx: 'Sound effects',
};

export const time = (s: number) => {
    const t = Math.max(0, Math.round(s || 0));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = String(t % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

// may this person use the bot? (Hermes Music says so in their own profile)
export const useBotAccess = () => {
    const base = useHermesUrl();
    const mine = useMyProfile().data;
    return !!base && !!mine?.discordBot;
};

const call = async <T>(base: string, path: string, body: Record<string, unknown>): Promise<T> => {
    const res = await fetch(`${base}/api/discord-bot/${path}`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || `Hermes Music returned ${res.status}`);
    return json as T;
};

const fail = (e: unknown) => {
    toast.error({ message: (e as Error).message });
    throw e;
};

export const useBot = (live = true) => {
    const base = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const qc = useQueryClient();
    const ready = !!base && !!me;
    const auth = me ? { key: me.key, profile: me.id } : {};
    const stateKey = ['discord-bot', 'state', base];
    const libraryKey = ['discord-bot', 'library', base];

    const state = useQuery({
        enabled: ready && live,
        queryFn: () => call<BotState>(base as string, 'state', auth),
        queryKey: stateKey,
        refetchInterval: 1500,
        retry: false,
    });
    const library = useQuery({
        enabled: ready && live,
        queryFn: () => call<BotLibrary>(base as string, 'library', auth),
        queryKey: libraryKey,
        refetchInterval: (q) =>
            q.state.data?.items.some((i) => i.status === 'downloading') ? 3000 : 30000,
        retry: false,
    });

    // the bot does something: the answer is its new state
    const act = useCallback(
        async (action: string, args: Record<string, unknown> = {}) => {
            if (!ready) return;
            try {
                const s = await call<BotState>(base as string, 'do', { ...auth, action, ...args });
                qc.setQueryData(stateKey, s);
                return s;
            } catch (e) {
                return fail(e);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [base, me?.id, me?.key, ready],
    );

    // the bot's library changes: the answer is the whole library
    const lib = useCallback(
        async (path: string, body: Record<string, unknown>) => {
            if (!ready) return;
            try {
                const l = await call<BotLibrary & { added?: number; playlist?: string }>(
                    base as string,
                    path,
                    { ...auth, ...body },
                );
                if (Array.isArray(l.items)) qc.setQueryData(libraryKey, l);
                else qc.invalidateQueries({ queryKey: libraryKey });
                return l;
            } catch (e) {
                return fail(e);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [base, me?.id, me?.key, ready],
    );

    // a sound file from this computer or phone
    const upload = useCallback(
        async (file: File, kind: BotKind) => {
            if (!ready || !me) return;
            const res = await fetch(`${base}/api/discord-bot/upload?kind=${kind}`, {
                body: file,
                headers: {
                    'x-file-name': encodeURIComponent(file.name),
                    'x-sour-key': me.key,
                    'x-sour-profile': me.id,
                },
                method: 'POST',
            });
            const json = await res.json().catch(() => null);
            if (!res.ok) throw new Error(json?.error || `Hermes Music returned ${res.status}`);
            qc.invalidateQueries({ queryKey: libraryKey });
            return json as BotItem;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [base, me?.id, me?.key, ready],
    );

    return {
        act,
        error: state.error as Error | null,
        lib,
        library: library.data,
        state: state.data,
        upload,
    };
};
