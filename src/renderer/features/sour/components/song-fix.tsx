import { closeAllModals, openModal } from '@mantine/modals';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import styles from './song-fix.module.css';

import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { useMyProfile, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { Button } from '/@/shared/components/button/button';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { type Song } from '/@/shared/types/domain-types';

// Sour Player 0.10.6, with Hermes Music 3.10.6:
//  - "Not the right song": the song plays the music video's audio (an intro, a skit, another mix), so pick the
//    right upload and Hermes Music swaps the audio in, keeping the song's name, cover and tags.
//  - "Remove from library" (admins): the song goes to Hermes Music's archive (Library tools can bring it back).

interface Alternative {
    channel: string;
    id: string;
    kind: string;
    seconds: number;
    title: string;
}

const hermesPost = async <T,>(url: string, body: unknown): Promise<T> => {
    const res = await fetch(url, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || `Hermes Music returned ${res.status}`);
    return json as T;
};

const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const songArtist = (song: Song) => song.artistName || song.albumArtistName || '';

const WrongSongSheet = ({ song }: { song: Song }) => {
    const url = useHermesUrl();
    const myName = useMyProfile().data?.name ?? null;
    const [busy, setBusy] = useState<null | string>(null);
    const seconds = Math.round((song.duration || 0) / 1000);
    const list = useQuery({
        enabled: !!url,
        queryFn: async () => {
            const q = new URLSearchParams({
                artist: songArtist(song),
                seconds: String(seconds),
                title: song.name,
            });
            const res = await fetch(`${url}/api/library/alternatives?${q}`);
            const json = await res.json().catch(() => null);
            if (!res.ok) throw new Error(json?.error || 'Hermes Music could not search YouTube');
            return json as Alternative[];
        },
        queryKey: ['sour-alternatives', url, song.id],
        retry: false,
        staleTime: 5 * 60_000,
    });

    const use = async (alt: Alternative) => {
        if (!url || busy) return;
        setBusy(alt.id);
        try {
            await hermesPost(`${url}/api/library/replace`, {
                artist: songArtist(song),
                by: myName,
                file: song.path,
                title: song.name,
                videoId: alt.id,
            });
            closeAllModals();
            toast.success({
                message: `Swapped the audio of ${song.name}. The library notices in a minute or so.`,
                title: 'Fixed',
            });
        } catch (e) {
            toast.error({ message: (e as Error).message, title: "Couldn't swap it" });
        } finally {
            setBusy(null);
        }
    };

    if (!url)
        return <Text isMuted>{"Hermes Music isn't set up, so there's nothing to swap with."}</Text>;
    return (
        <Stack gap="sm">
            <Text isMuted size="sm">
                Pick the right version of {song.name} ({time(seconds)}). Hermes Music downloads it
                and swaps the audio in; the name, cover, plays and favourites stay.
            </Text>
            {list.isLoading && <Text isMuted>Looking on YouTube...</Text>}
            {list.error && <Text c="red">{(list.error as Error).message}</Text>}
            {list.data?.length === 0 && <Text isMuted>Nothing else found on YouTube.</Text>}
            {list.data?.map((alt) => (
                <div className={styles.row} key={alt.id}>
                    <img
                        alt=""
                        className={styles.thumb}
                        loading="lazy"
                        src={`https://i.ytimg.com/vi/${alt.id}/mqdefault.jpg`}
                    />
                    <div className={styles.text}>
                        <span className={styles.title}>{alt.title}</span>
                        <span className={styles.sub}>
                            {alt.channel} - {time(alt.seconds)}
                            {alt.kind ? ` - ${alt.kind}` : ''}
                            {seconds && Math.abs(alt.seconds - seconds) <= 3
                                ? ' - same length'
                                : ''}
                        </span>
                    </div>
                    <Group gap={6} wrap="nowrap">
                        <Button
                            component="a"
                            href={`https://www.youtube.com/watch?v=${alt.id}`}
                            rel="noreferrer"
                            size="compact-sm"
                            target="_blank"
                            variant="subtle"
                        >
                            Listen
                        </Button>
                        <Button
                            disabled={!!busy && busy !== alt.id}
                            loading={busy === alt.id}
                            onClick={() => use(alt)}
                            size="compact-sm"
                            variant="filled"
                        >
                            Use this
                        </Button>
                    </Group>
                </div>
            ))}
        </Stack>
    );
};

export const openWrongSong = (song: Song) =>
    openModal({
        children: <WrongSongSheet song={song} />,
        size: 'lg',
        title: 'Not the right song?',
    });

export const WrongSongAction = ({ songs }: { songs: Song[] }) => {
    const url = useHermesUrl();
    if (!url || songs.length !== 1) return null;
    return (
        <ContextMenu.Item leftIcon="refresh" onSelect={() => openWrongSong(songs[0])}>
            Not the right song
        </ContextMenu.Item>
    );
};

export const RemoveSongAction = ({ songs }: { songs: Song[] }) => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const mine = useMyProfile().data;
    if (!url || !me || !mine?.admin || !songs.length || songs.length > 20) return null;
    const remove = async () => {
        let done = 0;
        const failed: string[] = [];
        for (const song of songs) {
            try {
                await hermesPost(`${url}/api/library/remove`, {
                    artist: songArtist(song),
                    file: song.path,
                    key: me.key,
                    profile: me.id,
                    title: song.name,
                });
                done++;
            } catch (e) {
                failed.push(`${song.name}: ${(e as Error).message}`);
            }
        }
        closeAllModals();
        if (done)
            toast.success({
                message: `Removed ${done === 1 ? songs[0].name : `${done} songs`}. Library tools > Archive can put ${done === 1 ? 'it' : 'them'} back.`,
            });
        if (failed.length)
            toast.error({ message: failed.join('\n'), title: "Some weren't removed" });
    };
    const onSelect = () =>
        openModal({
            children: (
                <Stack gap="md">
                    <Text>
                        {songs.length === 1
                            ? `Take ${songs[0].name} out of the library?`
                            : `Take these ${songs.length} songs out of the library?`}{' '}
                        Nobody can play {songs.length === 1 ? 'it' : 'them'} any more. Hermes Music
                        keeps the file{songs.length === 1 ? '' : 's'} in its archive, so Library
                        tools &gt; Archive can bring {songs.length === 1 ? 'it' : 'them'} back.
                    </Text>
                    <Group justify="flex-end">
                        <Button onClick={() => closeAllModals()} variant="default">
                            Cancel
                        </Button>
                        <Button color="red" onClick={remove} variant="filled">
                            Remove
                        </Button>
                    </Group>
                </Stack>
            ),
            title: 'Remove from the library',
        });
    return (
        <ContextMenu.Item leftIcon="delete" onSelect={onSelect}>
            Remove from library (admin)
        </ContextMenu.Item>
    );
};
