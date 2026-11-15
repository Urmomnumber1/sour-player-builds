import { useQuery } from '@tanstack/react-query';

import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { queryClient } from '/@/renderer/lib/react-query';
import { type Song } from '/@/shared/types/domain-types';

// Sour Player 0.15: no karaoke for some songs (nobody sings in them). Anyone can switch it off (or back on) for a
// song; it's kept on Hermes Music for everyone. Karaoke also stays off by itself for songs without lyrics.

export const plainTitle = (name: string) =>
    name.replace(/\s*[([](instrumental|karaoke|off vocal)[^)\]]*[)\]]/i, '').trim();

export const karaokeQuery = (song: Pick<Song, 'artistName' | 'name'>) =>
    `artist=${encodeURIComponent(song.artistName || '')}&title=${encodeURIComponent(plainTitle(song.name))}`;

// the song's karaoke: is there an instrumental, how loud, and is karaoke off for it
export const useKaraokeInfo = (song?: null | Pick<Song, 'artistName' | 'name'>, enabled = true) => {
    const url = useHermesUrl();
    const query = song ? karaokeQuery(song) : '';
    return useQuery({
        enabled: !!url && !!song && enabled,
        queryFn: async () => {
            const res = await fetch(`${url}/api/karaoke?${query}`);
            if (!res.ok) return { available: false, off: false };
            return (await res.json()) as { available: boolean; gain?: number; off?: boolean };
        },
        queryKey: ['sour-karaoke', url, query],
        retry: false,
    });
};

export const setKaraokeOff = async (
    url: string,
    song: Pick<Song, 'artistName' | 'name'>,
    off: boolean,
) => {
    const me = useSourStore.getState().me;
    const res = await fetch(`${url}/api/karaoke/off`, {
        body: JSON.stringify({
            artist: song.artistName || '',
            key: me?.key,
            off,
            profile: me?.id,
            title: plainTitle(song.name),
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Hermes Music returned ${res.status}`);
    await queryClient.invalidateQueries({ queryKey: ['sour-karaoke', url, karaokeQuery(song)] });
};
