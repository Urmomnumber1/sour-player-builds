import { closeAllModals, openModal } from '@mantine/modals';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import styles from './discord-bot.module.css';

import { getAlbumSongsById, getPlaylistSongsById } from '/@/renderer/features/player/utils';
import {
    type BotItem,
    type BotKind,
    type BotSourceSong,
    KIND_LABEL,
    time,
    useBot,
    useBotAccess,
} from '/@/renderer/features/sour/discord-bot/bot-api';
import { useCurrentServer } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { DropdownMenu } from '/@/shared/components/dropdown-menu/dropdown-menu';
import { FileButton } from '/@/shared/components/file-button/file-button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Select } from '/@/shared/components/select/select';
import { Stack } from '/@/shared/components/stack/stack';
import { Tabs } from '/@/shared/components/tabs/tabs';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { type Song } from '/@/shared/types/domain-types';

type Bot = ReturnType<typeof useBot>;

// sound effects are short: show tenths of a second
export const short = (s: number) => (s && s < 10 ? `${s.toFixed(1)} s` : time(s));

const KINDS: { label: string; value: BotKind }[] = [
    { label: 'Music', value: 'music' },
    { label: 'Ambience', value: 'ambience' },
    { label: 'Sound effects', value: 'sfx' },
];

// ---------- the bot's library: Music, Playlists, Ambience, Sound effects ----------
export const BotLibraryPanel = ({ bot }: { bot: Bot }) => {
    const [tab, setTab] = useState<null | string>('music');
    const items = bot.library?.items ?? [];
    const of = (k: BotKind) => items.filter((i) => i.kind === k);
    return (
        <div className={styles.card}>
            <div className={styles.libHead}>
                <div className={styles.cardTitle}>
                    <Icon icon="library" /> The bot&apos;s library
                </div>
                <Button
                    leftSection={<Icon icon="add" />}
                    onClick={() =>
                        openAddSounds(tab && tab !== 'playlists' ? (tab as BotKind) : 'music')
                    }
                    size="compact-sm"
                    variant="filled"
                >
                    Add sounds
                </Button>
            </div>
            <Text isMuted size="xs">
                Only the bot plays these: they don&apos;t show up anywhere else in Sour Player.
                Songs from your library: right-click songs, albums or playlists &gt; Copy to Discord
                bot.
            </Text>
            <Tabs keepMounted={false} onChange={setTab} value={tab}>
                <Tabs.List>
                    <Tabs.Tab value="music">Music ({of('music').length})</Tabs.Tab>
                    <Tabs.Tab value="playlists">
                        Playlists ({bot.library?.playlists.length ?? 0})
                    </Tabs.Tab>
                    <Tabs.Tab value="ambience">Ambience ({of('ambience').length})</Tabs.Tab>
                    <Tabs.Tab value="sfx">Sound effects ({of('sfx').length})</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel pt="sm" value="music">
                    <ItemList bot={bot} items={of('music')} kind="music" />
                </Tabs.Panel>
                <Tabs.Panel pt="sm" value="playlists">
                    <Playlists bot={bot} />
                </Tabs.Panel>
                <Tabs.Panel pt="sm" value="ambience">
                    <ItemList bot={bot} items={of('ambience')} kind="ambience" />
                </Tabs.Panel>
                <Tabs.Panel pt="sm" value="sfx">
                    <ItemList bot={bot} items={of('sfx')} kind="sfx" />
                </Tabs.Panel>
            </Tabs>
        </div>
    );
};

const matches = (it: BotItem, q: string) =>
    !q || `${it.title} ${it.artist} ${it.album}`.toLowerCase().includes(q.toLowerCase());

const ItemList = ({ bot, items, kind }: { bot: Bot; items: BotItem[]; kind: BotKind }) => {
    const [q, setQ] = useState('');
    const shown = items.filter((it) => matches(it, q));
    const ready = shown.filter((it) => it.status === 'ready');
    const voice = !!bot.state?.voice;
    if (!items.length) {
        return (
            <Text isMuted size="sm">
                {kind === 'music'
                    ? 'No music yet. Right-click songs, albums or playlists anywhere in Sour Player > Copy to Discord bot, or use Add sounds.'
                    : `No ${KIND_LABEL[kind].toLowerCase()} yet: use Add sounds.`}
            </Text>
        );
    }
    return (
        <Stack gap="xs">
            <Group gap="xs" wrap="nowrap">
                <TextInput
                    leftSection={<Icon icon="search" />}
                    onChange={(e) => setQ(e.currentTarget.value)}
                    placeholder="Find"
                    size="xs"
                    style={{ flex: 1 }}
                    value={q}
                />
                {kind === 'music' && ready.length > 1 && (
                    <Button
                        disabled={!voice}
                        leftSection={<Icon icon="mediaPlay" />}
                        onClick={() => bot.act('play', { ids: ready.map((x) => x.id), start: 0 })}
                        size="compact-sm"
                        variant="default"
                    >
                        Play all
                    </Button>
                )}
            </Group>
            <div className={styles.list}>
                {shown.map((it) => (
                    <div className={styles.item} key={it.id}>
                        <div className={styles.itemText}>
                            <span className={styles.ellipsis}>{it.title}</span>
                            {it.status === 'failed' ? (
                                <span className={styles.failed}>
                                    Couldn&apos;t get it: {it.note}
                                </span>
                            ) : it.status === 'downloading' ? (
                                <span className={styles.muted}>Downloading from YouTube...</span>
                            ) : (
                                <span className={`${styles.muted} ${styles.ellipsis}`}>
                                    {[it.artist, short(it.duration), it.by && `added by ${it.by}`]
                                        .filter(Boolean)
                                        .join(' - ')}
                                </span>
                            )}
                        </div>
                        {it.status === 'ready' && kind === 'music' && (
                            <>
                                <Button
                                    disabled={!voice}
                                    onClick={() =>
                                        bot.act('play', {
                                            ids: ready.map((x) => x.id),
                                            start: ready.indexOf(it),
                                        })
                                    }
                                    size="compact-sm"
                                    variant="default"
                                >
                                    Play
                                </Button>
                                <Button
                                    disabled={!voice}
                                    onClick={() => bot.act('enqueue', { ids: [it.id] })}
                                    size="compact-sm"
                                    variant="subtle"
                                >
                                    Queue
                                </Button>
                            </>
                        )}
                        {it.status === 'ready' && kind === 'sfx' && (
                            <Button
                                disabled={!voice}
                                onClick={() => bot.act('sfx', { id: it.id })}
                                size="compact-sm"
                                variant="default"
                            >
                                Play
                            </Button>
                        )}
                        {it.status === 'ready' && kind === 'ambience' && (
                            <Button
                                disabled={!voice}
                                onClick={() =>
                                    bot.act('ambience', {
                                        id: it.id,
                                        on: !bot.state?.ambience.some((a) => a.id === it.id),
                                    })
                                }
                                size="compact-sm"
                                variant="default"
                            >
                                {bot.state?.ambience.some((a) => a.id === it.id)
                                    ? 'Turn off'
                                    : 'Turn on'}
                            </Button>
                        )}
                        <ItemMenu bot={bot} it={it} />
                    </div>
                ))}
            </div>
        </Stack>
    );
};

const ItemMenu = ({ bot, it }: { bot: Bot; it: BotItem }) => (
    <DropdownMenu position="bottom-end">
        <DropdownMenu.Target>
            <Button aria-label="More" p="0" size="compact-sm" variant="subtle" w={30}>
                <Icon icon="ellipsisHorizontal" />
            </Button>
        </DropdownMenu.Target>
        <DropdownMenu.Dropdown>
            {it.status === 'ready' && it.kind === 'music' && (
                <>
                    <DropdownMenu.Item
                        leftSection={<Icon icon="mediaPlayNext" />}
                        onClick={() => bot.act('enqueue', { ids: [it.id], next: true })}
                    >
                        Play next
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                        leftSection={<Icon icon="playlistAdd" />}
                        onClick={() => openAddToPlaylist([it.id])}
                    >
                        Add to a playlist
                    </DropdownMenu.Item>
                </>
            )}
            <DropdownMenu.Item leftSection={<Icon icon="edit" />} onClick={() => openRename(it)}>
                Rename
            </DropdownMenu.Item>
            {KINDS.filter((k) => k.value !== it.kind).map((k) => (
                <DropdownMenu.Item
                    key={k.value}
                    leftSection={<Icon icon="arrowRight" />}
                    onClick={() => bot.lib('edit', { id: it.id, kind: k.value })}
                >
                    Move to {k.label}
                </DropdownMenu.Item>
            ))}
            <DropdownMenu.Divider />
            <DropdownMenu.Item
                isDanger
                leftSection={<Icon icon="delete" />}
                onClick={() => openDelete(it)}
            >
                Delete
            </DropdownMenu.Item>
        </DropdownMenu.Dropdown>
    </DropdownMenu>
);

// ---------- playlists ----------
const Playlists = ({ bot }: { bot: Bot }) => {
    const [open, setOpen] = useState<null | string>(null);
    const lists = bot.library?.playlists ?? [];
    const byId = useMemo(
        () => new Map((bot.library?.items ?? []).map((x) => [x.id, x])),
        [bot.library],
    );
    const voice = !!bot.state?.voice;
    const save = (body: Record<string, unknown>) => bot.lib('playlist', body);
    return (
        <Stack gap="xs">
            <Group>
                <Button
                    leftSection={<Icon icon="add" />}
                    onClick={() => openNamePlaylist()}
                    size="compact-sm"
                    variant="default"
                >
                    New playlist
                </Button>
            </Group>
            {!lists.length && (
                <Text isMuted size="sm">
                    No playlists yet. Make one here, then add songs with a song&apos;s ... menu &gt;
                    Add to a playlist.
                </Text>
            )}
            <div className={styles.list}>
                {lists.map((pl) => (
                    <div key={pl.id}>
                        <div className={styles.item}>
                            <button
                                className={styles.itemText}
                                onClick={() => setOpen(open === pl.id ? null : pl.id)}
                                style={{
                                    background: 'none',
                                    border: 0,
                                    color: 'inherit',
                                    cursor: 'pointer',
                                    font: 'inherit',
                                    textAlign: 'left',
                                }}
                                type="button"
                            >
                                <span className={styles.ellipsis}>
                                    <Icon icon={open === pl.id ? 'arrowDownS' : 'arrowRightS'} />{' '}
                                    {pl.name}
                                </span>
                                <span className={styles.muted}>
                                    {pl.items.length} song{pl.items.length === 1 ? '' : 's'}
                                    {pl.by ? ` - by ${pl.by}` : ''}
                                </span>
                            </button>
                            <Button
                                disabled={!voice || !pl.items.length}
                                onClick={() => bot.act('playlist', { id: pl.id })}
                                size="compact-sm"
                                variant="default"
                            >
                                Play
                            </Button>
                            <Button
                                disabled={!voice || !pl.items.length}
                                onClick={() => bot.act('playlist', { id: pl.id, shuffle: true })}
                                size="compact-sm"
                                variant="subtle"
                            >
                                Shuffle
                            </Button>
                            <DropdownMenu position="bottom-end">
                                <DropdownMenu.Target>
                                    <Button
                                        aria-label="More"
                                        p="0"
                                        size="compact-sm"
                                        variant="subtle"
                                        w={30}
                                    >
                                        <Icon icon="ellipsisHorizontal" />
                                    </Button>
                                </DropdownMenu.Target>
                                <DropdownMenu.Dropdown>
                                    <DropdownMenu.Item
                                        leftSection={<Icon icon="edit" />}
                                        onClick={() => openNamePlaylist(pl.id, pl.name)}
                                    >
                                        Rename
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                        isDanger
                                        leftSection={<Icon icon="delete" />}
                                        onClick={() => bot.lib('playlist/remove', { id: pl.id })}
                                    >
                                        Delete the playlist (the songs stay)
                                    </DropdownMenu.Item>
                                </DropdownMenu.Dropdown>
                            </DropdownMenu>
                        </div>
                        {open === pl.id && (
                            <div className={styles.playlistSongs}>
                                {!pl.items.length && (
                                    <Text isMuted size="sm">
                                        Empty: add songs with a song&apos;s ... menu &gt; Add to a
                                        playlist.
                                    </Text>
                                )}
                                {pl.items.map((id, i) => {
                                    const it = byId.get(id);
                                    if (!it) return null;
                                    return (
                                        <div className={styles.item} key={id}>
                                            <div className={styles.itemText}>
                                                <span className={styles.ellipsis}>{it.title}</span>
                                                <span className={styles.muted}>
                                                    {short(it.duration)}
                                                </span>
                                            </div>
                                            <Button
                                                disabled={!voice}
                                                onClick={() =>
                                                    bot.act('play', { ids: pl.items, start: i })
                                                }
                                                size="compact-xs"
                                                variant="subtle"
                                            >
                                                Play from here
                                            </Button>
                                            <Button
                                                disabled={i === 0}
                                                onClick={() => {
                                                    const next = [...pl.items];
                                                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                                                    save({ id: pl.id, items: next });
                                                }}
                                                p="0"
                                                size="compact-xs"
                                                title="Move up"
                                                variant="subtle"
                                                w={26}
                                            >
                                                <Icon icon="arrowUp" />
                                            </Button>
                                            <Button
                                                onClick={() => save({ id: pl.id, remove: [id] })}
                                                p="0"
                                                size="compact-xs"
                                                title="Take out of the playlist"
                                                variant="subtle"
                                                w={26}
                                            >
                                                <Icon icon="x" />
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </Stack>
    );
};

// ---------- small windows: add sounds, rename, delete, playlists ----------
const AddSounds = ({ start }: { start: BotKind }) => {
    const bot = useBot(false);
    const [kind, setKind] = useState<BotKind>(start);
    const [link, setLink] = useState('');
    const [name, setName] = useState('');
    const [busy, setBusy] = useState('');
    const uploadFiles = async (files: File[]) => {
        let done = 0;
        for (const [i, f] of files.entries()) {
            setBusy(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
            try {
                await bot.upload(f, kind);
                done++;
            } catch (e) {
                toast.error({ message: `${f.name}: ${(e as Error).message}` });
            }
        }
        setBusy('');
        if (done) {
            toast.success({ message: `Added ${done} to ${KIND_LABEL[kind]}` });
            closeAllModals();
        }
    };
    const fromYouTube = async () => {
        if (!link.trim()) return;
        setBusy('Asking Hermes Music...');
        try {
            await bot.lib('youtube', { kind, title: name.trim(), url: link.trim() });
            toast.info({
                message: "Downloading from YouTube: it shows up in the list when it's ready.",
            });
            closeAllModals();
        } catch {
            // the error is shown
        } finally {
            setBusy('');
        }
    };
    return (
        <Stack gap="md">
            <SegmentedControl
                data={KINDS}
                fullWidth
                onChange={(v) => setKind(v as BotKind)}
                value={kind}
            />
            <Text isMuted size="xs">
                {kind === 'music'
                    ? 'Songs for the queue and playlists.'
                    : kind === 'ambience'
                      ? 'Loops that play under the music (rain, a tavern, a campfire...). From YouTube, the first hour is kept.'
                      : 'Short sounds played once on top of everything (a door, swords, thunder...).'}
            </Text>
            <Stack gap={6}>
                <Text fw={600} size="sm">
                    From this device
                </Text>
                <FileButton
                    accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac,.webm,.weba"
                    multiple
                    onChange={(files) => files && files.length && uploadFiles(files)}
                >
                    {(props) => (
                        <Button
                            {...props}
                            disabled={!!busy}
                            leftSection={<Icon icon="upload" />}
                            variant="default"
                        >
                            Choose sound files
                        </Button>
                    )}
                </FileButton>
            </Stack>
            <Stack gap={6}>
                <Text fw={600} size="sm">
                    From YouTube
                </Text>
                <TextInput
                    onChange={(e) => setLink(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fromYouTube()}
                    placeholder="A YouTube link, or what to search for (tavern ambience, sword clash...)"
                    value={link}
                />
                <TextInput
                    onChange={(e) => setName(e.currentTarget.value)}
                    placeholder="Name (optional)"
                    value={name}
                />
                <Group justify="flex-end">
                    <Button
                        disabled={!!busy || !link.trim()}
                        onClick={fromYouTube}
                        variant="filled"
                    >
                        Download
                    </Button>
                </Group>
            </Stack>
            {busy && (
                <Text isMuted size="sm">
                    {busy}
                </Text>
            )}
        </Stack>
    );
};

const openAddSounds = (kind: BotKind) =>
    openModal({ children: <AddSounds start={kind} />, title: 'Add sounds to the Discord bot' });

const Rename = ({ it }: { it: BotItem }) => {
    const bot = useBot(false);
    const [title, setTitle] = useState(it.title);
    const save = async () => {
        if (!title.trim()) return;
        await bot.lib('edit', { id: it.id, title: title.trim() }).catch(() => undefined);
        closeAllModals();
    };
    return (
        <Stack gap="sm">
            <TextInput
                autoFocus
                onChange={(e) => setTitle(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                value={title}
            />
            <Group justify="flex-end">
                <Button onClick={save} variant="filled">
                    Save
                </Button>
            </Group>
        </Stack>
    );
};
const openRename = (it: BotItem) => openModal({ children: <Rename it={it} />, title: 'Rename' });

const Delete = ({ it }: { it: BotItem }) => {
    const bot = useBot(false);
    return (
        <Stack gap="md">
            <Text>
                Delete {it.title} from the bot? It&apos;s only the bot&apos;s copy: songs stay in
                the music library.
            </Text>
            <Group justify="flex-end">
                <Button onClick={() => closeAllModals()} variant="default">
                    Cancel
                </Button>
                <Button
                    color="red"
                    onClick={async () => {
                        await bot.lib('remove', { id: it.id }).catch(() => undefined);
                        closeAllModals();
                    }}
                    variant="filled"
                >
                    Delete
                </Button>
            </Group>
        </Stack>
    );
};
const openDelete = (it: BotItem) => openModal({ children: <Delete it={it} />, title: 'Delete' });

const NamePlaylist = ({ id, name }: { id?: string; name?: string }) => {
    const bot = useBot(false);
    const [value, setValue] = useState(name || '');
    const save = async () => {
        if (!value.trim()) return;
        await bot.lib('playlist', { id, name: value.trim() }).catch(() => undefined);
        closeAllModals();
    };
    return (
        <Stack gap="sm">
            <TextInput
                autoFocus
                onChange={(e) => setValue(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder="Tavern night, Boss fight..."
                value={value}
            />
            <Group justify="flex-end">
                <Button onClick={save} variant="filled">
                    {id ? 'Rename' : 'Make it'}
                </Button>
            </Group>
        </Stack>
    );
};
const openNamePlaylist = (id?: string, name?: string) =>
    openModal({
        children: <NamePlaylist id={id} name={name} />,
        title: id ? 'Rename the playlist' : 'New playlist',
    });

const AddToPlaylist = ({ ids }: { ids: string[] }) => {
    const bot = useBot();
    const lists = bot.library?.playlists ?? [];
    const [pick, setPick] = useState<null | string>(lists[0]?.id ?? '');
    const [name, setName] = useState('');
    const add = async () => {
        await bot
            .lib(
                'playlist',
                pick ? { add: ids, id: pick } : { add: ids, name: name.trim() || 'New playlist' },
            )
            .catch(() => undefined);
        closeAllModals();
    };
    return (
        <Stack gap="sm">
            <Select
                data={[
                    ...lists.map((pl) => ({ label: pl.name, value: pl.id })),
                    { label: 'A new playlist...', value: '' },
                ]}
                onChange={setPick}
                value={pick}
            />
            {!pick && (
                <TextInput
                    onChange={(e) => setName(e.currentTarget.value)}
                    placeholder="Its name"
                    value={name}
                />
            )}
            <Group justify="flex-end">
                <Button onClick={add} variant="filled">
                    Add
                </Button>
            </Group>
        </Stack>
    );
};
const openAddToPlaylist = (ids: string[]) =>
    openModal({ children: <AddToPlaylist ids={ids} />, title: 'Add to a playlist' });

// ---------- "Copy to Discord bot" on songs, albums and playlists anywhere in Sour Player ----------
const asSource = (s: Song): BotSourceSong => ({
    album: s.album || '',
    artist: s.artistName || s.albumArtistName || '',
    duration: Math.round((s.duration || 0) / 1000),
    path: s.path || '',
    title: s.name,
});

const CopyToBot = ({
    albumIds,
    count,
    playlistIds,
    songs,
}: {
    albumIds?: string[];
    count: number;
    playlistIds?: string[];
    songs?: Song[];
}) => {
    const bot = useBot();
    const qc = useQueryClient();
    const serverId = useCurrentServer()?.id || '';
    const lists = bot.library?.playlists ?? [];
    const [kind, setKind] = useState<BotKind>('music');
    const [pick, setPick] = useState<null | string>('none');
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const copy = async () => {
        setBusy(true);
        try {
            let list: Song[] = songs ?? [];
            if (albumIds?.length)
                list = (await getAlbumSongsById({ id: albumIds, queryClient: qc, serverId })).items;
            if (playlistIds?.length) {
                list = [];
                for (const id of playlistIds)
                    list.push(
                        ...(await getPlaylistSongsById({ id, queryClient: qc, serverId })).items,
                    );
            }
            let playlist: string | undefined;
            if (kind === 'music' && pick === 'new') {
                playlist = (await bot.lib('playlist', { name: name.trim() || 'New playlist' }))
                    ?.playlist;
            } else if (kind === 'music' && pick && pick !== 'none') playlist = pick;
            const r = await bot.lib('copy', { kind, playlist, songs: list.map(asSource) });
            toast.success({
                message: `Copied ${r?.added ?? 0} song${r?.added === 1 ? '' : 's'} to the Discord bot (${KIND_LABEL[kind]})`,
            });
            closeAllModals();
        } catch {
            // the error is shown
        } finally {
            setBusy(false);
        }
    };
    return (
        <Stack gap="md">
            <Text size="sm">
                The bot gets its own copy{count === 1 ? '' : 'ies'}:{' '}
                {count === 1 ? 'it stays' : 'they stay'} in your library as{' '}
                {count === 1 ? 'it is' : 'they are'}.
            </Text>
            <SegmentedControl
                data={KINDS}
                fullWidth
                onChange={(v) => setKind(v as BotKind)}
                value={kind}
            />
            {kind === 'music' && (
                <>
                    <Select
                        data={[
                            { label: "Don't add to a playlist", value: 'none' },
                            ...lists.map((pl) => ({ label: `Add to ${pl.name}`, value: pl.id })),
                            { label: 'Add to a new playlist...', value: 'new' },
                        ]}
                        onChange={setPick}
                        value={pick}
                    />
                    {pick === 'new' && (
                        <TextInput
                            onChange={(e) => setName(e.currentTarget.value)}
                            placeholder="Playlist name (Tavern night, Boss fight...)"
                            value={name}
                        />
                    )}
                </>
            )}
            <Group justify="flex-end">
                <Button loading={busy} onClick={copy} variant="filled">
                    Copy
                </Button>
            </Group>
        </Stack>
    );
};

export const CopyToBotAction = ({
    albumIds,
    playlistIds,
    songs,
}: {
    albumIds?: string[];
    playlistIds?: string[];
    songs?: Song[];
}) => {
    const allowed = useBotAccess();
    const count = songs?.length ?? albumIds?.length ?? playlistIds?.length ?? 0;
    if (!allowed || !count) return null;
    const what = songs
        ? count === 1
            ? songs[0].name
            : `${count} songs`
        : albumIds
          ? count === 1
              ? 'this album'
              : `${count} albums`
          : count === 1
            ? 'this playlist'
            : `${count} playlists`;
    return (
        <ContextMenu.Item
            leftIcon="bot"
            onSelect={() =>
                openModal({
                    children: (
                        <CopyToBot
                            albumIds={albumIds}
                            count={songs ? count : 2}
                            playlistIds={playlistIds}
                            songs={songs}
                        />
                    ),
                    title: `Copy ${what} to the Discord bot`,
                })
            }
        >
            Copy to Discord bot
        </ContextMenu.Item>
    );
};
