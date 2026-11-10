import { useQuery } from '@tanstack/react-query';

import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { QueueSong, SynchronizedLyrics } from '/@/shared/types/domain-types';

// Word-by-word timing from Hermes Music 3.12+ (it asks NetEase Cloud Music, which times every word).
export type WordLine = {
    end: number;
    start: number;
    text: string;
    words: [number, number, string][];
};

export const useWordLyrics = (song: null | QueueSong | undefined) => {
    const url = useHermesUrl();
    return useQuery({
        enabled: !!url && !!song?.name && !!song?.artistName,
        gcTime: 30 * 60 * 1000,
        queryFn: async ({ signal }) => {
            const q = new URLSearchParams({
                artist: song?.artistName || '',
                seconds: String(Math.round((song?.duration || 0) / 1000)),
                title: song?.name || '',
            });
            const res = await fetch(`${url}/api/lyrics/words?${q}`, { signal });
            if (!res.ok) return null; // an older Hermes Music, or NetEase didn't answer
            const j = (await res.json()) as { found?: boolean; lines?: WordLine[] };
            return j.found && j.lines?.length ? j.lines : null;
        },
        queryKey: ['word-lyrics', url, song?.artistName, song?.name],
        retry: false,
        staleTime: Infinity,
    });
};

// compare lines by their letters and digits only ("I've been" = "ive been")
const key = (s: string) =>
    s
        .normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '');

export type WordCue = { endMs: number; startMs: number; text: string };

// The word timing for lines the app already shows: each line keeps its own start time and only borrows
// how its words are spread out, so lines never move. Lines whose words differ keep no word timing.
// null when too few lines match (other lyrics than the ones NetEase knows).
export const wordCuesFor = (
    lines: { startMs: number; text: string }[],
    words: null | undefined | WordLine[],
): (null | WordCue[])[] | null => {
    if (!words?.length || !lines.length) return null;
    const used = new Set<number>();
    let matched = 0;
    const out = lines.map((line, i) => {
        const k = key(line.text);
        if (!k) return null;
        let best = -1;
        let bestGap = 20000; // the same words within 20 seconds (choruses repeat)
        words.forEach((w, j) => {
            if (used.has(j) || key(w.text) !== k) return;
            const gap = Math.abs(w.start - line.startMs);
            if (gap < bestGap) {
                best = j;
                bestGap = gap;
            }
        });
        if (best < 0) return null;
        used.add(best);
        matched++;
        const w = words[best];
        const shift = line.startMs - w.start;
        const until = lines[i + 1]?.startMs ?? Infinity;
        return w.words.map(([s, e, text]) => ({
            endMs: Math.min(e + shift, until),
            startMs: Math.min(s + shift, until),
            text,
        }));
    });
    const worth = lines.filter((l) => key(l.text)).length;
    return matched >= Math.max(2, worth * 0.5) ? out : null;
};

// NetEase's lines as the lyrics when the song has no timed lyrics of its own
export const wordLinesAsLyrics = (words: WordLine[]): SynchronizedLyrics =>
    words.map((w, index) => ({
        cueLines: [
            {
                endMs: w.end,
                index,
                startMs: w.start,
                value: w.text,
                words: w.words.map(([startMs, endMs, text]) => ({ endMs, startMs, text })),
            },
        ],
        startMs: w.start,
        text: w.text,
    }));

// timed lyrics with word timing added where NetEase has the same line
export const withWordCues = (
    lyrics: SynchronizedLyrics,
    words: null | undefined | WordLine[],
): SynchronizedLyrics => {
    if (lyrics.some((l) => l.cueLines?.some((c) => c.words.length))) return lyrics; // already word-timed
    const cues = wordCuesFor(lyrics, words);
    if (!cues) return lyrics;
    return lyrics.map((line, i) => {
        const c = cues[i];
        if (!c?.length) return line;
        return {
            ...line,
            cueLines: [
                {
                    endMs: c[c.length - 1].endMs,
                    index: 0,
                    startMs: line.startMs,
                    value: line.text,
                    words: c,
                },
            ],
        };
    });
};
