import { useEffect, useRef, useState } from 'react';

import { api } from '/@/renderer/api';
import { isBlockedSong, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { getServerById, useAuthStore } from '/@/renderer/store';
import { addToQueueByData, usePlayerStoreBase } from '/@/renderer/store/player.store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { Group } from '/@/shared/components/group/group';
import { Popover } from '/@/shared/components/popover/popover';
import { Select } from '/@/shared/components/select/select';
import { Stack } from '/@/shared/components/stack/stack';
import { Switch } from '/@/shared/components/switch/switch';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { Played, type QueueSong, type Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

// Sour Player 0.10.3: playback tools (A/B loop, bookmarks, queue snapshots and timer, per-song
// volume), "play after this album" and more one-click mixes.

const serverId = () => useAuthStore.getState().currentServer?.id || '';
const player = () => usePlayerStoreBase.getState();
const nowSong = () => player().getQueue().items[player().player.index];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const random = async (limit: number, query: Record<string, unknown> = {}) => {
    const id = serverId();
    if (!id || !getServerById(id)) return [] as Song[];
    const res = await api.controller
        .getRandomSongList({
            apiClientProps: { serverId: id },
            query: { limit, played: Played.All, ...query },
        })
        .catch(() => null);
    return ((res?.items ?? []) as Song[]).filter((s) => !isBlockedSong(s));
};
const play = async (name: string, songs: Song[]) => {
    if (!songs.length) return toast.info({ message: `Nothing for ${name} yet` });
    await addToQueueByData(Play.NOW, songs);
    toast.success({ message: `${name}: ${songs.length} songs` });
    return undefined;
};
const shuffle = <T,>(list: T[]) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

// ---------- more mixes ----------
export const moreMixes = {
    // "I'm bored": something unlike the last songs (other genres, other artists)
    bored: async () => {
        const recent = player()
            .getQueue()
            .items.slice(Math.max(0, player().player.index - 15), player().player.index + 1);
        const genres = new Set(
            recent.flatMap((s) => s.genres?.map((g) => g.name.toLowerCase()) ?? []),
        );
        const artists = new Set(recent.map((s) => s.artistName));
        const songs = (await random(300)).filter(
            (s) =>
                !artists.has(s.artistName) &&
                !(s.genres ?? []).some((g) => genres.has(g.name.toLowerCase())),
        );
        return play('Something different', songs.slice(0, 40));
    },
    // a trip through the decades, a few songs each
    decades: async () => {
        const all = [1960, 1970, 1980, 1990, 2000, 2010, 2020];
        const out: Song[] = [];
        for (const d of shuffle(all).slice(0, 5).sort())
            out.push(...(await random(6, { maxYear: d + 9, minYear: d })));
        return play('Decade hop', out);
    },
    // never played songs by artists you do play: the deep cuts
    deepCuts: async () => {
        const known = new Set(
            [
                ...useSourStore.getState().history.map((h) => h.song.artist),
                ...player()
                    .getQueue()
                    .items.map((s) => s.artistName),
            ]
                .filter(Boolean)
                .map((a) => a.toLowerCase()),
        );
        const songs = (await random(500, { played: Played.Never })).filter((s) =>
            known.has((s.artistName || '').toLowerCase()),
        );
        return play('Deep cuts', songs.slice(0, 50));
    },
    // ten truly random songs from the whole library
    dive: async () => play('Random dive', await random(10)),
    // songs you loved but haven't played in months
    forgotten: async () => {
        const cutoff = Date.now() - 90 * 86400000;
        const songs = (await random(400, { played: Played.Played })).filter(
            (s) =>
                s.userFavorite && (!s.lastPlayedAt || new Date(s.lastPlayedAt).getTime() < cutoff),
        );
        return play('Forgotten favourites', songs.slice(0, 50));
    },
    // a journey from one genre into another
    journey: async () => {
        const g = nowSong()?.genres?.[0]?.name;
        const pool = await random(300);
        const genres = shuffle([
            ...new Set(pool.flatMap((s) => s.genres?.map((x) => x.name) ?? [])),
        ]);
        const from = g || genres[0];
        const to = genres.find((x) => x !== from);
        if (!from || !to)
            return toast.info({ message: 'Not enough genres in the library for a journey' });
        const a = pool.filter((s) => s.genres?.some((x) => x.name === from)).slice(0, 12);
        const b = pool.filter((s) => s.genres?.some((x) => x.name === to)).slice(0, 12);
        // A A A B A B B A B B B: slowly more of the second genre
        const out: Song[] = [];
        for (let i = 0; i < a.length + b.length; i++) {
            const useB = Math.random() < i / (a.length + b.length);
            const next = (useB ? b : a).shift() ?? (useB ? a : b).shift();
            if (next) out.push(next);
        }
        return play(`${from} to ${to}`, out);
    },
    // songs from the same year as the one playing
    sameYear: async () => {
        const year = nowSong()?.releaseYear;
        if (!year) return toast.info({ message: 'Play something with a year first' });
        return play(`${year}`, await random(50, { maxYear: year, minYear: year }));
    },
    // shuffle what's coming up, favourites and well-rated songs more often near the top
    weighted: () => {
        const items = player().getQueue().items;
        const upcoming = items.slice(player().player.index + 1);
        if (upcoming.length < 3) return toast.info({ message: 'Not enough songs coming up' });
        const weight = (s: QueueSong) =>
            (1 +
                (s.userFavorite ? 2 : 0) +
                (s.userRating || 0) * 0.5 +
                Math.log1p(s.playCount || 0)) *
            Math.random();
        player().moveSelectedToBottom([...upcoming].sort((x, y) => weight(y) - weight(x)));
        return toast.success({ message: 'Shuffled - favourites come up more' });
    },
};

// ---------- "play after this album" (song right-click) ----------
export const PlayAfterAlbumAction = ({ songs }: { songs: Song[] }) => {
    if (!songs.length) return null;
    const onSelect = async () => {
        const items = player().getQueue().items;
        const idx = player().player.index;
        const album = items[idx]?.albumId;
        let last = idx;
        while (album && items[last + 1]?.albumId === album) last++;
        await addToQueueByData(Play.LAST, songs);
        const after = player().getQueue().items;
        const added = after.slice(after.length - songs.length);
        const anchor = items[last];
        if (anchor) player().moveSelectedTo(added, anchor._uniqueId, 'bottom');
        toast.info({ message: album ? 'Plays after this album' : 'Plays next' });
    };
    return (
        <ContextMenu.Item leftIcon="mediaPlayNext" onSelect={onSelect}>
            Play after this album
        </ContextMenu.Item>
    );
};

// ---------- background: A/B loop and per-song volume ----------
export const PlaybackWatcher = () => {
    useEffect(() => {
        let lastSong = '';
        let lastVol = -1;
        const timer = setInterval(() => {
            const { abLoop, songVolumes, volumeMemory } = useSourStore.getState();
            const p = player();
            const song = nowSong();
            const ts = useTimestampStoreBase.getState().timestamp;
            if (abLoop && song && abLoop.id === song.id && abLoop.b > abLoop.a && ts >= abLoop.b) {
                p.mediaSeekToTimestamp(abLoop.a);
            }
            if (!volumeMemory || !song) return;
            if (song.id !== lastSong) {
                lastSong = song.id;
                const v = songVolumes?.[song.id];
                if (typeof v === 'number') p.setVolume(v);
                lastVol = p.player.volume;
            } else if (p.player.volume !== lastVol) {
                lastVol = p.player.volume;
                useSourStore
                    .getState()
                    .set({ songVolumes: { ...(songVolumes ?? {}), [song.id]: lastVol } });
            }
        }, 250);
        return () => clearInterval(timer);
    }, []);
    return null;
};

// ---------- the playback tools popover (player bar) ----------
export const PlaybackTools = () => {
    const [open, setOpen] = useState(false);
    return (
        <Popover onChange={setOpen} opened={open} position="top" width={330}>
            <Popover.Target>
                <ActionIcon
                    icon="mediaSettings"
                    iconProps={{ size: 'lg' }}
                    onClick={() => setOpen((o) => !o)}
                    size="sm"
                    tooltip={{ label: 'Playback tools', openDelay: 0 }}
                    variant="subtle"
                />
            </Popover.Target>
            <Popover.Dropdown>{open && <ToolsBody />}</Popover.Dropdown>
        </Popover>
    );
};

const ToolsBody = () => {
    const store = useSourStore();
    const song = nowSong();
    const ts = useTimestampStoreBase((s) => s.timestamp);
    const items = player().getQueue().items;
    const idx = player().player.index;
    const left =
        items.slice(idx + 1).reduce((n, s) => n + (s.duration || 0) / 1000, 0) +
        Math.max(0, (song?.duration || 0) / 1000 - ts);
    const [openedAt] = useState(() => Date.now());
    const ends = new Date(openedAt + left * 1000);
    const loop = store.abLoop && song && store.abLoop.id === song.id ? store.abLoop : null;
    const marks = (song && store.bookmarks?.[song.id]) || [];
    const artists = [...new Set(items.slice(idx + 1).map((s) => s.artistName))].filter(Boolean);
    const [artist, setArtist] = useState<null | string>(null);
    const snapName = useRef(0);
    return (
        <Stack gap="sm">
            <Text size="sm">
                Queue ends at{' '}
                <b>{ends.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b> (
                {items.length - idx - 1} songs left)
            </Text>
            <Stack gap={4}>
                <Text fw={700} size="xs">
                    A/B loop{' '}
                    {loop ? `(${fmt(loop.a)} - ${loop.b > loop.a ? fmt(loop.b) : '...'})` : ''}
                </Text>
                <Group gap={4}>
                    <Button
                        disabled={!song}
                        onClick={() => song && store.set({ abLoop: { a: ts, b: 0, id: song.id } })}
                        size="compact-xs"
                        variant="default"
                    >
                        Set A
                    </Button>
                    <Button
                        disabled={!loop}
                        onClick={() => loop && store.set({ abLoop: { ...loop, b: ts } })}
                        size="compact-xs"
                        variant="default"
                    >
                        Set B
                    </Button>
                    <Button
                        disabled={!loop}
                        onClick={() => store.set({ abLoop: null })}
                        size="compact-xs"
                        variant="subtle"
                    >
                        Stop looping
                    </Button>
                </Group>
            </Stack>
            <Stack gap={4}>
                <Text fw={700} size="xs">
                    Bookmarks in this song
                </Text>
                <Group gap={4}>
                    {marks.map((m) => (
                        <Button
                            key={m}
                            onClick={() => player().mediaSeekToTimestamp(m)}
                            size="compact-xs"
                            variant="light"
                        >
                            {fmt(m)}
                        </Button>
                    ))}
                    <Button
                        disabled={!song}
                        onClick={() =>
                            song &&
                            store.set({
                                bookmarks: {
                                    ...(store.bookmarks ?? {}),
                                    [song.id]: [...marks, Math.floor(ts)]
                                        .sort((a, b) => a - b)
                                        .slice(-12),
                                },
                            })
                        }
                        size="compact-xs"
                        variant="default"
                    >
                        + Here
                    </Button>
                    {!!marks.length && song && (
                        <Button
                            onClick={() => {
                                const next = { ...(store.bookmarks ?? {}) };
                                delete next[song.id];
                                store.set({ bookmarks: next });
                            }}
                            size="compact-xs"
                            variant="subtle"
                        >
                            Clear
                        </Button>
                    )}
                </Group>
            </Stack>
            <Stack gap={4}>
                <Text fw={700} size="xs">
                    Queue snapshots
                </Text>
                <Group gap={4}>
                    <Button
                        onClick={() => {
                            snapName.current++;
                            const snap = {
                                at: Date.now(),
                                ids: items.map((s) => s.id),
                                name: `${items.length} songs, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                            };
                            store.set({
                                queueSnapshots: [snap, ...(store.queueSnapshots ?? [])].slice(0, 6),
                            });
                            toast.success({ message: 'Queue saved' });
                        }}
                        size="compact-xs"
                        variant="default"
                    >
                        Save the queue
                    </Button>
                    {(store.queueSnapshots ?? []).map((s) => (
                        <Button
                            key={s.at}
                            onClick={async () => {
                                const id = serverId();
                                const songs: Song[] = [];
                                for (const sid of s.ids.slice(0, 300)) {
                                    const r = await api.controller
                                        .getSongDetail({
                                            apiClientProps: { serverId: id },
                                            query: { id: sid },
                                        })
                                        .catch(() => null);
                                    if (r) songs.push(r as Song);
                                }
                                if (songs.length) await addToQueueByData(Play.NOW, songs);
                            }}
                            size="compact-xs"
                            title="Play this saved queue"
                            variant="light"
                        >
                            {s.name}
                        </Button>
                    ))}
                </Group>
            </Stack>
            <Group gap={4} wrap="nowrap">
                <Select
                    data={artists}
                    onChange={setArtist}
                    placeholder="Remove an artist from the queue"
                    size="xs"
                    style={{ flex: 1 }}
                    value={artist}
                />
                <Button
                    disabled={!artist}
                    onClick={() => {
                        const gone = items.slice(idx + 1).filter((s) => s.artistName === artist);
                        player().clearSelected(gone);
                        toast.info({ message: `Removed ${gone.length} songs by ${artist}` });
                        setArtist(null);
                    }}
                    size="xs"
                    variant="default"
                >
                    Remove
                </Button>
            </Group>
            <Switch
                checked={!!store.privateSession}
                description="Nothing you play is counted or shown to friends"
                label="Private session"
                onChange={(e) => store.set({ privateSession: e.currentTarget.checked })}
                size="xs"
            />
            <Switch
                checked={!!store.volumeMemory}
                label="Remember the volume for each song"
                onChange={(e) => store.set({ volumeMemory: e.currentTarget.checked })}
                size="xs"
            />
        </Stack>
    );
};
