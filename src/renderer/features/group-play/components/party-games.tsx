import { useEffect, useState } from 'react';

import styles from './party-games.module.css';

import { groupApi } from '/@/renderer/features/group-play/api/group-play-api';
import {
    type GroupGame,
    type GroupSong,
    type GroupState,
    useGroupPlayStore,
} from '/@/renderer/features/group-play/store/group-play.store';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { SongPicker } from '/@/renderer/features/sour/components/song-picker';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Slider } from '/@/shared/components/slider/slider';
import { Stack } from '/@/shared/components/stack/stack';
import { Switch } from '/@/shared/components/switch/switch';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

const who = () => {
    const { hostKey, member, role } = useGroupPlayStore.getState();
    return role === 'host' ? { hostKey } : { member };
};

const GAMES: { hint: string; kind: GroupGame['kind']; label: string }[] = [
    { hint: 'Two songs, everyone votes, the winner plays next', kind: 'battle', label: 'Battle' },
    { hint: 'A theme, everyone adds one song that fits', kind: 'rounds', label: 'Rounds' },
    { hint: 'One person picks the next 3 songs', kind: 'hotseat', label: 'Hot seat' },
    {
        hint: 'Rank the last few songs, results at the end',
        kind: 'ranking',
        label: 'Blind ranking',
    },
    { hint: 'Suggest and vote for 90 seconds', kind: 'countdown', label: 'Request countdown' },
    { hint: 'A card of artists from the queue', kind: 'bingo', label: 'Bingo' },
];

const useNow = (on: boolean) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!on) return undefined;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [on]);
    return now;
};

// The mood dial, party games and quiet mode, under the room's queue
export const PartyGames = ({ state }: { state: GroupState }) => {
    const url = useHermesUrl();
    const code = useGroupPlayStore((s) => s.code) || '';
    const myName = useGroupPlayStore((s) =>
        s.role === 'host' ? state.host : state.members.find((m) => m.id === s.member)?.name,
    );
    const quiet = useSourStore((s) => !!s.groupQuiet);
    const [mood, setMood] = useState(state.mood?.avg ?? 50);
    const [setup, setSetup] = useState<GroupGame['kind'] | null>(null);
    const [theme, setTheme] = useState('');
    const [a, setA] = useState<GroupSong | null>(null);
    const [b, setB] = useState<GroupSong | null>(null);
    const [pick, setPick] = useState<GroupSong | null>(null);
    const [order, setOrder] = useState<string[]>([]);
    const game = state.game;
    const offset = useGroupPlayStore((s) => s.clockOffset) || 0;
    const now = useNow(!!game?.ends && !game.result);

    const send = (body: Record<string, unknown>) =>
        groupApi
            .game(url, code, who(), body)
            .catch((e: Error) => toast.error({ message: e.message }));
    const start = (kind: GroupGame['kind'], extra: Record<string, unknown> = {}) =>
        send({ kind, op: 'start', ...extra }).then(() => {
            setSetup(null);
            setA(null);
            setB(null);
            setTheme('');
        });

    useEffect(() => {
        if (game?.kind === 'ranking') setOrder(game.songs.map((s) => s.id));
    }, [game?.kind, game?.started]); // eslint-disable-line react-hooks/exhaustive-deps

    const left = game?.ends ? Math.max(0, Math.round((game.ends - (now + offset)) / 1000)) : 0;
    const moodWord = (v: number) =>
        v < 25 ? 'Chill' : v < 50 ? 'Easy' : v < 75 ? 'Upbeat' : 'Hype';

    return (
        <Stack className={styles.box} gap="xs">
            <Group justify="space-between" wrap="nowrap">
                <Text fw={700} size="sm">
                    Party
                </Text>
                <Switch
                    checked={quiet}
                    label="Quiet mode"
                    onChange={(e) =>
                        useSourStore.getState().set({ groupQuiet: e.currentTarget.checked })
                    }
                    size="xs"
                />
            </Group>
            <Stack gap={2}>
                <Text isMuted size="xs">
                    Mood dial: the room is{' '}
                    <b>
                        {state.mood
                            ? `${moodWord(state.mood.avg)} (${state.mood.count})`
                            : 'not set'}
                    </b>
                </Text>
                <Slider
                    label={moodWord}
                    max={100}
                    min={0}
                    onChange={setMood}
                    onChangeEnd={(v) =>
                        groupApi
                            .mood(url, code, who(), v)
                            .catch((e: Error) => toast.error({ message: e.message }))
                    }
                    value={mood}
                />
            </Stack>

            {!game && !setup && (
                <div className={styles.games}>
                    {GAMES.map((g) => (
                        <button
                            className={styles.game}
                            key={g.kind}
                            onClick={() =>
                                ['battle', 'rounds'].includes(g.kind)
                                    ? setSetup(g.kind)
                                    : start(g.kind)
                            }
                            title={g.hint}
                            type="button"
                        >
                            <b>{g.label}</b>
                            <span>{g.hint}</span>
                        </button>
                    ))}
                </div>
            )}

            {setup === 'battle' && (
                <Stack gap={6}>
                    <Text size="xs">Pick the two songs to battle</Text>
                    <SongPicker onPick={setA} picked={a} />
                    <SongPicker onPick={setB} picked={b} />
                    <Group gap="xs">
                        <Button
                            disabled={!a || !b}
                            onClick={() => start('battle', { a, b })}
                            size="xs"
                        >
                            Start the battle
                        </Button>
                        <Button onClick={() => setSetup(null)} size="xs" variant="subtle">
                            Cancel
                        </Button>
                    </Group>
                </Stack>
            )}
            {setup === 'rounds' && (
                <Group gap="xs" wrap="nowrap">
                    <TextInput
                        onChange={(e) => setTheme(e.currentTarget.value)}
                        placeholder="Theme, e.g. songs from 2014"
                        size="xs"
                        style={{ flex: 1 }}
                        value={theme}
                    />
                    <Button
                        disabled={!theme.trim()}
                        onClick={() => start('rounds', { theme })}
                        size="xs"
                    >
                        Start
                    </Button>
                    <Button onClick={() => setSetup(null)} size="xs" variant="subtle">
                        Cancel
                    </Button>
                </Group>
            )}

            {game && (
                <Stack className={styles.live} gap={6}>
                    <Group justify="space-between" wrap="nowrap">
                        <Text fw={700} size="sm">
                            {GAMES.find((g) => g.kind === game.kind)?.label}
                            {game.ends && !game.result ? ` - ${left}s` : ''}
                        </Text>
                        {!game.result && (
                            <Button
                                onClick={() => send({ op: 'stop' })}
                                size="compact-xs"
                                variant="subtle"
                            >
                                End
                            </Button>
                        )}
                    </Group>
                    {game.result && <Text size="sm">{game.result}</Text>}
                    {!game.result && game.kind === 'battle' && (
                        <Group gap="xs" grow>
                            {(['a', 'b'] as const).map((side) => (
                                <Button
                                    key={side}
                                    onClick={() => send({ op: 'vote', side })}
                                    size="xs"
                                    variant="default"
                                >
                                    {game[side].title} ({side === 'a' ? game.votesA : game.votesB})
                                </Button>
                            ))}
                        </Group>
                    )}
                    {!game.result && game.kind === 'rounds' && (
                        <>
                            <Text size="xs">Theme: {game.theme}</Text>
                            {game.picks.map((p) => (
                                <Text isMuted key={p.who} size="xs">
                                    {p.who}: {p.title} - {p.artist}
                                </Text>
                            ))}
                            {!game.picks.some((p) => p.who === myName) && (
                                <PickAndSend
                                    onSend={(song) => send({ op: 'pick', song })}
                                    pick={pick}
                                    setPick={setPick}
                                />
                            )}
                        </>
                    )}
                    {!game.result && game.kind === 'hotseat' && (
                        <Text size="sm">
                            {game.who} is in the hot seat ({game.songsLeft} song
                            {game.songsLeft === 1 ? '' : 's'} left). Only they add songs.
                        </Text>
                    )}
                    {!game.result && game.kind === 'countdown' && (
                        <>
                            {game.picks.map((p) => (
                                <Button
                                    justify="space-between"
                                    key={p.id}
                                    onClick={() => send({ id: p.id, op: 'vote' })}
                                    size="xs"
                                    variant="default"
                                >
                                    {p.title} - {p.by} ({p.votes})
                                </Button>
                            ))}
                            <PickAndSend
                                onSend={(song) => send({ op: 'pick', song })}
                                pick={pick}
                                setPick={setPick}
                            />
                        </>
                    )}
                    {!game.result && game.kind === 'ranking' && (
                        <>
                            <Text isMuted size="xs">
                                Move songs up to rank them ({game.ranked} ranked so far)
                            </Text>
                            {order.map((id, i) => {
                                const s = game.songs.find((x) => x.id === id);
                                return (
                                    <Group gap={4} key={id} wrap="nowrap">
                                        <Text size="xs" style={{ flex: 1 }} truncate>
                                            {i + 1}. {s?.title}
                                        </Text>
                                        <Button
                                            disabled={!i}
                                            onClick={() => {
                                                const next = [...order];
                                                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                                                setOrder(next);
                                            }}
                                            size="compact-xs"
                                            variant="subtle"
                                        >
                                            Up
                                        </Button>
                                    </Group>
                                );
                            })}
                            <Button onClick={() => send({ op: 'rank', order })} size="xs">
                                Send my ranking
                            </Button>
                        </>
                    )}
                    {!game.result && game.kind === 'bingo' && myName && game.cards[myName] && (
                        <>
                            <div className={styles.bingo}>
                                {game.cards[myName].map((artist) => (
                                    <span
                                        className={
                                            game.heard.includes(artist.toLowerCase())
                                                ? styles.heard
                                                : undefined
                                        }
                                        key={artist}
                                    >
                                        {artist}
                                    </span>
                                ))}
                            </div>
                            <Button onClick={() => send({ op: 'bingo' })} size="xs">
                                Bingo!
                            </Button>
                        </>
                    )}
                </Stack>
            )}
        </Stack>
    );
};

const PickAndSend = ({
    onSend,
    pick,
    setPick,
}: {
    onSend: (song: GroupSong) => void;
    pick: GroupSong | null;
    setPick: (s: GroupSong | null) => void;
}) => (
    <Stack gap={4}>
        <SongPicker onPick={setPick} picked={pick} />
        <Button
            disabled={!pick}
            onClick={() => {
                if (pick) onSend(pick);
                setPick(null);
            }}
            size="xs"
        >
            Suggest
        </Button>
    </Stack>
);
