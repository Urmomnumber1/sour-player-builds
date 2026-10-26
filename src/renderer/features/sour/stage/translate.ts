import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';

import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';

// Lyrics translation (Sour Player 0.10): Hermes Music translates the song's lyrics line by line into
// your language (and keeps them, so each song is only translated once)
export const useTranslateLyrics = create<{
    mode: 'romanize' | 'translate';
    on: boolean;
    romanize: () => void;
    toggle: () => void;
}>()((set) => ({
    mode: 'translate',
    on: false,
    // romanize: the same words in Latin letters (for Japanese, Korean, Russian, Arabic...)
    romanize: () => set((s) => ({ mode: 'romanize', on: !(s.on && s.mode === 'romanize') })),
    toggle: () => set((s) => ({ mode: 'translate', on: !(s.on && s.mode === 'translate') })),
}));

export const myLanguage = () => {
    try {
        const code = (navigator.language || 'en').split('-')[0];
        return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || 'English';
    } catch {
        return 'English';
    }
};

export const useLineTranslations = (
    song: undefined | { artistName?: string; id?: string; name?: string },
    lines: { text: string }[],
) => {
    const url = useHermesUrl();
    const on = useTranslateLyrics((s) => s.on);
    const mode = useTranslateLyrics((s) => s.mode);
    const lang =
        mode === 'romanize'
            ? 'romanized: the same lyrics in Latin letters (transliteration, not translation)'
            : myLanguage();
    return useQuery({
        enabled: on && !!url && !!song?.id && lines.length > 0,
        queryFn: async () => {
            const res = await fetch(`${url}/api/lyrics/translate`, {
                body: JSON.stringify({
                    artist: song?.artistName,
                    lang,
                    lines: lines.map((l) => l.text),
                    title: song?.name,
                }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || `Hermes Music returned ${res.status}`);
            return json.lines as string[];
        },
        queryKey: ['lyric-translation', url, song?.id, lang, lines.length],
        retry: false,
        staleTime: Infinity,
    });
};

// Translate needs the Claude token on Hermes Music (the button hides without it)
export const useCanTranslate = () => {
    const url = useHermesUrl();
    return !!useQuery({
        enabled: !!url,
        queryFn: async () =>
            ((await (await fetch(`${url}/api/config`)).json()) as { hasToken?: boolean }).hasToken,
        queryKey: ['hermes-has-token', url],
        staleTime: 10 * 60000,
    }).data;
};

// lyrics written in another script (worth offering Romanize)
export const nonLatin = (lines: { text: string }[]) =>
    lines.some((l) =>
        /\p{Script=Cyrillic}|\p{Script=Arabic}|\p{Script=Hebrew}|\p{Script=Devanagari}|\p{Script=Thai}|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}/u.test(
            l.text,
        ),
    );
