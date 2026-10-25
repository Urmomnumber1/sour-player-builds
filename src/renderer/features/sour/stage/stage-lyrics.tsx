import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

import styles from './sour-stage.module.css';

import { queryKeys } from '/@/renderer/api/query-keys';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { type LyricsQueryResult } from '/@/renderer/features/lyrics/api/lyrics-api';
import { openLyricSearchModal } from '/@/renderer/features/lyrics/components/lyrics-search-form';
import { myLanguage, useTranslateLyrics } from '/@/renderer/features/sour/stage/translate';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { Icon } from '/@/shared/components/icon/icon';
import { toast } from '/@/shared/components/toast/toast';
import { type LyricsOverride, type QueueSong } from '/@/shared/types/domain-types';
import { PlayerStatus } from '/@/shared/types/types';

export interface Line {
    cues?: { endMs: number; startMs: number; text: string }[];
    startMs: number;
    text: string;
}

// The song position, smooth: the player only reports it about twice a second, which made karaoke
// words light up in jumps. In between it's worked out from the clock (about 30 times a second).
export const useSmoothMs = (offsetMs: number) => {
    const [ms, setMs] = useState(
        () => useTimestampStoreBase.getState().timestamp * 1000 + offsetMs,
    );
    useEffect(() => {
        let raw = useTimestampStoreBase.getState().timestamp;
        let at = performance.now();
        let shown = raw;
        const unsubscribe = useTimestampStoreBase.subscribe((state) => {
            raw = state.timestamp;
            at = performance.now();
        });
        let frame = 0;
        let last = 0;
        const loop = (now: number) => {
            frame = requestAnimationFrame(loop);
            if (now - last < 33) return;
            last = now;
            const { speed, status } = usePlayerStoreBase.getState().player;
            const playing = status === PlayerStatus.PLAYING;
            let t = raw + (playing ? ((now - at) / 1000) * (speed > 0 ? speed : 1) : 0);
            // a report that lands a little behind the estimate shouldn't make words un-light
            if (t < shown && shown - t < 0.35) t = shown;
            shown = t;
            setMs(t * 1000 + offsetMs);
        };
        frame = requestAnimationFrame(loop);
        return () => {
            cancelAnimationFrame(frame);
            unsubscribe();
        };
    }, [offsetMs]);
    return ms;
};

// when each word is sung: the lyrics' own word timings, or the line's time shared out by letters
const timedWords = (line: Line, next?: Line) => {
    if (line.cues?.length) {
        return line.cues.map((c, i, all) => ({
            end: c.endMs > c.startMs ? c.endMs : (all[i + 1]?.startMs ?? c.startMs + 400),
            start: c.startMs,
            text: c.text,
        }));
    }
    const gap = (next ? next.startMs : line.startMs + 5000) - line.startMs;
    // people finish a line a little before the next one starts
    const length = Math.min(9000, Math.max(700, gap * 0.88));
    const tokens = line.text.split(/(\s+)/).filter((t) => t.length);
    // a word takes about as long as it has syllables (plus a breath), which tracks singing much
    // better than counting letters
    const weight = (t: string) =>
        t.trim() ? (t.toLowerCase().match(/[aeiouy]+/g)?.length || 1) + 0.6 : 0;
    const total = tokens.reduce((n, t) => n + weight(t), 0) || 1;
    let at = line.startMs;
    return tokens.map((text) => {
        const span = (weight(text) / total) * length;
        const word = { end: at + span, start: at, text };
        at += span;
        return word;
    });
};

// Karaoke: each word fills with colour as it's sung
export const KaraokeLine = ({
    line,
    next,
    offsetMs,
}: {
    line: Line;
    next?: Line;
    offsetMs: number;
}) => {
    const nowMs = useSmoothMs(offsetMs);
    const words = useMemo(() => timedWords(line, next), [line, next]);
    return (
        <>
            {words.map((w, i) => {
                const fill = Math.min(
                    1,
                    Math.max(0, (nowMs - w.start) / Math.max(1, w.end - w.start)),
                );
                return (
                    <span
                        className={styles.word}
                        key={`${i}-${w.start}`}
                        style={{ '--fill': `${Math.round(fill * 100)}%` } as CSSProperties}
                    >
                        {w.text}
                    </span>
                );
            })}
        </>
    );
};

const plainTitle = (name: string) =>
    name.replace(/\s*[([](instrumental|karaoke|off vocal)[^)\]]*[)\]]/i, '').trim();
// The volume the player had before karaoke turned it down (kept so a restart mid-song can't leave
// the app silent)
const SAVED_VOLUME = 'sour-karaoke-volume';
export const restoreKaraokeVolume = () => {
    try {
        const saved = localStorage.getItem(SAVED_VOLUME);
        if (saved === null) return;
        localStorage.removeItem(SAVED_VOLUME);
        usePlayerStoreBase.getState().setVolume(Number(saved) || 50);
    } catch {
        // no storage: nothing was saved either
    }
};

// Karaoke: the vocals fade out. The song's instrumental (Hermes Music's /karaoke keeps them in a
// hidden folder, they never show up as songs) plays from Hermes Music in step with the song while
// the song itself is turned all the way down; leaving karaoke fades the song back in.
const KaraokeBacking = ({ song }: { song: QueueSong }) => {
    const url = useHermesUrl();
    const me = useSourStore((state) => state.me);
    const title = plainTitle(song.name);
    const query = `artist=${encodeURIComponent(song.artistName || '')}&title=${encodeURIComponent(title)}`;
    const [asked, setAsked] = useState(false);
    const [on, setOn] = useState(false);
    // instrumentals often start a touch earlier or later than the album version: your nudge for
    // this song (seconds), remembered
    const nudgeKey = `sour-karaoke-nudge:${song.id}`;
    const [nudge, setNudge] = useState(() => {
        try {
            return Number(localStorage.getItem(nudgeKey)) || 0;
        } catch {
            return 0;
        }
    });
    const nudgeRef = useRef(nudge);
    const shift = (by: number) => {
        const next = Math.round((nudgeRef.current + by) * 100) / 100;
        nudgeRef.current = next;
        setNudge(next);
        try {
            localStorage.setItem(nudgeKey, String(next));
        } catch {
            // not remembered then
        }
    };
    const check = useQuery({
        enabled: !!url,
        queryFn: async () => {
            const res = await fetch(`${url}/api/karaoke?${query}`);
            if (!res.ok) return { available: false };
            return (await res.json()) as { available: boolean; gain?: number };
        },
        queryKey: ['sour-karaoke', url, query],
        // once asked for, keep looking until Hermes Music has it
        refetchInterval: (q) => (asked && !q.state.data?.available ? 15000 : false),
        retry: false,
    });
    const available = !!check.data?.available;
    // how much quieter (or louder) the instrumental has to play to match the song (Hermes Music
    // measures both)
    const gain = check.data?.gain && check.data.gain > 0 ? check.data.gain : 1;

    useEffect(() => {
        if (!available || !url) return undefined;
        const audio = new Audio(`${url}/api/karaoke/file?${query}`);
        audio.preload = 'auto';
        audio.volume = 0;
        const player = () => usePlayerStoreBase.getState();
        const original = player().player.volume;
        try {
            if (localStorage.getItem(SAVED_VOLUME) === null) {
                localStorage.setItem(SAVED_VOLUME, String(original));
            }
        } catch {
            // fine without the safety net
        }
        let level = 0; // 0 = the song, 1 = the instrumental
        let lastRaw = -1;
        let lastAt = 0;
        let stopped = false;
        const timer = window.setInterval(() => {
            const state = player().player;
            const playing = state.status === PlayerStatus.PLAYING;
            const rate = state.speed > 0 ? state.speed : 1;
            // the player reports its position about twice a second: work out where it is now
            const raw = useTimestampStoreBase.getState().timestamp;
            const clock = performance.now();
            if (raw !== lastRaw) {
                lastRaw = raw;
                lastAt = clock;
            }
            const at = raw + (playing ? ((clock - lastAt) / 1000) * rate : 0) + nudgeRef.current;
            const drift = audio.currentTime - at;
            if (audio.readyState >= 1 && at >= 0) {
                if (Math.abs(drift) > 0.25) {
                    audio.currentTime = at; // far off (a seek, or just started): jump
                    audio.playbackRate = rate;
                } else {
                    // a little off: catch up (or wait) by playing 3% faster or slower, no jump
                    audio.playbackRate = rate * (drift > 0.03 ? 0.97 : drift < -0.03 ? 1.03 : 1);
                }
            }
            if (playing && audio.paused) audio.play().catch(() => {});
            if (!playing && !audio.paused) audio.pause();
            // the crossfade (about a second), only once the instrumental can actually play
            const ready = audio.readyState >= 3;
            const target = stopped || !ready ? 0 : 1;
            if (level !== target) {
                level = Math.max(0, Math.min(1, level + (target > level ? 0.06 : -0.06)));
                audio.volume = Math.min(1, (original / 100) * level * gain);
                player().setVolume(Math.round(original * (1 - level)));
                setOn(level > 0.5);
            }
        }, 50);
        return () => {
            stopped = true;
            window.clearInterval(timer);
            audio.pause();
            audio.removeAttribute('src');
            // the song comes straight back
            player().setVolume(original);
            try {
                localStorage.removeItem(SAVED_VOLUME);
            } catch {
                // nothing saved
            }
        };
    }, [available, gain, query, url]);

    const ask = async () => {
        try {
            const res = await fetch(`${url}/api/requests`, {
                body: JSON.stringify({
                    profile: me?.id,
                    query: `${song.artistName} - ${title}`,
                    type: 'karaoke',
                }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || `Hermes Music returned ${res.status}`);
            setAsked(true);
            toast.success({
                message: `Hermes Music is getting the instrumental of ${title} - the vocals fade out as soon as it's here`,
            });
        } catch (error) {
            toast.error({ message: (error as Error).message });
        }
    };

    if (!url || !check.isFetched) return null;
    if (available) {
        return (
            <>
                <span
                    className={styles.offset}
                    title="The instrumental is playing instead of the song"
                >
                    <Icon icon="microphone" /> {on ? 'Vocals off' : 'Fading...'}
                </span>
                <button
                    className={styles.textTool}
                    onClick={() => shift(-0.05)}
                    title="Music ahead of the lyrics or the beat? Pull the instrumental back"
                    type="button"
                >
                    music -
                </button>
                <span className={styles.offset} title="Instrumental timing for this song">
                    {nudge > 0 ? '+' : ''}
                    {nudge.toFixed(2)}s
                </span>
                <button
                    className={styles.textTool}
                    onClick={() => shift(0.05)}
                    title="Music behind? Push the instrumental forward"
                    type="button"
                >
                    music +
                </button>
            </>
        );
    }
    return (
        <button
            className={styles.textTool}
            disabled={asked}
            onClick={ask}
            title="Ask Hermes Music for this song's instrumental, so karaoke can drop the vocals"
            type="button"
        >
            <Icon icon="download" />{' '}
            {asked ? 'Getting the instrumental...' : 'Get the instrumental'}
        </button>
    );
};

// lyrics timing and source (what used to be in the separate lyrics view)
// A lyrics timing fix per song, kept on Hermes Music for everyone (lyrics timed to another cut of the song,
// like Paparazzi's): added to the lyrics' own offset wherever Sour Player shows synced lyrics
const lyricOffsetKey = (url: string, song?: QueueSong) => [
    'lyric-offset',
    url,
    song?.artistName,
    song?.name,
];
export const useSharedLyricOffset = (song?: QueueSong) => {
    const url = useHermesUrl();
    return (
        useQuery({
            enabled: !!url && !!song?.name,
            queryFn: async () => {
                const q = new URLSearchParams({
                    artist: song?.artistName || '',
                    title: song?.name || '',
                });
                const res = await fetch(`${url}/api/lyrics/offset?${q}`);
                const json = res.ok ? await res.json() : { ms: 0 };
                return Number(json.ms) || 0;
            },
            queryKey: lyricOffsetKey(url, song),
            retry: false,
            staleTime: 5 * 60 * 1000,
        }).data ?? 0
    );
};

let offsetSave: ReturnType<typeof setTimeout> | undefined;

export const LyricsTools = ({
    karaoke,
    offsetMs,
    song,
}: {
    karaoke: boolean;
    offsetMs: number;
    song?: QueueSong;
}) => {
    const queryClient = useQueryClient();
    const url = useHermesUrl();
    const translateOn = useTranslateLyrics((s) => s.on);
    if (!song?._serverId || !song.id) return null;
    const key = queryKeys.songs.lyrics(song._serverId, { songId: song.id });
    // the nudge is saved on Hermes Music for everyone (one save per pause in clicking)
    const shift = (by: number) => {
        if (!url) {
            queryClient.setQueryData<LyricsQueryResult>(key, (prev) =>
                prev ? { ...prev, selectedOffsetMs: (prev.selectedOffsetMs ?? 0) + by } : prev,
            );
            return;
        }
        const k = lyricOffsetKey(url, song);
        const ms = (queryClient.getQueryData<number>(k) ?? 0) + by;
        queryClient.setQueryData<number>(k, ms);
        clearTimeout(offsetSave);
        offsetSave = setTimeout(() => {
            fetch(`${url}/api/lyrics/offset`, {
                body: JSON.stringify({ artist: song.artistName, ms, title: song.name }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })
                .then((res) => {
                    if (!res.ok) throw new Error();
                    toast.success({ message: 'Lyrics timing saved for everyone' });
                })
                .catch(() => toast.error({ message: "Couldn't save the lyrics timing" }));
        }, 900);
    };
    const find = () =>
        openLyricSearchModal({
            artist: song.artistName,
            name: song.name,
            onSearchOverride: (params: LyricsOverride) => {
                queryClient.setQueryData<LyricsQueryResult>(key, (prev) =>
                    prev ? { ...prev, overrideSelection: params } : prev,
                );
                queryClient.invalidateQueries({ queryKey: key });
            },
        });
    return (
        <div className={styles.lyricTools}>
            <button
                className={styles.textTool}
                onClick={() => useTranslateLyrics.getState().toggle()}
                title={`Show the lyrics in ${myLanguage()} under each line`}
                type="button"
            >
                {translateOn ? 'Original' : 'Translate'}
            </button>
            <button
                className={styles.textTool}
                onClick={() => shift(-500)}
                title="Lyrics too early? Show them later (saved for everyone)"
                type="button"
            >
                Early
            </button>
            <span className={styles.offset} title="Lyrics timing">
                {offsetMs > 0 ? '+' : ''}
                {(offsetMs / 1000).toFixed(2)}s
            </span>
            <button
                className={styles.textTool}
                onClick={() => shift(500)}
                title="Lyrics too late? Show them sooner (saved for everyone)"
                type="button"
            >
                Late
            </button>
            <button
                className={styles.textTool}
                onClick={find}
                title="Find other lyrics"
                type="button"
            >
                <Icon icon="search" /> Lyrics
            </button>
            {karaoke && <KaraokeBacking key={song.id} song={song} />}
        </div>
    );
};
