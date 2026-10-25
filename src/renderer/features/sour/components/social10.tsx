import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import styles from './social10.module.css';

import { type GroupSong } from '/@/renderer/features/group-play/store/group-play.store';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { type SourProfile } from '/@/renderer/features/sour/api/sour-api';
import { AlbumOfWeekPicker } from '/@/renderer/features/sour/components/album-picker';
import { Card } from '/@/renderer/features/sour/components/hub-panels';
import { SongCover } from '/@/renderer/features/sour/components/people';
import { usePlaySong } from '/@/renderer/features/sour/components/profile-bits';
import { SongPicker } from '/@/renderer/features/sour/components/song-picker';
import {
    useMyProfile,
    useSourProfiles,
    useSourStore,
} from '/@/renderer/features/sour/store/sour.store';
import { startListenAlong } from '/@/renderer/features/sour/utils/switching';
import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Popover } from '/@/shared/components/popover/popover';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

// Sour Player 0.10.4: the inbox (recs, "ask me for a rec", nudges, @mentions), profile extras (currently
// obsessed, listening clock, top 4, taste by decade), polls, the daily song guess, album club, hot takes.

export const localDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Hermes Music returned ${res.status}`);
    return json;
};
const fail = (e: Error) => toast.error({ message: e.message });

const useMeAuth = () => {
    const me = useSourStore((s) => s.me);
    return me ? { key: me.key, profile: me.id } : null;
};

// ---------- inbox ----------
export interface InboxItem {
    at: number;
    from: null | string;
    fromName: string;
    group?: string;
    id: string;
    kind: 'ask' | 'mention' | 'nudge' | 'rec';
    listened?: boolean;
    read: boolean;
    song?: GroupSong | null;
    text?: string;
}

export const useInbox = () => {
    const url = useHermesUrl();
    const auth = useMeAuth();
    return useQuery({
        enabled: !!url && !!auth,
        queryFn: () => post(`${url}/api/inbox`, auth) as Promise<InboxItem[]>,
        queryKey: ['sour-inbox', url, auth?.profile],
        refetchInterval: 30000,
    });
};

export const sendToFriend = (
    url: string,
    auth: { key: string; profile: string },
    to: string,
    body: Record<string, unknown>,
) => post(`${url}/api/inbox/send`, { ...auth, ...body, to });

export const InboxButton = () => {
    const inbox = useInbox().data ?? [];
    const unread = inbox.filter((m) => !m.read).length;
    const [open, setOpen] = useState(false);
    return (
        <Popover onChange={setOpen} opened={open} position="bottom-start" width={360}>
            <Popover.Target>
                <span className={styles.inboxWrap}>
                    <ActionIcon
                        icon="bell"
                        onClick={() => setOpen((o) => !o)}
                        size="sm"
                        tooltip={{ label: 'Inbox', openDelay: 0 }}
                        variant="subtle"
                    />
                    {!!unread && <span className={styles.dot}>{unread > 9 ? '9+' : unread}</span>}
                </span>
            </Popover.Target>
            <Popover.Dropdown>{open && <InboxList items={inbox} />}</Popover.Dropdown>
        </Popover>
    );
};

const InboxList = ({ items }: { items: InboxItem[] }) => {
    const url = useHermesUrl();
    const auth = useMeAuth();
    const qc = useQueryClient();
    const play = usePlaySong();
    const navigate = useNavigate();
    const profiles = useSourProfiles().data ?? [];
    const [reply, setReply] = useState<null | string>(null);
    const [pick, setPick] = useState<GroupSong | null>(null);
    const refresh = () => qc.invalidateQueries({ queryKey: ['sour-inbox'] });
    useEffect(() => {
        if (url && auth && items.some((m) => !m.read))
            post(`${url}/api/inbox/read`, auth)
                .then(refresh)
                .catch(() => {});
        // read once when opened
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    if (!items.length)
        return (
            <Text isMuted size="sm">
                Nothing here yet. Friends can send you songs, ask you for one, or nudge you to
                listen along.
            </Text>
        );
    return (
        <Stack gap="xs" mah={420} style={{ overflowY: 'auto' }}>
            {items.map((m) => (
                <div className={styles.msg} key={m.id}>
                    <Text size="sm">
                        <b>{m.fromName}</b>{' '}
                        {m.kind === 'rec'
                            ? 'sent you a song'
                            : m.kind === 'ask'
                              ? 'wants a song recommendation'
                              : m.kind === 'nudge'
                                ? 'wants you to listen along'
                                : 'mentioned you'}
                        {m.text ? `: "${m.text}"` : ''}
                    </Text>
                    {m.song && (
                        <Group gap="xs" wrap="nowrap">
                            <SongCover size={32} song={m.song} />
                            <Text size="xs" style={{ flex: 1 }} truncate>
                                {m.song.title} - {m.song.artist}
                            </Text>
                            <Button
                                onClick={() => {
                                    if (m.song) play(m.song);
                                    if (url && auth)
                                        post(`${url}/api/inbox/listened`, { ...auth, id: m.id })
                                            .then(refresh)
                                            .catch(() => {});
                                }}
                                size="compact-xs"
                                variant={m.listened ? 'subtle' : 'light'}
                            >
                                {m.listened ? 'Listened ✓' : 'Play'}
                            </Button>
                        </Group>
                    )}
                    {m.kind === 'nudge' && m.from && (
                        <Button
                            onClick={() => {
                                const f = profiles.find((p) => p.id === m.from);
                                if (f) startListenAlong(f);
                            }}
                            size="compact-xs"
                            variant="light"
                        >
                            Listen along
                        </Button>
                    )}
                    {m.kind === 'mention' && m.group && (
                        <Button onClick={() => navigate('/')} size="compact-xs" variant="subtle">
                            Open Group Play
                        </Button>
                    )}
                    {m.kind === 'ask' && m.from && (
                        <>
                            {reply === m.id ? (
                                <Stack gap={4}>
                                    <SongPicker onPick={setPick} picked={pick} />
                                    <Button
                                        disabled={!pick}
                                        onClick={() =>
                                            url &&
                                            auth &&
                                            m.from &&
                                            sendToFriend(url, auth, m.from, {
                                                kind: 'rec',
                                                song: pick,
                                            })
                                                .then(() => {
                                                    toast.success({
                                                        message: `Sent ${pick?.title} to ${m.fromName}`,
                                                    });
                                                    setReply(null);
                                                    setPick(null);
                                                })
                                                .catch(fail)
                                        }
                                        size="compact-xs"
                                    >
                                        Send it
                                    </Button>
                                </Stack>
                            ) : (
                                <Button
                                    onClick={() => setReply(m.id)}
                                    size="compact-xs"
                                    variant="light"
                                >
                                    Recommend a song
                                </Button>
                            )}
                        </>
                    )}
                </div>
            ))}
        </Stack>
    );
};

// new inbox messages pop up (unless it's quiet hours)
export const InboxWatcher = () => {
    const items = useInbox().data;
    const seen = useRef<null | Set<string>>(null);
    useEffect(() => {
        if (!items) return;
        if (!seen.current) {
            seen.current = new Set(items.map((m) => m.id));
            return;
        }
        for (const m of items) {
            if (seen.current.has(m.id)) continue;
            seen.current.add(m.id);
            if (m.read || inQuietHours()) continue;
            toast.info({
                message:
                    m.kind === 'rec'
                        ? `${m.fromName} sent you ${m.song?.title ?? 'a song'}`
                        : m.kind === 'ask'
                          ? `${m.fromName} wants a song recommendation`
                          : m.kind === 'nudge'
                            ? `${m.fromName} wants you to listen along`
                            : `${m.fromName} mentioned you`,
            });
        }
    }, [items]);
    return null;
};

export const inQuietHours = () => {
    const q = useSourStore.getState().quietHours;
    if (!q?.on) return false;
    const h = new Date().getHours();
    return q.from <= q.to ? h >= q.from && h < q.to : h >= q.from || h < q.to;
};

// ---------- profile: send, ask, nudge ----------
export const FriendActions = ({ profile }: { profile: SourProfile }) => {
    const url = useHermesUrl();
    const auth = useMeAuth();
    const [picking, setPicking] = useState(false);
    const [pick, setPick] = useState<GroupSong | null>(null);
    if (!auth || auth.profile === profile.id) return null;
    const send = (body: Record<string, unknown>, done: string) =>
        sendToFriend(url, auth, profile.id, body)
            .then(() => toast.success({ message: done }))
            .catch(fail);
    return (
        <Stack gap={6} px="md">
            <Group gap="xs">
                <Button onClick={() => setPicking((p) => !p)} size="xs" variant="default">
                    Recommend a song
                </Button>
                <Button
                    onClick={() => send({ kind: 'ask' }, `Asked ${profile.name} for a song`)}
                    size="xs"
                    variant="default"
                >
                    Ask for a rec
                </Button>
                <Button
                    onClick={() => send({ kind: 'nudge' }, `Nudged ${profile.name}`)}
                    size="xs"
                    variant="default"
                >
                    Come listen with me
                </Button>
            </Group>
            {picking && (
                <Group align="flex-end" gap="xs" wrap="nowrap">
                    <div style={{ flex: 1 }}>
                        <SongPicker onPick={setPick} picked={pick} />
                    </div>
                    <Button
                        disabled={!pick}
                        onClick={() => {
                            send(
                                { kind: 'rec', song: pick },
                                `Sent ${pick?.title} to ${profile.name}`,
                            );
                            setPick(null);
                            setPicking(false);
                        }}
                        size="xs"
                    >
                        Send
                    </Button>
                </Group>
            )}
        </Stack>
    );
};

// ---------- profile: currently obsessed, listening clock, taste by decade, top 4 ----------
export const ProfileExtras10 = ({
    profile,
}: {
    profile: SourProfile & {
        hours?: null | number[];
        obsessed?: null | { n: number; song: GroupSong };
    };
}) => {
    const play = usePlaySong();
    const hours = profile.hours;
    const max = hours ? Math.max(...hours, 1) : 1;
    const decades = new Map<number, number>();
    for (const s of profile.stats?.topSongs ?? [])
        if (s.year)
            decades.set(
                Math.floor(s.year / 10) * 10,
                (decades.get(Math.floor(s.year / 10) * 10) || 0) + s.plays,
            );
    const top4 = (profile.custom as undefined | { top4?: GroupSong[] })?.top4 ?? [];
    const profileSong = (profile.custom as undefined | { profileSong?: GroupSong })?.profileSong;
    if (!profile.obsessed && !hours && !decades.size && !top4.length && !profileSong) return null;
    return (
        <div className={styles.extras}>
            {profileSong && (
                <button className={styles.tile} onClick={() => play(profileSong)} type="button">
                    <SongCover size={48} song={profileSong} />
                    <div>
                        <Text className={styles.label}>Profile song</Text>
                        <Text fw={700} size="sm" truncate>
                            {profileSong.title}
                        </Text>
                        <Text isMuted size="xs" truncate>
                            {profileSong.artist}
                        </Text>
                    </div>
                </button>
            )}
            {profile.obsessed && (
                <button
                    className={styles.tile}
                    onClick={() => profile.obsessed && play(profile.obsessed.song)}
                    type="button"
                >
                    <SongCover size={48} song={profile.obsessed.song} />
                    <div>
                        <Text className={styles.label}>Currently obsessed</Text>
                        <Text fw={700} size="sm" truncate>
                            {profile.obsessed.song.title}
                        </Text>
                        <Text isMuted size="xs">
                            {profile.obsessed.n} plays this week
                        </Text>
                    </div>
                </button>
            )}
            {!!top4.length && (
                <div className={styles.tileWide}>
                    <Text className={styles.label}>Top 4 albums</Text>
                    <div className={styles.top4}>
                        {top4.slice(0, 4).map((a) => (
                            <div key={a.id} title={`${a.title} - ${a.artist}`}>
                                <SongCover size={64} song={a} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {hours && (
                <div className={styles.tileWide}>
                    <Text className={styles.label}>When they listen</Text>
                    <div className={styles.clock}>
                        {hours.map((v, h) => (
                            <span
                                key={h}
                                style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
                                title={`${h}:00 - ${Math.round(v / 60)} min`}
                            />
                        ))}
                    </div>
                    <div className={styles.clockLabels}>
                        <span>midnight</span>
                        <span>6am</span>
                        <span>noon</span>
                        <span>6pm</span>
                    </div>
                </div>
            )}
            {decades.size > 1 && (
                <div className={styles.tileWide}>
                    <Text className={styles.label}>Taste by decade</Text>
                    <DecadeRadar data={[...decades.entries()].sort((a, b) => a[0] - b[0])} />
                </div>
            )}
        </div>
    );
};

const DecadeRadar = ({ data }: { data: [number, number][] }) => {
    const n = Math.max(3, data.length);
    const max = Math.max(...data.map((d) => d[1]), 1);
    const pt = (i: number, r: number) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return [60 + Math.cos(a) * r, 60 + Math.sin(a) * r];
    };
    const poly = data.map((d, i) => pt(i, 12 + (d[1] / max) * 40).join(',')).join(' ');
    return (
        <svg className={styles.radar} viewBox="0 0 120 120">
            {[20, 36, 52].map((r) => (
                <polygon
                    fill="none"
                    key={r}
                    points={data.map((_, i) => pt(i, r).join(',')).join(' ')}
                    stroke="currentColor"
                    strokeOpacity="0.15"
                />
            ))}
            <polygon
                fill="var(--theme-colors-primary)"
                fillOpacity="0.35"
                points={poly}
                stroke="var(--theme-colors-primary)"
            />
            {data.map((d, i) => {
                const [x, y] = pt(i, 58);
                return (
                    <text
                        fill="currentColor"
                        fontSize="7"
                        key={d[0]}
                        textAnchor="middle"
                        x={x}
                        y={y + 2}
                    >
                        {String(d[0]).slice(2)}s
                    </text>
                );
            })}
        </svg>
    );
};

// profile editor: top 4 albums and a profile song
export const ProfileEditor10 = ({
    custom,
    setC,
}: {
    custom: { profileSong?: GroupSong; top4?: GroupSong[] };
    setC: (c: Record<string, unknown>) => void;
}) => {
    const top4 = custom.top4 ?? [];
    return (
        <Stack gap="xs">
            <Text fw={700}>Top 4 albums</Text>
            <Group gap="xs">
                {top4.map((a, i) => (
                    <Button
                        key={a.id}
                        onClick={() => setC({ top4: top4.filter((_, j) => j !== i) })}
                        size="compact-xs"
                        variant="light"
                    >
                        {a.title} ×
                    </Button>
                ))}
            </Group>
            {top4.length < 4 && (
                <AlbumOfWeekPicker
                    onChange={(v) => v && setC({ top4: [...top4, v].slice(0, 4) })}
                    value={null}
                />
            )}
            <Text fw={700}>Profile song</Text>
            <SongPicker
                onPick={(s) => setC({ profileSong: s ?? undefined })}
                picked={custom.profileSong ?? null}
            />
        </Stack>
    );
};

// ---------- Hub: polls ----------
interface Poll {
    at: number;
    byName: string;
    id: string;
    options: string[];
    q: string;
    voters: Record<string, string[]>;
    votes: Record<string, number>;
}
export const PollsCard = () => {
    const url = useHermesUrl();
    const auth = useMeAuth();
    const qc = useQueryClient();
    const polls =
        useQuery({
            enabled: !!url,
            queryFn: async () => (await (await fetch(`${url}/api/polls`)).json()) as Poll[],
            queryKey: ['sour-polls', url],
            refetchInterval: 30000,
        }).data ?? [];
    const [q, setQ] = useState('');
    const [opts, setOpts] = useState('');
    const refresh = () => qc.invalidateQueries({ queryKey: ['sour-polls', url] });
    return (
        <Card icon="🗳️" title="Polls">
            <Stack gap="sm">
                {polls.slice(0, 4).map((p) => {
                    const total = Object.values(p.votes).reduce((a, v) => a + v, 0) || 1;
                    const mine = Object.entries(p.voters || {}).find(
                        ([, ids]) => auth && ids.includes(auth.profile),
                    )?.[0];
                    return (
                        <Stack gap={4} key={p.id}>
                            <Text fw={700} size="sm">
                                {p.q}{' '}
                                <span style={{ fontWeight: 400, opacity: 0.6 }}>- {p.byName}</span>
                            </Text>
                            {p.options.map((o) => (
                                <button
                                    className={styles.pollOption}
                                    key={o}
                                    onClick={() =>
                                        auth &&
                                        post(`${url}/api/polls/vote`, {
                                            ...auth,
                                            id: p.id,
                                            option: o,
                                        })
                                            .then(refresh)
                                            .catch(fail)
                                    }
                                    style={{
                                        ['--w' as string]: `${((p.votes[o] || 0) / total) * 100}%`,
                                    }}
                                    type="button"
                                >
                                    <span>
                                        {mine === o ? '● ' : ''}
                                        {o}
                                    </span>
                                    <span>{p.votes[o] || 0}</span>
                                </button>
                            ))}
                        </Stack>
                    );
                })}
                <TextInput
                    onChange={(e) => setQ(e.currentTarget.value)}
                    placeholder="Ask the group something"
                    size="xs"
                    value={q}
                />
                <Group gap="xs" wrap="nowrap">
                    <TextInput
                        onChange={(e) => setOpts(e.currentTarget.value)}
                        placeholder="Answers, comma separated"
                        size="xs"
                        style={{ flex: 1 }}
                        value={opts}
                    />
                    <Button
                        disabled={!q.trim() || opts.split(',').filter((x) => x.trim()).length < 2}
                        onClick={() =>
                            auth &&
                            post(`${url}/api/polls`, {
                                ...auth,
                                options: opts.split(','),
                                question: q,
                            })
                                .then(() => {
                                    setQ('');
                                    setOpts('');
                                    refresh();
                                })
                                .catch(fail)
                        }
                        size="xs"
                    >
                        Ask
                    </Button>
                </Group>
            </Stack>
        </Card>
    );
};

// ---------- Hub: the daily song guess ----------
const SNIPPETS = [1, 2, 4, 8, 16, 30];
export const DailyGuessCard = () => {
    const url = useHermesUrl();
    const auth = useMeAuth();
    const play = usePlaySong();
    const today = useQuery({
        enabled: !!url,
        queryFn: async () =>
            (await (await fetch(`${url}/api/daily-guess?date=${localDate()}`)).json()) as {
                results: { name: string; tries: number; won: boolean }[];
                songId?: string;
            },
        queryKey: ['sour-daily-guess', url, localDate()],
    }).data;
    const [tries, setTries] = useState(0);
    const [guess, setGuess] = useState('');
    const [answer, setAnswer] = useState<null | {
        album: string;
        artist: string;
        id: string;
        title: string;
    }>(null);
    const [won, setWon] = useState(false);
    const listen = async () => {
        if (!today?.songId) return;
        const secs = SNIPPETS[Math.min(tries, SNIPPETS.length - 1)];
        // plays the start of the song in the player, then pauses
        await play({
            album: '',
            artist: '',
            duration: 0,
            id: today.songId,
            imageId: null,
            title: '',
        });
        window.setTimeout(() => usePlayerStoreBase.getState().mediaPause(), secs * 1000 + 600);
    };
    const send = (giveUp = false) =>
        auth &&
        post(`${url}/api/daily-guess?date=${localDate()}`, { ...auth, giveUp, guess })
            .then((r) => {
                setTries(r.tries);
                setGuess('');
                if (r.right) setWon(true);
                if (r.answer) setAnswer(r.answer);
                if (!r.right && !r.done) toast.info({ message: 'Not it - listen to a bit more' });
            })
            .catch((e: Error & { answer?: unknown }) => fail(e));
    return (
        <Card icon="🎯" title="Today's song">
            <Stack gap={6}>
                {!today?.songId ? (
                    <Text isMuted size="sm">
                        Play some songs first - the daily song is one the group played.
                    </Text>
                ) : answer ? (
                    <Text size="sm">
                        {won ? `Got it in ${tries}!` : 'It was'} <b>{answer.title}</b> -{' '}
                        {answer.artist}
                    </Text>
                ) : (
                    <>
                        <Text isMuted size="xs">
                            Guess the song from its first{' '}
                            {SNIPPETS[Math.min(tries, SNIPPETS.length - 1)]} second
                            {tries ? 's' : ''}. Six tries, points for getting it.
                        </Text>
                        <Button onClick={listen} size="xs" variant="default" w="fit-content">
                            ▶ Listen
                        </Button>
                        <Group gap="xs" wrap="nowrap">
                            <TextInput
                                onChange={(e) => setGuess(e.currentTarget.value)}
                                onKeyDown={(e) => e.key === 'Enter' && guess.trim() && send()}
                                placeholder="The song's name"
                                size="xs"
                                style={{ flex: 1 }}
                                value={guess}
                            />
                            <Button disabled={!guess.trim()} onClick={() => send()} size="xs">
                                Guess
                            </Button>
                        </Group>
                        <Button
                            onClick={() => send(true)}
                            size="compact-xs"
                            variant="subtle"
                            w="fit-content"
                        >
                            Give up
                        </Button>
                    </>
                )}
                {!!today?.results.length && (
                    <Text isMuted size="xs">
                        Today:{' '}
                        {today.results
                            .map((r) => `${r.name} ${r.won ? `${r.tries}/6` : 'X'}`)
                            .join(', ')}
                    </Text>
                )}
            </Stack>
        </Card>
    );
};

// ---------- Hub: album club ----------
interface Club {
    album: { artist: string; id: string; imageId: null | string; name: string };
    by: string;
    ratings: Record<string, { name: string; note?: string; stars: number }>;
}
export const AlbumClubCard = () => {
    const url = useHermesUrl();
    const auth = useMeAuth();
    const qc = useQueryClient();
    const data = useQuery({
        enabled: !!url,
        queryFn: async () =>
            (await (await fetch(`${url}/api/album-club`)).json()) as { club: Club | null },
        queryKey: ['sour-album-club', url],
    }).data;
    const [note, setNote] = useState('');
    const refresh = () => qc.invalidateQueries({ queryKey: ['sour-album-club', url] });
    const club = data?.club;
    const ratings = club ? Object.values(club.ratings) : [];
    const avg = ratings.length
        ? (ratings.reduce((a, r) => a + r.stars, 0) / ratings.length).toFixed(1)
        : null;
    return (
        <Card icon="💿" title="Album club">
            {club ? (
                <Stack gap={6}>
                    <Group gap="sm" wrap="nowrap">
                        <SongCover
                            size={56}
                            song={{
                                album: club.album.name,
                                artist: club.album.artist,
                                duration: 0,
                                id: club.album.id,
                                imageId: club.album.imageId,
                                title: club.album.name,
                            }}
                        />
                        <div style={{ minWidth: 0 }}>
                            <Text fw={700} truncate>
                                {club.album.name}
                            </Text>
                            <Text isMuted size="xs">
                                {club.album.artist} - picked by {club.by}
                                {avg ? ` - ${avg}★ from ${ratings.length}` : ''}
                            </Text>
                        </div>
                    </Group>
                    <Group gap={2}>
                        {[1, 2, 3, 4, 5].map((n) => (
                            <Button
                                key={n}
                                onClick={() =>
                                    auth &&
                                    post(`${url}/api/album-club/rate`, { ...auth, note, stars: n })
                                        .then(refresh)
                                        .catch(fail)
                                }
                                size="compact-sm"
                                variant="subtle"
                            >
                                {'★'.repeat(n)}
                            </Button>
                        ))}
                    </Group>
                    <TextInput
                        onChange={(e) => setNote(e.currentTarget.value)}
                        placeholder="What did you think? (optional, then pick stars)"
                        size="xs"
                        value={note}
                    />
                    {ratings.map((r) => (
                        <Text isMuted key={r.name} size="xs">
                            {r.name}: {'★'.repeat(r.stars)} {r.note ?? ''}
                        </Text>
                    ))}
                </Stack>
            ) : (
                <Stack gap={6}>
                    <Text isMuted size="sm">
                        Pick this week&#39;s album - everyone listens and rates it.
                    </Text>
                    <AlbumOfWeekPicker
                        onChange={(v) =>
                            v &&
                            auth &&
                            post(`${url}/api/album-club`, {
                                ...auth,
                                album: {
                                    artist: v.artist,
                                    id: v.id,
                                    imageId: v.imageId,
                                    name: v.title,
                                },
                            })
                                .then(refresh)
                                .catch(fail)
                        }
                        value={null}
                    />
                </Stack>
            )}
        </Card>
    );
};

// ---------- Stage / player: hot takes on the playing song ----------
export const HotTake = ({ songId }: { songId?: string }) => {
    const url = useHermesUrl();
    const myName = useMyProfile().data?.name;
    const auth = useMeAuth();
    const qc = useQueryClient();
    const data = useQuery({
        enabled: !!url && !!songId,
        queryFn: async () =>
            (await (
                await fetch(`${url}/api/hot-takes?id=${encodeURIComponent(songId || '')}`)
            ).json()) as {
                avg: null | number;
                count: number;
                ratings: { name: string; stars: number }[];
            },
        queryKey: ['sour-hot-take', url, songId],
    }).data;
    const mine = data?.ratings.find((r) => r.name === myName)?.stars;
    if (!songId || !auth) return null;
    const outlier = mine && data?.avg && Math.abs(mine - data.avg) >= 2 && data.count >= 3;
    return (
        <span className={styles.take} title="Rate it - see how the group rates it">
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    className={n <= (mine || 0) ? styles.starOn : styles.star}
                    key={n}
                    onClick={() =>
                        post(`${url}/api/hot-takes`, { ...auth, id: songId, stars: n })
                            .then(() =>
                                qc.invalidateQueries({ queryKey: ['sour-hot-take', url, songId] }),
                            )
                            .catch(fail)
                    }
                    type="button"
                >
                    ★
                </button>
            ))}
            {data?.avg != null && (
                <span>
                    {' '}
                    group {data.avg}★{outlier ? ' - hot take!' : ''}
                </span>
            )}
        </span>
    );
};

// ---------- Hub: who's up late ----------
export const WhosUpCard = () => {
    const profiles = (useSourProfiles().data ?? []).filter((p) => p.online);
    const h = new Date().getHours();
    if (h >= 6 && h < 23) return null;
    return (
        <Card icon="🌙" title="Who's up">
            <Text size="sm">
                {profiles.length ? profiles.map((p) => p.name).join(', ') : 'Just you. Go to bed?'}
            </Text>
        </Card>
    );
};

// ---------- Home on Mondays: the week in the group ----------
export const WeeklyDigest = () => {
    const profiles = useSourProfiles().data ?? [];
    if (new Date().getDay() !== 1) return null;
    const rows = profiles.filter((p) => p.stats?.topSongs?.length).slice(0, 6);
    if (!rows.length) return null;
    return (
        <div className={styles.digest}>
            <Text className={styles.label}>Last week in the group</Text>
            {rows.map((p) => (
                <Text key={p.id} size="sm">
                    <b>{p.name}</b> was into {p.stats?.topSongs[0]?.title} -{' '}
                    {p.stats?.topSongs[0]?.artist}
                </Text>
            ))}
        </div>
    );
};
