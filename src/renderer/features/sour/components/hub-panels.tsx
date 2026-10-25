import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import styles from './hub.module.css';

import { saveAsPlaylist } from '/@/renderer/features/group-play/components/group-extras';
import { type GroupSong } from '/@/renderer/features/group-play/store/group-play.store';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { type Duel, socialApi } from '/@/renderer/features/sour/api/social-api';
import {
    avatarUrl,
    type RequestGuess,
    tasteMatch,
    timeAgo,
} from '/@/renderer/features/sour/api/sour-api';
import { openProfile } from '/@/renderer/features/sour/components/people';
import {
    hue,
    ProfileAvatar,
    SongCover,
    usePlaySong,
} from '/@/renderer/features/sour/components/profile-bits';
import { RequestQuestion } from '/@/renderer/features/sour/components/request-question';
import { openRecap } from '/@/renderer/features/sour/components/social';
import { SongPicker } from '/@/renderer/features/sour/components/song-picker';
import { useSourProfiles, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { useCurrentServer } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Select } from '/@/shared/components/select/select';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

const ACTIVITY_EMOJI: Record<string, string> = {
    duel: '⚔️',
    gift: '\u{1F381}',
    hotseat: '\u{1F525}',
    repeat: '\u{1F501}',
    wrapped: '\u{1F389}',
};

export const Card = ({
    children,
    icon,
    title,
}: {
    children: ReactNode;
    icon?: string;
    title: string;
}) => (
    <section className={styles.card}>
        <div className={styles.cardTitle}>
            {icon && <span className={styles.emoji}>{icon}</span>}
            {title}
        </div>
        {children}
    </section>
);

const fail = (error: Error) => toast.error({ message: error.message });

const SongRow = ({ extra, song }: { extra?: ReactNode; song: GroupSong }) => {
    const play = usePlaySong();
    return (
        <div className={styles.row}>
            <SongCover size={36} song={song} />
            <div className={styles.grow}>
                <Text size="sm" truncate>
                    {song.title}
                </Text>
                <Text isMuted size="xs" truncate>
                    {song.artist}
                </Text>
            </div>
            {extra}
            <Button onClick={() => play(song)} size="compact-xs" variant="subtle">
                Play
            </Button>
        </div>
    );
};

const useFriends = () => {
    const me = useSourStore((s) => s.me);
    const profiles = useSourProfiles().data ?? [];
    return profiles.filter((p) => p.id !== me?.id);
};

// ---------- feed ----------
const FEED_FILTERS = [
    { label: 'All', value: 'all' },
    { label: 'Music', value: 'music' },
    { label: 'Games', value: 'games' },
    { label: 'Requests', value: 'requests' },
];
const feedKind = (type: string) =>
    ['club', 'duel', 'guess', 'hotseat', 'poll'].includes(type)
        ? 'games'
        : type === 'request' || type === 'added'
          ? 'requests'
          : 'music';
const FEED_REACTS = ['🔥', '😂', '😍', '💀'];

export const FeedPanel = () => {
    const url = useHermesUrl();
    const play = usePlaySong();
    const me = useSourStore((s) => s.me);
    const qc = useQueryClient();
    const [filter, setFilter] = useState('all');
    const react = (id: string, emoji: string) =>
        me &&
        fetch(`${url}/api/activity/react`, {
            body: JSON.stringify({ emoji, id, key: me.key, profile: me.id }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        }).then(() => qc.invalidateQueries({ queryKey: ['sour-activity', url] }));
    const feed = useQuery({
        enabled: !!url,
        queryFn: () => socialApi.activity(url),
        queryKey: ['sour-activity', url],
        refetchInterval: 30000,
    });
    return (
        <Card icon={'\u{1F4E3}'} title="What the group is up to">
            <SegmentedControl data={FEED_FILTERS} onChange={setFilter} size="xs" value={filter} />
            <div className={styles.list}>
                {(feed.data ?? [])
                    .filter((a) => filter === 'all' || feedKind(a.type) === filter)
                    .map((a) => (
                        <div className={styles.row} key={a.id}>
                            <span className={styles.emoji}>
                                {ACTIVITY_EMOJI[a.type] ?? '\u{1F34B}'}
                            </span>
                            <div className={styles.grow}>
                                <Text size="sm">
                                    <b>{a.byName ?? 'Someone'}</b> {a.text}
                                </Text>
                                <span className={styles.muted}>{timeAgo(a.at)}</span>
                                <span className={styles.muted} style={{ marginLeft: 8 }}>
                                    {FEED_REACTS.map((e) => {
                                        const n = (a as { reactions?: Record<string, string[]> })
                                            .reactions?.[e]?.length;
                                        return (
                                            <button
                                                key={e}
                                                onClick={() => react(a.id, e)}
                                                style={{
                                                    background: 'none',
                                                    border: 0,
                                                    color: 'inherit',
                                                    cursor: 'pointer',
                                                    opacity: n ? 1 : 0.45,
                                                    padding: '0 2px',
                                                }}
                                                type="button"
                                            >
                                                {e}
                                                {n ? ` ${n}` : ''}
                                            </button>
                                        );
                                    })}
                                </span>
                            </div>
                            {a.song && (
                                <button
                                    className={styles.option}
                                    onClick={() => a.song && play(a.song)}
                                    title={`Play ${a.song.title}`}
                                    type="button"
                                >
                                    <SongCover size={28} song={a.song} />
                                </button>
                            )}
                        </div>
                    ))}
                {feed.isFetched && !feed.data?.length && (
                    <Text isMuted size="sm">
                        Nothing yet. Send someone a song, start a duel or guess today&apos;s hot
                        seat.
                    </Text>
                )}
                {feed.isError && (
                    <Text isMuted size="sm">
                        Hermes Music needs updating (3.1) for the feed.
                    </Text>
                )}
            </div>
        </Card>
    );
};

export const ColorOfTheDay = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const qc = useQueryClient();
    const data = useQuery({
        enabled: !!url,
        queryFn: () => socialApi.dailyColor(url, me),
        queryKey: ['sour-daily-color', url, me?.id],
        refetchInterval: 120000,
    }).data;
    if (!data) return null;
    return (
        <Card icon={'\u{1F3A8}'} title="Colour of the day">
            <Group gap="sm">
                <span
                    className={styles.swatch}
                    style={{ background: data.today, cursor: 'default' }}
                />
                <Text size="sm">Today&apos;s colour. Vote for tomorrow&apos;s:</Text>
            </Group>
            <div className={styles.swatches}>
                {data.choices.map((c) => (
                    <button
                        aria-label={`Vote for ${c}`}
                        className={clsx(styles.swatch, { [styles.swatchMine]: data.myVote === c })}
                        key={c}
                        onClick={() =>
                            me &&
                            socialApi
                                .voteColor(url, me, c)
                                .then(() =>
                                    qc.invalidateQueries({ queryKey: ['sour-daily-color'] }),
                                )
                                .catch(fail)
                        }
                        style={{ background: c }}
                        type="button"
                    >
                        {!!data.votes[c] && (
                            <span className={styles.swatchCount}>{data.votes[c]}</span>
                        )}
                    </button>
                ))}
            </div>
            <span className={styles.muted}>
                Turn on Sour Studio &gt; Extras &gt; Colour of the day to wear it.
            </span>
        </Card>
    );
};

export const WrappedNightCard = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const qc = useQueryClient();
    const [when, setWhen] = useState('');
    const night = useQuery({
        enabled: !!url,
        queryFn: () => socialApi.wrapped(url),
        queryKey: ['sour-wrapped', url],
        refetchInterval: 60000,
    }).data;
    const refresh = () => qc.invalidateQueries({ queryKey: ['sour-wrapped'] });
    return (
        <Card icon={'\u{1F389}'} title="Recap night">
            {night?.at ? (
                <>
                    <Text size="sm">
                        {night.byName} planned a recap night: everyone opens their recap together on{' '}
                        <b>
                            {new Date(night.at).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                            })}
                        </b>
                        .
                    </Text>
                    <Group gap="xs">
                        <Button onClick={openRecap} size="xs" variant="default">
                            Open my recap
                        </Button>
                        {me && night.by === me.id && (
                            <Button
                                onClick={() =>
                                    me &&
                                    socialApi.wrappedNight(url, me, null).then(refresh).catch(fail)
                                }
                                size="xs"
                                variant="subtle"
                            >
                                Cancel it
                            </Button>
                        )}
                    </Group>
                </>
            ) : (
                <>
                    <Text size="sm">
                        Pick a time and everyone gets a countdown, then opens their recap together.
                    </Text>
                    <Group gap="xs">
                        <TextInput
                            onChange={(e) => setWhen(e.currentTarget.value)}
                            size="xs"
                            type="datetime-local"
                            value={when}
                        />
                        <Button
                            disabled={!when || !me}
                            onClick={() =>
                                me &&
                                socialApi
                                    .wrappedNight(url, me, new Date(when).getTime())
                                    .then(refresh)
                                    .catch(fail)
                            }
                            size="xs"
                            variant="default"
                        >
                            Plan it
                        </Button>
                    </Group>
                </>
            )}
        </Card>
    );
};

// ---------- hot seat ----------
export const HotSeatCard = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const qc = useQueryClient();
    const hs = useQuery({
        enabled: !!url,
        queryFn: () => socialApi.hotSeat(url, me),
        queryKey: ['sour-hotseat', url, me?.id],
        refetchInterval: 120000,
    });
    const data = hs.data;
    if (hs.isFetched && !data) {
        return (
            <Card icon={'\u{1F525}'} title="Hot seat">
                <Text isMuted size="sm">
                    Not enough listening yet. Tomorrow someone is in the hot seat and everyone
                    guesses their most played song.
                </Text>
            </Card>
        );
    }
    if (!data) return null;
    const mine = me?.id === data.profile.id;
    return (
        <Card icon={'\u{1F525}'} title={`Hot seat: ${data.profile.name}`}>
            <Text size="sm">
                {mine
                    ? "You're in the hot seat today. Everyone's guessing your most played song."
                    : `What's ${data.profile.name}'s most played song?`}{' '}
                <span className={styles.muted}>{data.guesses} guessed so far</span>
            </Text>
            <div className={styles.options}>
                {data.options.map((o) => (
                    <button
                        className={clsx(styles.option, {
                            [styles.right]: !!data.answer && o.id === data.answer,
                            [styles.wrong]:
                                !!data.guessed && o.id === data.guessed && o.id !== data.answer,
                        })}
                        disabled={mine || !!data.guessed || !me}
                        key={o.id}
                        onClick={() =>
                            me &&
                            socialApi
                                .guessHotSeat(url, me, o.id)
                                .then((r) => {
                                    toast[r.right ? 'success' : 'info']({
                                        message: r.right
                                            ? 'You got it!'
                                            : `Not that one - see the answer`,
                                    });
                                    qc.invalidateQueries({ queryKey: ['sour-hotseat'] });
                                })
                                .catch(fail)
                        }
                        type="button"
                    >
                        <SongCover size={36} song={o} />
                        <div className={styles.grow}>
                            <Text size="sm" truncate>
                                {o.title}
                            </Text>
                            <Text isMuted size="xs" truncate>
                                {o.artist}
                            </Text>
                        </div>
                    </button>
                ))}
            </div>
            {data.results && data.results.length > 0 && (
                <span className={styles.muted}>
                    {data.results.map((r) => `${r.name} ${r.right ? '✔' : '✖'}`).join('  ')}
                </span>
            )}
        </Card>
    );
};

// ---------- duels and the Hall of Fame ----------
const timeLeft = (ends: number) => {
    const m = Math.max(0, Math.round((ends - Date.now()) / 60000));
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${m} min left`;
};

const DuelCard = ({ duel }: { duel: Duel }) => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const qc = useQueryClient();
    const [answer, setAnswer] = useState<GroupSong | null>(null);
    const refresh = () => qc.invalidateQueries({ queryKey: ['sour-duels'] });
    const total = duel.votes.a + duel.votes.b || 1;
    const canAnswer =
        !!me && !duel.b && duel.a.by !== me.id && (!duel.opponent || duel.opponent === me.id);
    const canVote = !!me && !!duel.b && !duel.winner && me.id !== duel.a.by && me.id !== duel.b.by;
    const side = (key: 'a' | 'b') => {
        const s = duel[key];
        if (!s) {
            return (
                <div className={styles.side}>
                    <Text isMuted size="sm">
                        {duel.opponentName
                            ? `Waiting for ${duel.opponentName}`
                            : 'Waiting for anyone to answer'}
                    </Text>
                    {canAnswer && (
                        <>
                            <SongPicker onPick={setAnswer} picked={answer} />
                            <Button
                                disabled={!answer}
                                onClick={() =>
                                    me &&
                                    answer &&
                                    socialApi
                                        .answerDuel(url, me, duel.id, answer)
                                        .then(refresh)
                                        .catch(fail)
                                }
                                size="xs"
                            >
                                Answer with this song
                            </Button>
                        </>
                    )}
                </div>
            );
        }
        return (
            <div className={clsx(styles.side, { [styles.winner]: duel.winner === key })}>
                <SongCover size={64} song={s.song} />
                <Text fw={600} size="sm" truncate>
                    {s.song.title}
                </Text>
                <span className={styles.muted}>
                    {s.song.artist} - picked by {s.byName}
                </span>
                {duel.b && (
                    <div className={styles.bar}>
                        <div style={{ width: `${(duel.votes[key] / total) * 100}%` }} />
                    </div>
                )}
                {duel.b && <span className={styles.muted}>{duel.votes[key]} votes</span>}
                {canVote && (
                    <Button
                        onClick={() =>
                            me &&
                            socialApi.voteDuel(url, me, duel.id, key).then(refresh).catch(fail)
                        }
                        size="compact-xs"
                        variant={duel.myVote === key ? 'filled' : 'default'}
                    >
                        {duel.myVote === key ? 'Your vote' : 'Vote'}
                    </Button>
                )}
            </div>
        );
    };
    return (
        <div className={styles.card}>
            <div className={styles.versus}>
                {side('a')}
                <span className={styles.vs}>VS</span>
                {side('b')}
            </div>
            <span className={styles.muted}>
                {duel.winner
                    ? `Over - ${duel[duel.winner]?.byName}'s song won and joined the Hall of Fame`
                    : duel.ends
                      ? timeLeft(duel.ends)
                      : `Started ${timeAgo(duel.created)}`}
            </span>
        </div>
    );
};

export const DuelsPanel = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const friends = useFriends();
    const qc = useQueryClient();
    const serverId = useCurrentServer()?.id;
    const [song, setSong] = useState<GroupSong | null>(null);
    const [opponent, setOpponent] = useState<null | string>(null);
    const duels = useQuery({
        enabled: !!url,
        queryFn: () => socialApi.duels(url, me),
        queryKey: ['sour-duels', url, me?.id],
        refetchInterval: 30000,
    });
    const hall = useQuery({
        enabled: !!url,
        queryFn: () => socialApi.hall(url),
        queryKey: ['sour-hall', url],
    });
    return (
        <div className={styles.columns}>
            <div className={styles.list}>
                <Card icon={'⚔️'} title="Start a song duel">
                    <Text isMuted size="sm">
                        You pick a song, someone answers with theirs, the group votes for a day. The
                        winner goes into the Hall of Fame.
                    </Text>
                    <SongPicker onPick={setSong} picked={song} />
                    <Group gap="xs">
                        <Select
                            data={[
                                { label: 'Anyone can answer', value: '' },
                                ...friends.map((f) => ({
                                    label: `Challenge ${f.name}`,
                                    value: f.id,
                                })),
                            ]}
                            onChange={(v) => setOpponent(v || null)}
                            size="xs"
                            value={opponent ?? ''}
                        />
                        <Button
                            disabled={!song || !me}
                            onClick={() =>
                                me &&
                                song &&
                                socialApi
                                    .startDuel(url, me, song, opponent)
                                    .then(() => {
                                        setSong(null);
                                        qc.invalidateQueries({ queryKey: ['sour-duels'] });
                                    })
                                    .catch(fail)
                            }
                            size="xs"
                        >
                            Start the duel
                        </Button>
                    </Group>
                </Card>
                {(duels.data ?? []).map((d) => (
                    <DuelCard duel={d} key={d.id} />
                ))}
            </div>
            <Card icon={'\u{1F3C6}'} title="Hall of Fame">
                {(hall.data ?? []).map((h, i) => (
                    <SongRow
                        extra={<span className={styles.muted}>{h.byName}</span>}
                        key={`${h.song.id}-${i}`}
                        song={h.song}
                    />
                ))}
                {!hall.data?.length && (
                    <Text isMuted size="sm">
                        Duel winners land here.
                    </Text>
                )}
                {!!hall.data?.length && serverId && (
                    <Button
                        onClick={() =>
                            saveAsPlaylist(
                                serverId,
                                'Sour Hall of Fame',
                                (hall.data ?? []).map((h) => h.song),
                            )
                                .then(() =>
                                    toast.success({
                                        message: 'Saved as the playlist "Sour Hall of Fame"',
                                    }),
                                )
                                .catch(fail)
                        }
                        size="xs"
                        variant="default"
                    >
                        Save as a playlist
                    </Button>
                )}
            </Card>
        </div>
    );
};

// ---------- gifts, capsules and "play this next" ----------
export const GiftsPanel = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const friends = useFriends();
    const qc = useQueryClient();
    const play = usePlaySong();
    const [to, setTo] = useState<null | string>(null);
    const [song, setSong] = useState<GroupSong | null>(null);
    const [note, setNote] = useState('');
    const [mode, setMode] = useState<'ask' | 'gift'>('gift');
    const gifts = useQuery({
        enabled: !!url && !!me,
        queryFn: () =>
            me ? socialApi.gifts(url, me) : Promise.resolve({ received: [], sent: [] }),
        queryKey: ['sour-gifts', url, me?.id],
        refetchInterval: 30000,
    });
    const asks = useQuery({
        enabled: !!url && !!me,
        queryFn: () => (me ? socialApi.asks(url, me) : Promise.resolve({ received: [], sent: [] })),
        queryKey: ['sour-asks', url, me?.id],
        refetchInterval: 30000,
    });
    const send = () => {
        if (!me || !to || !song) return;
        const done = () => {
            setSong(null);
            setNote('');
            qc.invalidateQueries({ queryKey: [mode === 'gift' ? 'sour-gifts' : 'sour-asks'] });
            toast.success({ message: mode === 'gift' ? 'Gift sent' : 'Asked' });
        };
        (mode === 'gift'
            ? socialApi.gift(url, me, to, song, note)
            : socialApi.ask(url, me, to, song)
        )
            .then(done)
            .catch(fail);
    };
    return (
        <div className={styles.columns}>
            <div className={styles.list}>
                <Card icon={'\u{1F381}'} title="Send a friend a song">
                    <Group gap="xs">
                        <Button
                            onClick={() => setMode('gift')}
                            size="compact-xs"
                            variant={mode === 'gift' ? 'filled' : 'default'}
                        >
                            Gift it (they unwrap it)
                        </Button>
                        <Button
                            onClick={() => setMode('ask')}
                            size="compact-xs"
                            variant={mode === 'ask' ? 'filled' : 'default'}
                        >
                            Ask them to play it next
                        </Button>
                    </Group>
                    <Select
                        data={friends.map((f) => ({ label: f.name, value: f.id }))}
                        onChange={setTo}
                        placeholder="Who's it for?"
                        size="xs"
                        value={to}
                    />
                    <SongPicker onPick={setSong} picked={song} />
                    {mode === 'gift' && (
                        <TextInput
                            maxLength={200}
                            onChange={(e) => setNote(e.currentTarget.value)}
                            placeholder="A note (optional)"
                            size="xs"
                            value={note}
                        />
                    )}
                    <Button disabled={!to || !song || !me} onClick={send} size="xs">
                        {mode === 'gift' ? 'Send the gift' : 'Send the ask'}
                    </Button>
                </Card>
                <Card icon={'\u{1F4E8}'} title="Gifts for you">
                    {(gifts.data?.received ?? []).map((g) =>
                        g.opened ? (
                            <SongRow
                                extra={<span className={styles.muted}>from {g.fromName}</span>}
                                key={g.id}
                                song={g.song}
                            />
                        ) : (
                            <button
                                className={styles.wrapped}
                                key={g.id}
                                onClick={() =>
                                    me &&
                                    socialApi
                                        .openGift(url, me, g.id)
                                        .then((opened) => {
                                            qc.invalidateQueries({ queryKey: ['sour-gifts'] });
                                            play(opened.song);
                                            toast.success({
                                                message: `${g.fromName} sent you ${opened.song.title}${opened.note ? `: "${opened.note}"` : ''}`,
                                            });
                                        })
                                        .catch(fail)
                                }
                                type="button"
                            >
                                <span className={styles.emoji}>{'\u{1F381}'}</span>
                                <Text fw={700} size="sm">
                                    A gift from {g.fromName}
                                </Text>
                                <span className={styles.muted}>Click to unwrap</span>
                            </button>
                        ),
                    )}
                    {!gifts.data?.received.length && (
                        <Text isMuted size="sm">
                            No gifts yet.
                        </Text>
                    )}
                </Card>
            </div>
            <div className={styles.list}>
                <Card icon={'\u{1F4E4}'} title="You sent">
                    {(gifts.data?.sent ?? []).slice(0, 12).map((g) => (
                        <SongRow
                            extra={
                                <span
                                    className={styles.muted}
                                >{`to ${g.toName}${g.opened ? ' - unwrapped' : ''}`}</span>
                            }
                            key={g.id}
                            song={g.song}
                        />
                    ))}
                    {(asks.data?.sent ?? []).map((a) => (
                        <SongRow
                            extra={
                                <span
                                    className={styles.muted}
                                >{`asked ${a.toName}: ${a.status === 'waiting' ? 'waiting' : a.status === 'played' ? 'queued it' : 'said no'}`}</span>
                            }
                            key={a.id}
                            song={a.song}
                        />
                    ))}
                    {!gifts.data?.sent.length && !asks.data?.sent.length && (
                        <Text isMuted size="sm">
                            Nothing sent yet.
                        </Text>
                    )}
                </Card>
                <CapsulesCard />
            </div>
        </div>
    );
};

const CapsulesCard = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const friends = useFriends();
    const qc = useQueryClient();
    const [to, setTo] = useState<null | string>('group');
    const [song, setSong] = useState<GroupSong | null>(null);
    const [note, setNote] = useState('');
    const [when, setWhen] = useState('');
    const caps = useQuery({
        enabled: !!url && !!me,
        queryFn: () => (me ? socialApi.capsules(url, me) : Promise.resolve([])),
        queryKey: ['sour-capsules', url, me?.id],
        refetchInterval: 60000,
    });
    return (
        <Card icon={'⏳'} title="Time capsules">
            <Text isMuted size="sm">
                A song and a note that stay locked until the date you pick.
            </Text>
            <Select
                data={[
                    { label: 'The whole group', value: 'group' },
                    ...friends.map((f) => ({ label: f.name, value: f.id })),
                ]}
                onChange={setTo}
                size="xs"
                value={to}
            />
            <SongPicker onPick={setSong} picked={song} />
            <TextInput
                maxLength={500}
                onChange={(e) => setNote(e.currentTarget.value)}
                placeholder="A note for later"
                size="xs"
                value={note}
            />
            <Group gap="xs">
                <TextInput
                    onChange={(e) => setWhen(e.currentTarget.value)}
                    size="xs"
                    type="datetime-local"
                    value={when}
                />
                <Button
                    disabled={!me || !song || !to || !when}
                    onClick={() =>
                        me &&
                        song &&
                        to &&
                        socialApi
                            .capsule(url, me, {
                                note,
                                song,
                                to,
                                unlockAt: new Date(when).getTime(),
                            })
                            .then(() => {
                                setSong(null);
                                setNote('');
                                setWhen('');
                                qc.invalidateQueries({ queryKey: ['sour-capsules'] });
                                toast.success({ message: 'Capsule sealed' });
                            })
                            .catch(fail)
                    }
                    size="xs"
                >
                    Seal it
                </Button>
            </Group>
            {(caps.data ?? []).map((c) =>
                c.locked && !c.song ? (
                    <div className={clsx(styles.row, styles.locked)} key={c.id}>
                        <Icon icon="lock" />
                        <div className={styles.grow}>
                            <Text size="sm">From {c.fromName}</Text>
                            <span className={styles.muted}>
                                Opens {new Date(c.unlockAt).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                ) : c.song ? (
                    <SongRow
                        extra={
                            <span className={styles.muted}>
                                {c.locked
                                    ? `opens ${new Date(c.unlockAt).toLocaleDateString()} for ${c.toName}`
                                    : `from ${c.fromName}${c.note ? `: ${c.note}` : ''}`}
                            </span>
                        }
                        key={c.id}
                        song={c.song}
                    />
                ) : null,
            )}
        </Card>
    );
};

// ---------- taste map ----------
interface Node {
    color: string;
    id: string;
    image: null | string;
    name: string;
    r: number;
    vx: number;
    vy: number;
    x: number;
    y: number;
}

export const TasteMap = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const profiles = (useSourProfiles().data ?? []).filter((p) => p.stats?.topArtists.length);
    const svg = useRef<SVGSVGElement>(null);
    const [, setTick] = useState(0);
    const nodes = useRef<Node[]>([]);
    const key = profiles.map((p) => p.id).join();
    const pairs = useMemo(() => {
        const out: Array<[number, number, number]> = [];
        for (let i = 0; i < profiles.length; i++)
            for (let j = i + 1; j < profiles.length; j++)
                out.push([
                    i,
                    j,
                    (tasteMatch(profiles[i].stats, profiles[j].stats)?.percent ?? 0) / 100,
                ]);
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    useEffect(() => {
        const W = 800;
        const H = 420;
        const maxHours = Math.max(1, ...profiles.map((p) => p.stats?.hoursTotal ?? 0));
        nodes.current = profiles.map((p, i) => ({
            color: `hsl(${hue(p.name)} 60% 50%)`,
            id: p.id,
            image: avatarUrl(url, p),
            name: p.name,
            r: 22 + 18 * Math.sqrt((p.stats?.hoursTotal ?? 0) / maxHours),
            vx: 0,
            vy: 0,
            x: W / 2 + Math.cos((i / profiles.length) * Math.PI * 2) * 150,
            y: H / 2 + Math.sin((i / profiles.length) * Math.PI * 2) * 120,
        }));
        let frame = 0;
        let steps = 0;
        const step = () => {
            const n = nodes.current;
            for (const [i, j, match] of pairs) {
                const a = n[i];
                const b = n[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.max(1, Math.hypot(dx, dy));
                const want = a.r + b.r + 20 + (1 - match) * 260;
                const f = (dist - want) * 0.004;
                a.vx += (dx / dist) * f;
                a.vy += (dy / dist) * f;
                b.vx -= (dx / dist) * f;
                b.vy -= (dy / dist) * f;
            }
            for (const p of n) {
                p.vx += (W / 2 - p.x) * 0.001;
                p.vy += (H / 2 - p.y) * 0.001;
                p.vx *= 0.85;
                p.vy *= 0.85;
                p.x = Math.min(W - p.r, Math.max(p.r, p.x + p.vx));
                p.y = Math.min(H - p.r, Math.max(p.r, p.y + p.vy));
            }
            setTick((t) => t + 1);
            if (++steps < 240) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, pairs, url]);

    const n = nodes.current;
    return (
        <Card icon={'\u{1F5FA}️'} title="Taste map">
            <Text isMuted size="sm">
                Friends with similar taste sit closer together. Bigger bubbles listen more. Click
                someone for their profile.
            </Text>
            {profiles.length < 2 ? (
                <Text isMuted size="sm">
                    Needs at least two people with some listening.
                </Text>
            ) : (
                <svg className={styles.map} ref={svg} viewBox="0 0 800 420">
                    <defs>
                        {n.map((p) => (
                            <clipPath id={`map-${p.id}`} key={p.id}>
                                <circle cx={p.x} cy={p.y} r={p.r} />
                            </clipPath>
                        ))}
                    </defs>
                    {pairs
                        .filter(([, , m]) => m >= 0.25)
                        .map(([i, j, m]) =>
                            n[i] && n[j] ? (
                                <line
                                    key={`${i}-${j}`}
                                    stroke="currentColor"
                                    strokeOpacity={0.1 + m * 0.3}
                                    strokeWidth={1 + m * 3}
                                    x1={n[i].x}
                                    x2={n[j].x}
                                    y1={n[i].y}
                                    y2={n[j].y}
                                />
                            ) : null,
                        )}
                    {n.map((p) => (
                        <g
                            key={p.id}
                            onClick={() => {
                                const prof = profiles.find((x) => x.id === p.id);
                                if (prof) openProfile(prof);
                            }}
                            style={{ cursor: 'pointer' }}
                        >
                            <circle
                                cx={p.x}
                                cy={p.y}
                                fill={p.color}
                                r={p.r}
                                stroke={p.id === me?.id ? 'currentColor' : 'none'}
                                strokeWidth={3}
                            />
                            {p.image ? (
                                <image
                                    clipPath={`url(#map-${p.id})`}
                                    height={p.r * 2}
                                    href={p.image}
                                    preserveAspectRatio="xMidYMid slice"
                                    width={p.r * 2}
                                    x={p.x - p.r}
                                    y={p.y - p.r}
                                />
                            ) : (
                                <text
                                    dominantBaseline="central"
                                    fill="#151515"
                                    fontSize={p.r * 0.8}
                                    fontWeight={700}
                                    textAnchor="middle"
                                    x={p.x}
                                    y={p.y}
                                >
                                    {(p.name[0] || '?').toUpperCase()}
                                </text>
                            )}
                            <text
                                fill="currentColor"
                                fontSize={13}
                                textAnchor="middle"
                                x={p.x}
                                y={p.y + p.r + 15}
                            >
                                {p.id === me?.id ? `${p.name} (you)` : p.name}
                            </text>
                        </g>
                    ))}
                </svg>
            )}
        </Card>
    );
};

// ---------- requests: live progress and who added the most ----------
interface RequestRow {
    artist?: string;
    ask?: RequestGuess;
    by?: string;
    created?: string;
    id: string;
    note?: string;
    progress?: { done: number; failed: number; total: number };
    query: string;
    status: string;
    title?: string;
    type: string;
}

const STEPS = ['pending', 'searching', 'downloading', 'tagging', 'done'];

export const RequestsPanel = () => {
    const url = useHermesUrl();
    const friends = useSourProfiles().data ?? [];
    const requests = useQuery({
        enabled: !!url,
        queryFn: async () => {
            const res = await fetch(`${url}/api/requests`);
            if (!res.ok) throw new Error(`Hermes Music returned ${res.status}`);
            const value = await res.json();
            return (Array.isArray(value) ? value : []) as RequestRow[];
        },
        queryKey: ['sour-requests-tracker', url],
        refetchInterval: 4000,
    });
    const leaders = useQuery({
        enabled: !!url,
        queryFn: () => socialApi.requestLeaders(url),
        queryKey: ['sour-request-leaders', url],
        refetchInterval: 60000,
    });
    return (
        <div className={styles.columns}>
            <Card icon={'\u{1F4E5}'} title="Requests right now">
                {(requests.data ?? []).slice(0, 25).map((r) => {
                    const step = Math.max(0, STEPS.indexOf(r.status));
                    const fraction =
                        r.progress && r.progress.total
                            ? r.progress.done / r.progress.total
                            : r.status === 'done'
                              ? 1
                              : (step + 0.5) / STEPS.length;
                    return (
                        <div className={styles.row} key={r.id}>
                            <div className={styles.grow}>
                                <Text size="sm" truncate>
                                    {r.title
                                        ? `${r.title}${r.artist ? ` - ${r.artist}` : ''}`
                                        : r.query}
                                </Text>
                                <span className={styles.muted}>
                                    {r.type !== 'song' ? `${r.type} - ` : ''}
                                    {r.status === 'failed'
                                        ? `couldn't get it${r.note ? `: ${r.note}` : ''}`
                                        : r.status === 'ask'
                                          ? 'Hermes Music needs your answer'
                                          : r.status}
                                    {r.progress && r.progress.total
                                        ? ` - ${r.progress.done} of ${r.progress.total}`
                                        : ''}
                                    {r.by ? ` - asked by ${r.by}` : ''}
                                </span>
                                {r.status === 'ask' && r.ask && (
                                    <RequestQuestion ask={r.ask} id={r.id} />
                                )}
                                {r.status !== 'failed' && r.status !== 'ask' && (
                                    <div className={styles.progress}>
                                        <div
                                            style={{
                                                width: `${Math.round(Math.min(1, fraction) * 100)}%`,
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                {requests.isFetched && !requests.data?.length && (
                    <Text isMuted size="sm">
                        Nothing requested yet - the + button in the player bar asks Hermes Music for
                        music.
                    </Text>
                )}
            </Card>
            <Card icon={'\u{1F4DA}'} title="Who added the most this month">
                {(leaders.data ?? []).map((l, i) => {
                    const prof = friends.find((f) => f.id === l.profile);
                    return (
                        <div className={styles.row} key={l.name}>
                            <Text fw={700} size="sm" w={22}>
                                {i + 1}
                            </Text>
                            {prof ? (
                                <ProfileAvatar profile={prof} size={28} />
                            ) : (
                                <span className={styles.emoji}>{'\u{1F34B}'}</span>
                            )}
                            <div className={styles.grow}>
                                <Text size="sm" truncate>
                                    {l.name}
                                </Text>
                            </div>
                            <span className={styles.muted}>
                                {l.songs} songs, {l.requests} requests
                            </span>
                        </div>
                    );
                })}
                {!leaders.data?.length && (
                    <Text isMuted size="sm">
                        No requests this month yet.
                    </Text>
                )}
            </Card>
        </div>
    );
};
