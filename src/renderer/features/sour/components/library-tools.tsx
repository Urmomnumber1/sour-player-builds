import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import styles from './hub.module.css';

import { api } from '/@/renderer/api';
import {
    BundleCard,
    LyricsDoctorCard,
    MyRequestsCard,
    StorageCard,
    WishlistCard,
} from '/@/renderer/features/hermes-request/components/request-extras';
import { VideosCard } from '/@/renderer/features/hermes-video/components/video-manager';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { searchQueries } from '/@/renderer/features/search/api/search-api';
import { AdminCard, LyricsWall } from '/@/renderer/features/sour/components/extras104';
import { Card } from '/@/renderer/features/sour/components/hub-panels';
import { useAllAlbums } from '/@/renderer/features/sour/components/library-views';
import { useMyProfile, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { useCurrentServer, usePlayerSong } from '/@/renderer/store';
import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Select } from '/@/shared/components/select/select';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { Textarea } from '/@/shared/components/textarea/textarea';
import { toast } from '/@/shared/components/toast/toast';
import { type Album, type Song } from '/@/shared/types/domain-types';

const fail = (error: Error) => toast.error({ message: error.message });

const hermes = async <T,>(url: string, body?: unknown): Promise<T> => {
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
    return json as T;
};

// album search (for picking an album to fix)
const useAlbumSearch = (text: string) => {
    const server = useCurrentServer();
    const [term, setTerm] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setTerm(text.trim()), 300);
        return () => clearTimeout(t);
    }, [text]);
    return useQuery(
        searchQueries.search({
            options: { enabled: !!server?.id && term.length >= 2 },
            query: { albumArtistLimit: 0, albumLimit: 8, query: term, songLimit: 8 },
            serverId: server?.id || '',
        }),
    );
};

const albumSongs = async (serverId: string, albumId: string): Promise<Song[]> => {
    const album = await api.controller.getAlbumDetail({
        apiClientProps: { serverId },
        query: { id: albumId },
    });
    return album?.songs ?? [];
};

// ---------- health: missing tags and covers, low quality ----------
interface Issues {
    done: number;
    list: { artist: string; file: string; problems: string[]; title: string }[];
    running: boolean;
    total: number;
}

const HealthCard = () => {
    const url = useHermesUrl();
    const qc = useQueryClient();
    const issues = useQuery({
        enabled: !!url,
        queryFn: () => hermes<Issues>(`${url}/api/library/issues`),
        queryKey: ['sour-issues', url],
        refetchInterval: (q) => (q.state.data?.running ? 2000 : 30000),
    });
    const data = issues.data;
    const score = data && data.total ? Math.round((1 - data.list.length / data.total) * 100) : null;
    const fix = (file: string, action: 'retag' | 'upgrade') =>
        hermes(`${url}/api/library/fix`, { action, file })
            .then(() => {
                toast.success({
                    message:
                        action === 'retag'
                            ? 'Fixed the tags and cover'
                            : 'Replaced it with a better copy',
                });
                qc.invalidateQueries({ queryKey: ['sour-issues'] });
            })
            .catch(fail);
    return (
        <Card icon={'\u{1FA7A}'} title="Library health">
            <Group gap="sm">
                {score !== null && (
                    <Text fw={800} size="xl">
                        {score}%
                    </Text>
                )}
                <Text isMuted size="sm">
                    {data?.running
                        ? `Checking songs... ${data.done} of ${data.total}`
                        : data?.total
                          ? `${data.list.length} of ${data.total} songs need a look (missing tags or cover, low quality)`
                          : 'Check every song for missing tags, missing covers and low quality.'}
                </Text>
                <Button
                    disabled={data?.running}
                    onClick={() =>
                        hermes(`${url}/api/library/issues`, {})
                            .then(() => issues.refetch())
                            .catch(fail)
                    }
                    size="xs"
                    variant="default"
                >
                    {data?.total ? 'Check again' : 'Check the library'}
                </Button>
            </Group>
            <div className={styles.list}>
                {(data?.list ?? []).slice(0, 40).map((x) => (
                    <div className={styles.row} key={x.file}>
                        <div className={styles.grow}>
                            <Text size="sm" truncate>
                                {x.title || x.file}
                            </Text>
                            <span className={styles.muted}>
                                {x.artist ? `${x.artist} - ` : ''}
                                {x.problems.join(', ')}
                            </span>
                        </div>
                        <Button
                            onClick={() => fix(x.file, 'retag')}
                            size="compact-xs"
                            variant="subtle"
                        >
                            Fix tags
                        </Button>
                        {x.problems.some((p) => p.startsWith('low quality')) && (
                            <Button
                                onClick={() => fix(x.file, 'upgrade')}
                                size="compact-xs"
                                variant="subtle"
                            >
                                Better copy
                            </Button>
                        )}
                    </div>
                ))}
            </div>
        </Card>
    );
};

// ---------- duplicates ----------
interface DupPlan {
    files: number;
    groups: number;
    list: { keep: { kbps: string; path: string }; remove: { kbps: string; path: string }[] }[];
}

const DuplicatesCard = () => {
    const url = useHermesUrl();
    const [plan, setPlan] = useState<DupPlan | null>(null);
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    return (
        <Card icon={'\u{1F46F}'} title="Duplicate songs">
            <Text isMuted size="sm">
                The same song saved twice (same artist and title, same length). The better copy
                stays; the other moves to a hidden folder, nothing is deleted.
            </Text>
            <Group gap="xs">
                <Button
                    loading={busy}
                    onClick={() => {
                        setBusy(true);
                        hermes<DupPlan>(`${url}/api/duplicates/scan`, {})
                            .then(setPlan)
                            .catch(fail)
                            .finally(() => setBusy(false));
                    }}
                    size="xs"
                    variant="default"
                >
                    Look for duplicates
                </Button>
                {plan && plan.files > 0 && (
                    <>
                        <TextInput
                            onChange={(e) => setPin(e.currentTarget.value)}
                            placeholder="Hermes PIN (if set)"
                            size="xs"
                            type="password"
                            value={pin}
                            w={160}
                        />
                        <Button
                            onClick={() =>
                                hermes<{ moved: number }>(`${url}/api/duplicates/remove`, {
                                    currentPin: pin,
                                })
                                    .then((r) => {
                                        toast.success({
                                            message: `Moved ${r.moved ?? plan.files} copies aside`,
                                        });
                                        setPlan(null);
                                    })
                                    .catch(fail)
                            }
                            size="xs"
                        >
                            Tidy up {plan.files} copies
                        </Button>
                    </>
                )}
            </Group>
            {plan && (
                <div className={styles.list}>
                    {!plan.groups && <Text size="sm">No duplicates.</Text>}
                    {plan.list.map((g) => (
                        <div className={styles.row} key={g.keep.path}>
                            <div className={styles.grow}>
                                <Text size="sm" truncate>
                                    <Listen path={g.keep.path} /> Keep {g.keep.path} {g.keep.kbps}
                                </Text>
                                {g.remove.map((r) => (
                                    <span className={styles.muted} key={r.path}>
                                        <Listen path={r.path} /> move aside: {r.path} {r.kbps}
                                        <br />
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};

// a play / stop button for one file (to hear a duplicate before it's moved aside)
let previewAudio: HTMLAudioElement | null = null;
const Listen = ({ path }: { path: string }) => {
    const url = useHermesUrl();
    const [on, setOn] = useState(false);
    return (
        <button
            onClick={() => {
                previewAudio?.pause();
                if (on) {
                    setOn(false);
                    return;
                }
                previewAudio = new Audio(
                    `${url}/api/duplicates/preview?path=${encodeURIComponent(path)}`,
                );
                previewAudio.onended = () => setOn(false);
                previewAudio.play().catch(() => setOn(false));
                setOn(true);
            }}
            style={{
                background: 'none',
                border: 0,
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
            }}
            title={on ? 'Stop' : 'Listen'}
            type="button"
        >
            {on ? '■' : '▶'}
        </button>
    );
};

// ---------- tags and covers ----------
const FIELDS: Array<[string, string]> = [
    ['title', 'Title'],
    ['artist', 'Artist'],
    ['album_artist', 'Album artist'],
    ['album', 'Album'],
    ['date', 'Year'],
    ['track', 'Track'],
    ['genre', 'Genre'],
];

const TagsAndCoverCard = () => {
    const url = useHermesUrl();
    const serverId = useCurrentServer()?.id;
    const [text, setText] = useState('');
    const search = useAlbumSearch(text);
    const [target, setTarget] = useState<null | { album?: Album; song?: Song }>(null);
    const [files, setFiles] = useState<string[]>([]);
    const [tags, setTags] = useState<Record<string, string>>({});
    const [covers, setCovers] = useState<
        null | { artist: string; source: string; title: string; url: string }[]
    >(null);

    const pickSong = (song: Song) => {
        setTarget({ song });
        setFiles(song.path ? [song.path] : []);
        setTags({
            album: song.album || '',
            album_artist: song.albumArtists?.[0]?.name || '',
            artist: song.artistName || '',
            date: song.releaseYear ? String(song.releaseYear) : '',
            genre: song.genres?.map((g) => g.name).join(', ') || '',
            title: song.name || '',
            track: song.trackNumber ? String(song.trackNumber) : '',
        });
        setCovers(null);
    };
    const pickAlbum = (album: Album) => {
        if (!serverId) return;
        setTarget({ album });
        setCovers(null);
        setTags({
            album: album.name,
            album_artist: album.albumArtistName,
            date: album.releaseYear ? String(album.releaseYear) : '',
            genre: album.genres?.map((g) => g.name).join(', ') || '',
        });
        albumSongs(serverId, album.id)
            .then((songs) => setFiles(songs.map((s) => s.path).filter((p): p is string => !!p)))
            .catch(fail);
    };
    const fields = target?.album ? FIELDS.filter(([k]) => k !== 'title' && k !== 'track') : FIELDS;
    return (
        <Card icon={'\u{1F3F7}️'} title="Fix tags and covers">
            {!target ? (
                <>
                    <TextInput
                        onChange={(e) => setText(e.currentTarget.value)}
                        placeholder="Search for a song or an album"
                        size="xs"
                        value={text}
                    />
                    <div className={styles.list}>
                        {(search.data?.albums ?? []).map((a) => (
                            <button
                                className={styles.option}
                                key={a.id}
                                onClick={() => pickAlbum(a)}
                                type="button"
                            >
                                <Text size="sm" truncate>
                                    Album: {a.name} - {a.albumArtistName}
                                </Text>
                            </button>
                        ))}
                        {(search.data?.songs ?? []).map((s) => (
                            <button
                                className={styles.option}
                                key={s.id}
                                onClick={() => pickSong(s)}
                                type="button"
                            >
                                <Text size="sm" truncate>
                                    Song: {s.name} - {s.artistName}
                                </Text>
                            </button>
                        ))}
                    </div>
                </>
            ) : (
                <>
                    <Group justify="space-between">
                        <Text fw={600} size="sm">
                            {target.album
                                ? `${target.album.name} (${files.length} songs)`
                                : target.song?.name}
                        </Text>
                        <Button onClick={() => setTarget(null)} size="compact-xs" variant="subtle">
                            Pick another
                        </Button>
                    </Group>
                    {!files.length && (
                        <Text isMuted size="sm">
                            The music server didn&apos;t say where this file is, so it can&apos;t be
                            changed from here.
                        </Text>
                    )}
                    <div className={styles.options}>
                        {fields.map(([k, label]) => (
                            <TextInput
                                key={k}
                                label={label}
                                onChange={(e) =>
                                    setTags((t) => ({ ...t, [k]: e.currentTarget.value }))
                                }
                                size="xs"
                                value={tags[k] ?? ''}
                            />
                        ))}
                    </div>
                    <Group gap="xs">
                        <Button
                            disabled={!files.length}
                            onClick={() =>
                                hermes<{ done: number; failed: unknown[] }>(
                                    `${url}/api/library/tags`,
                                    {
                                        album: tags.album,
                                        artist: tags.album_artist || tags.artist,
                                        files,
                                        tags,
                                    },
                                )
                                    .then((r) =>
                                        toast.success({
                                            message: `Saved tags on ${r.done} song${r.done === 1 ? '' : 's'}${r.failed.length ? ` (${r.failed.length} couldn't be changed)` : ''}. Navidrome picks it up on its next scan.`,
                                        }),
                                    )
                                    .catch(fail)
                            }
                            size="xs"
                        >
                            Save tags
                        </Button>
                        <Button
                            disabled={!files.length}
                            onClick={() =>
                                hermes<typeof covers>(
                                    `${url}/api/library/covers?artist=${encodeURIComponent(tags.album_artist || tags.artist || '')}&album=${encodeURIComponent(tags.album || '')}`,
                                )
                                    .then(setCovers)
                                    .catch(fail)
                            }
                            size="xs"
                            variant="default"
                        >
                            Find a better cover
                        </Button>
                    </Group>
                    {covers && (
                        <div className={styles.options}>
                            {covers.map((c) => (
                                <button
                                    className={styles.option}
                                    key={c.url}
                                    onClick={() =>
                                        hermes<{ done: number }>(`${url}/api/library/cover`, {
                                            album: tags.album,
                                            artist: tags.album_artist || tags.artist,
                                            files,
                                            url: c.url,
                                        })
                                            .then((r) =>
                                                toast.success({
                                                    message: `New cover on ${r.done} song${r.done === 1 ? '' : 's'}`,
                                                }),
                                            )
                                            .catch(fail)
                                    }
                                    title={`${c.title} - ${c.artist} (${c.source})`}
                                    type="button"
                                >
                                    <img
                                        alt=""
                                        height={64}
                                        src={c.url}
                                        style={{ borderRadius: 6, objectFit: 'cover' }}
                                        width={64}
                                    />
                                    <div className={styles.grow}>
                                        <Text size="xs" truncate>
                                            {c.title}
                                        </Text>
                                        <span className={styles.muted}>{c.source}</span>
                                    </div>
                                </button>
                            ))}
                            {!covers.length && <Text size="sm">No covers found.</Text>}
                        </div>
                    )}
                </>
            )}
        </Card>
    );
};

// ---------- lyrics: tap along to time them ----------
const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;

const LyricsTapCard = () => {
    const url = useHermesUrl();
    const playing = usePlayerSong();
    const [text, setText] = useState('');
    const [stamps, setStamps] = useState<number[]>([]);
    const lines = useMemo(
        () =>
            text
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean),
        [text],
    );
    const next = stamps.length;
    const tap = () => {
        if (next >= lines.length) return;
        setStamps((s) => [...s, useTimestampStoreBase.getState().timestamp]);
    };
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                tap();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
    const lrc = lines
        .map((l, i) => (stamps[i] !== undefined ? `[${fmtTime(stamps[i])}]${l}` : ''))
        .filter(Boolean)
        .join('\n');
    return (
        <Card icon={'\u{1F3A4}'} title="Time the lyrics (tap along)">
            <Text isMuted size="sm">
                Paste the words (one line per line), play the song and press Tap (or Ctrl+Enter) as
                each line starts. It saves as synced lyrics for{' '}
                {playing ? <b>{playing.name}</b> : 'the song that is playing'}.
            </Text>
            <Textarea
                autosize
                maxRows={10}
                minRows={4}
                onChange={(e) => {
                    setText(e.currentTarget.value);
                    setStamps([]);
                }}
                placeholder="Paste lyrics here"
                value={text}
            />
            <Group gap="xs">
                <Button
                    disabled={!lines.length || next >= lines.length || !playing}
                    onClick={tap}
                    size="xs"
                >
                    Tap ({next}/{lines.length})
                </Button>
                <Button
                    disabled={!stamps.length}
                    onClick={() => setStamps((s) => s.slice(0, -1))}
                    size="xs"
                    variant="default"
                >
                    Undo
                </Button>
                <Button
                    disabled={next < lines.length || !lines.length || !playing?.path}
                    onClick={() =>
                        hermes(`${url}/api/library/lyrics`, { file: playing?.path, lrc })
                            .then(() =>
                                toast.success({
                                    message: 'Lyrics saved - they show after Navidrome rescans',
                                }),
                            )
                            .catch(fail)
                    }
                    size="xs"
                >
                    Save lyrics
                </Button>
                <Button
                    disabled={!playing}
                    onClick={() => usePlayerStoreBase.getState().mediaSeekToTimestamp(0)}
                    size="xs"
                    variant="subtle"
                >
                    Restart song
                </Button>
            </Group>
            {next < lines.length && lines.length > 0 && (
                <Text size="sm">
                    Next line: <b>{lines[next]}</b>
                </Text>
            )}
        </Card>
    );
};

// ---------- archive songs nobody plays ----------
const ArchiveCard = () => {
    const url = useHermesUrl();
    const serverId = useCurrentServer()?.id;
    const myName = useMyProfile().data?.name ?? null;
    const qc = useQueryClient();
    const albums = useAllAlbums().data ?? [];
    const archived = useQuery({
        enabled: !!url,
        queryFn: () =>
            hermes<{ at: number; by: null | string; file: string }[]>(`${url}/api/library/archive`),
        queryKey: ['sour-archive', url],
    });
    const [sixMonths] = useState(() => Date.now() - 183 * 86400000);
    const dusty = albums.filter(
        (a) => !a.playCount && a.createdAt && Date.parse(a.createdAt) < sixMonths,
    );
    const [pick, setPick] = useState<null | string>(null);
    return (
        <Card icon={'\u{1F578}️'} title="Dusty corners">
            <Text isMuted size="sm">
                {dusty.length} albums added over six months ago that you&apos;ve never played.
                Archiving moves them to a hidden folder (Navidrome stops showing them); restore any
                time.
            </Text>
            <Group gap="xs">
                <Select
                    data={dusty.map((a) => ({
                        label: `${a.name} - ${a.albumArtistName}`,
                        value: a.id,
                    }))}
                    onChange={setPick}
                    placeholder="Pick an album"
                    searchable
                    size="xs"
                    value={pick}
                    w={320}
                />
                <Button
                    disabled={!pick || !serverId}
                    onClick={() =>
                        serverId &&
                        pick &&
                        albumSongs(serverId, pick)
                            .then((songs) =>
                                hermes<{ moved: number }>(`${url}/api/library/archive`, {
                                    by: myName,
                                    files: songs.map((s) => s.path).filter(Boolean),
                                }),
                            )
                            .then((r) => {
                                toast.success({ message: `Archived ${r.moved} songs` });
                                setPick(null);
                                qc.invalidateQueries({ queryKey: ['sour-archive'] });
                            })
                            .catch(fail)
                    }
                    size="xs"
                    variant="default"
                >
                    Archive it
                </Button>
            </Group>
            {(archived.data ?? []).slice(0, 30).map((x) => (
                <div className={styles.row} key={x.file}>
                    <div className={styles.grow}>
                        <Text size="xs" truncate>
                            {x.file}
                        </Text>
                    </div>
                    <Button
                        onClick={() =>
                            hermes(`${url}/api/library/archive`, { restore: x.file })
                                .then(() => {
                                    toast.success({ message: 'Restored' });
                                    qc.invalidateQueries({ queryKey: ['sour-archive'] });
                                })
                                .catch(fail)
                        }
                        size="compact-xs"
                        variant="subtle"
                    >
                        Restore
                    </Button>
                </div>
            ))}
        </Card>
    );
};

// ---------- mood bundles ----------
const MoodCard = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const [mood, setMood] = useState('');
    const [busy, setBusy] = useState(false);
    return (
        <Card icon={'\u{1F308}'} title="Mood bundle">
            <Text isMuted size="sm">
                Describe a mood and Hermes Music picks ten songs that fit and downloads them.
            </Text>
            <Group gap="xs">
                <TextInput
                    flex={1}
                    onChange={(e) => setMood(e.currentTarget.value)}
                    placeholder="rainy night drive"
                    size="xs"
                    value={mood}
                />
                <Button
                    disabled={mood.trim().length < 3}
                    loading={busy}
                    onClick={() => {
                        setBusy(true);
                        hermes<{ songs: string[] }>(`${url}/api/requests/mood`, {
                            mood,
                            profile: me?.id,
                        })
                            .then((r) => {
                                toast.success({
                                    message: `Requested ${r.songs.length} songs: ${r.songs.slice(0, 3).join(', ')}...`,
                                });
                                setMood('');
                            })
                            .catch(fail)
                            .finally(() => setBusy(false));
                    }}
                    size="xs"
                >
                    Get the songs
                </Button>
            </Group>
        </Card>
    );
};

export const LibraryTools = () => {
    const url = useHermesUrl();
    if (!url) {
        return (
            <Text isMuted>
                The tools need Hermes Music (Settings &gt; General &gt; Music videos).
            </Text>
        );
    }
    return (
        <div className={styles.columns}>
            <div className={styles.list}>
                <HealthCard />
                <TagsAndCoverCard />
                <LyricsTapCard />
                <AdminCard />
                <LyricsDoctorCard />
                <LyricsWall />
                <StorageCard />
                <MyRequestsCard />
            </div>
            <div className={styles.list}>
                <VideosCard />
                <MoodCard />
                <DuplicatesCard />
                <ArchiveCard />
                <WishlistCard />
                <BundleCard />
            </div>
        </div>
    );
};
