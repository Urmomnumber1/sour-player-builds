import { type GroupSong } from '/@/renderer/features/group-play/store/group-play.store';
import { type Me } from '/@/renderer/features/sour/api/sour-api';

export interface Activity {
    at: number;
    by: null | string;
    byName: null | string;
    id: string;
    song: GroupSong | null;
    text: string;
    type: string;
}

export interface Ask {
    at: number;
    from: string;
    fromName: string;
    id: string;
    song: GroupSong;
    status: 'declined' | 'played' | 'waiting';
    to: string;
    toName?: string;
}

export interface Capsule {
    at: number;
    fromName: string;
    id: string;
    locked: boolean;
    note?: string;
    song?: GroupSong;
    to: string;
    toName: string;
    unlockAt: number;
}

export interface DailyColor {
    choices: string[];
    myVote: null | string;
    today: string;
    votes: Record<string, number>;
}

export interface Duel {
    a: { by: string; byName: string; song: GroupSong };
    b: null | { by: string; byName: string; song: GroupSong };
    created: number;
    ends: null | number;
    id: string;
    myVote: 'a' | 'b' | null;
    opponent: null | string;
    opponentName: null | string;
    votes: { a: number; b: number };
    winner: 'a' | 'b' | null;
}

export interface DuoStats {
    shared: (GroupSong & { plays: number })[];
    streak: number;
    togetherHours: number;
}

export interface EraMonth {
    month: string;
    songs: (GroupSong & { plays: number })[];
}

export interface Gift {
    at: number;
    from: string;
    fromName: string;
    id: string;
    note: string;
    opened: null | number;
    song: GroupSong;
    to: string;
    toName?: string;
}

export interface HallEntry {
    against: string;
    at: number;
    by: string;
    byName: string;
    song: GroupSong;
    votes: number;
}

export interface HotSeat {
    answer: null | string;
    day: string;
    guessed: null | string;
    guesses: number;
    options: GroupSong[];
    profile: { avatar: number; id: string; name: string };
    results: null | { name: string; right: boolean }[];
}

export interface RequestLeader {
    name: string;
    profile: null | string;
    requests: number;
    songs: number;
}

export interface SongNote {
    at: number;
    from: string;
    fromName: string;
    id: string;
    position?: number;
    text: string;
}

export interface WrappedNight {
    at?: number;
    by?: string;
    byName?: string;
}

const request = async <T>(url: string, body?: unknown): Promise<T> => {
    const res = await fetch(
        url,
        body === undefined
            ? undefined
            : {
                  body: JSON.stringify(body),
                  headers: { 'content-type': 'application/json' },
                  method: 'POST',
              },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || `Hermes Music returned ${res.status}`);
    if (json === null || typeof json !== 'object')
        throw new Error("That address doesn't answer like Hermes Music");
    return json as T;
};

const list = async <T>(url: string): Promise<T[]> => {
    const value = await request<T[]>(url);
    return Array.isArray(value) ? value : [];
};

const who = (me: Me) => ({ key: me.key, profile: me.id });

// Sour Player's social extras on Hermes Music 3.1+
export const socialApi = {
    activity: (base: string) => list<Activity>(`${base}/api/activity`),
    answerAsk: (base: string, me: Me, id: string, accept: boolean) =>
        request<{ ok: boolean }>(`${base}/api/asks/${id}`, { ...who(me), accept }),
    answerDuel: (base: string, me: Me, id: string, song: GroupSong) =>
        request<Duel>(`${base}/api/duels/${id}/accept`, { ...who(me), song }),
    ask: (base: string, me: Me, to: string, song: GroupSong) =>
        request<{ ok: boolean }>(`${base}/api/asks`, { ...who(me), song, to }),
    asks: (base: string, me: Me) =>
        request<{ received: Ask[]; sent: Ask[] }>(`${base}/api/asks/mine`, who(me)),
    capsule: (
        base: string,
        me: Me,
        body: { note: string; song: GroupSong; to: string; unlockAt: number },
    ) => request<{ ok: boolean }>(`${base}/api/capsules`, { ...who(me), ...body }),
    capsules: (base: string, me: Me) => request<Capsule[]>(`${base}/api/capsules/mine`, who(me)),
    dailyColor: (base: string, me: Me | null) =>
        request<DailyColor>(`${base}/api/daily-color?profile=${encodeURIComponent(me?.id ?? '')}`),
    duels: (base: string, me: Me | null) =>
        list<Duel>(`${base}/api/duels?profile=${encodeURIComponent(me?.id ?? '')}`),
    duo: (base: string, a: string, b: string) => request<DuoStats>(`${base}/api/duo/${a}/${b}`),
    era: (base: string, id: string) => list<EraMonth>(`${base}/api/profiles/${id}/era`),
    gift: (base: string, me: Me, to: string, song: GroupSong, note: string) =>
        request<{ ok: boolean }>(`${base}/api/gifts`, { ...who(me), note, song, to }),
    gifts: (base: string, me: Me) =>
        request<{ received: Gift[]; sent: Gift[] }>(`${base}/api/gifts/mine`, who(me)),
    guessHotSeat: (base: string, me: Me, songId: string) =>
        request<{ answer: string; right: boolean }>(`${base}/api/hotseat/guess`, {
            ...who(me),
            songId,
        }),
    hall: (base: string) => list<HallEntry>(`${base}/api/hall`),
    heatmap: (base: string, id: string) =>
        request<Record<string, number>>(`${base}/api/profiles/${id}/heatmap`),
    hotSeat: async (base: string, me: Me | null) => {
        const res = await fetch(`${base}/api/hotseat?profile=${encodeURIComponent(me?.id ?? '')}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Hermes Music returned ${res.status}`);
        return (await res.json()) as HotSeat;
    },
    note: (
        base: string,
        me: Me,
        songId: string,
        change: { position?: number; remove?: string; text?: string },
    ) =>
        request<SongNote[]>(`${base}/api/song-notes/${encodeURIComponent(songId)}`, {
            ...who(me),
            ...change,
        }),
    notes: (base: string, songId: string) =>
        list<SongNote>(`${base}/api/song-notes/${encodeURIComponent(songId)}`),
    openGift: (base: string, me: Me, id: string) =>
        request<Gift>(`${base}/api/gifts/${id}/open`, who(me)),
    repeat: (base: string, me: Me, song: GroupSong, count: number) =>
        request<{ ok: boolean }>(`${base}/api/activity`, {
            ...who(me),
            count,
            song,
            type: 'repeat',
        }),
    requestLeaders: (base: string) => list<RequestLeader>(`${base}/api/requests/leaderboard`),
    sourness: (base: string, songId: string) =>
        request<{ plays: number; score: null | number; skips: number }>(
            `${base}/api/sourness/${encodeURIComponent(songId)}`,
        ),
    startDuel: (base: string, me: Me, song: GroupSong, opponent: null | string) =>
        request<Duel>(`${base}/api/duels`, { ...who(me), opponent, song }),
    visit: (base: string, me: Me, profileId: string) =>
        request<{ ok: boolean }>(`${base}/api/profiles/${profileId}/visit`, {
            from: me.id,
            key: me.key,
        }),
    voteColor: (base: string, me: Me, color: string) =>
        request<{ ok: boolean }>(`${base}/api/daily-color`, { ...who(me), color }),
    voteDuel: (base: string, me: Me, id: string, side: 'a' | 'b') =>
        request<Duel>(`${base}/api/duels/${id}/vote`, { ...who(me), side }),
    wrapped: (base: string) => request<WrappedNight>(`${base}/api/wrapped-night`),
    wrappedNight: (base: string, me: Me, at: null | number) =>
        request<WrappedNight>(
            `${base}/api/wrapped-night`,
            at === null ? { ...who(me), cancel: true } : { ...who(me), at },
        ),
};
