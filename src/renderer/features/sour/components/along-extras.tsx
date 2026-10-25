import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { type GroupSong } from '/@/renderer/features/group-play/store/group-play.store';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { getSongById } from '/@/renderer/features/player/utils';
import { type Me } from '/@/renderer/features/sour/api/sour-api';
import { SongPicker } from '/@/renderer/features/sour/components/song-picker';
import { useMyProfile, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { useCurrentServer } from '/@/renderer/store';
import { addToQueueByData, usePlayerStoreBase } from '/@/renderer/store/player.store';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Popover } from '/@/shared/components/popover/popover';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { Play } from '/@/shared/types/types';

// Listen along extras (Sour Player 0.10): chat and reactions between someone and the friends riding
// along, song requests, handing off (the listener starts following one of their riders), heard-together
// history and playing what a friend played earlier.
export interface AlongMessage {
    at: number;
    by: string;
    emoji?: string;
    id: string;
    kind: 'chat' | 'handoff' | 'react' | 'request';
    name: string;
    song?: GroupSong;
    target?: string;
    targetName?: string;
    text?: string;
}

const REACTS = ['🔥', '😍', '😂', '💀', '🙌', '🍋'];

const send = async (base: string, me: Me, host: string, body: Record<string, unknown>) => {
    const res = await fetch(`${base}/api/along/${host}`, {
        body: JSON.stringify({ ...body, key: me.key, profile: me.id }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Hermes Music returned ${res.status}`);
    return json;
};

const useAlongLog = (host: null | string) => {
    const url = useHermesUrl();
    return useQuery({
        enabled: !!url && !!host,
        queryFn: async () => {
            const res = await fetch(`${url}/api/along/${host}?since=0`);
            if (!res.ok) return [] as AlongMessage[];
            return ((await res.json()).messages ?? []) as AlongMessage[];
        },
        queryKey: ['along-log', url, host],
        refetchInterval: 3000,
    });
};

export const usePlaySongs = () => {
    const queryClient = useQueryClient();
    const serverId = useCurrentServer()?.id;
    return async (songs: GroupSong[], how: Play = Play.NOW) => {
        if (!serverId || !songs.length) return;
        const found = await Promise.all(
            songs.map((s) =>
                getSongById({ id: s.id, queryClient, serverId })
                    .then((r) => r.items)
                    .catch(() => []),
            ),
        );
        const items = found.flat();
        if (!items.length) {
            toast.error({ message: "Those songs aren't on your music server" });
            return;
        }
        await addToQueueByData(how, items);
    };
};

// the chat / reactions / request popover (for both sides)
export const AlongChat = ({ host, label }: { host: string; label: string }) => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const log = useAlongLog(host).data ?? [];
    const [text, setText] = useState('');
    const [pick, setPick] = useState<GroupSong | null>(null);
    const isHost = me?.id === host;
    const history = useSourStore((s) => s.alongHistory ?? []);
    const go = (body: Record<string, unknown>) =>
        me && send(url, me, host, body).catch((e: Error) => toast.error({ message: e.message }));
    return (
        <Popover position="top" width={320}>
            <Popover.Target>
                <Button size="compact-xs" variant="subtle">
                    {label}
                </Button>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack gap={6}>
                    <Group gap={4}>
                        {REACTS.map((e) => (
                            <Button
                                key={e}
                                onClick={() => go({ emoji: e, kind: 'react' })}
                                size="compact-sm"
                                variant="subtle"
                            >
                                {e}
                            </Button>
                        ))}
                    </Group>
                    <Stack gap={2} mah={180} style={{ overflowY: 'auto' }}>
                        {log
                            .filter((m) => m.kind === 'chat' || m.kind === 'react')
                            .slice(-20)
                            .map((m) => (
                                <Text key={m.id} size="xs">
                                    <b>{m.name}</b> {m.text ?? m.emoji}
                                </Text>
                            ))}
                    </Stack>
                    <TextInput
                        onChange={(e) => setText(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && text.trim()) {
                                go({ kind: 'chat', text });
                                setText('');
                            }
                        }}
                        placeholder="Say something"
                        size="xs"
                        value={text}
                    />
                    {!isHost && (
                        <>
                            <Text isMuted size="xs">
                                Ask them to play something
                            </Text>
                            <SongPicker onPick={setPick} picked={pick} />
                            <Button
                                disabled={!pick}
                                onClick={() => {
                                    go({ kind: 'request', song: pick });
                                    setPick(null);
                                }}
                                size="xs"
                            >
                                Send request
                            </Button>
                        </>
                    )}
                    {!isHost && !!history.length && (
                        <Stack gap={2}>
                            <Text isMuted size="xs">
                                Heard together
                            </Text>
                            {history.slice(0, 6).map((h) => (
                                <Text key={`${h.song.id}-${h.at}`} size="xs" truncate>
                                    {h.song.title} - {h.song.artist} (with {h.friend})
                                </Text>
                            ))}
                        </Stack>
                    )}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

// for the person being listened to: who is riding along, chat, hand off
export const AlongHost = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const riders = useMyProfile().data?.riders ?? [];
    if (!me || !riders.length) return null;
    return (
        <Group gap={2} wrap="nowrap">
            <AlongChat host={me.id} label={`${riders.length} riding along`} />
            <Popover position="top" width={240}>
                <Popover.Target>
                    <Button size="compact-xs" title="Hand off" variant="subtle">
                        Hand off
                    </Button>
                </Popover.Target>
                <Popover.Dropdown>
                    <Stack gap={4}>
                        <Text isMuted size="xs">
                            Let one of them pick: you listen along with them instead
                        </Text>
                        {riders.map((r) => (
                            <Button
                                key={r.id}
                                onClick={() =>
                                    send(url, me, me.id, { kind: 'handoff', target: r.id })
                                        .then(() =>
                                            useSourStore.getState().set({
                                                listenAlong: r.id,
                                                listenAlongName: r.name,
                                            }),
                                        )
                                        .catch((e: Error) => toast.error({ message: e.message }))
                                }
                                size="xs"
                                variant="default"
                            >
                                {r.name}
                            </Button>
                        ))}
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        </Group>
    );
};

// in the background: shows what arrives (reactions, chat, requests, hand offs) and keeps the
// heard-together history while you listen along
export const AlongWatcher = () => {
    const me = useSourStore((s) => s.me);
    const following = useSourStore((s) => s.listenAlong);
    const followingName = useSourStore((s) => s.listenAlongName);
    const riders = useMyProfile().data?.riders ?? [];
    const playSongs = usePlaySongs();
    const mine = useAlongLog(me && riders.length ? me.id : null).data;
    const theirs = useAlongLog(following).data;
    // only messages from after the app opened
    const seen = useRef(0);
    useEffect(() => {
        seen.current = Date.now();
    }, []);
    const lastSong = useRef<null | string>(null);

    useEffect(() => {
        const all = [...(mine ?? []), ...(theirs ?? [])].filter(
            (m) => m.at > seen.current && m.by !== me?.id,
        );
        if (!all.length) return;
        seen.current = Math.max(...all.map((m) => m.at));
        for (const m of all) {
            if (m.kind === 'react')
                toast.info({ autoClose: 2500, message: `${m.name} ${m.emoji}` });
            else if (m.kind === 'chat') toast.info({ message: `${m.name}: ${m.text}` });
            else if (m.kind === 'request' && m.song) {
                const song = m.song;
                notifications.show({
                    autoClose: 15000,
                    message: (
                        <Group gap="xs" justify="space-between" wrap="nowrap">
                            <Text size="sm">
                                {song.title} - {song.artist}
                            </Text>
                            <Button onClick={() => playSongs([song], Play.NEXT)} size="compact-xs">
                                Play next
                            </Button>
                        </Group>
                    ),
                    title: `${m.name} asks for a song`,
                    withBorder: true,
                });
            } else if (m.kind === 'handoff' && m.target === me?.id) {
                // they handed off to you: you pick now, they follow you
                useSourStore.getState().set({ listenAlong: null, listenAlongName: null });
                toast.success({ message: `${m.name} handed off to you - you're picking now` });
            }
        }
    }, [me?.id, mine, playSongs, theirs]);

    // heard together: every song while listening along
    useEffect(() => {
        if (!following) return undefined;
        const timer = setInterval(() => {
            const song = usePlayerStoreBase.getState().getCurrentSong();
            if (!song || song.id === lastSong.current) return;
            lastSong.current = song.id;
            const { alongHistory = [], set } = useSourStore.getState();
            set({
                alongHistory: [
                    {
                        at: Date.now(),
                        friend: followingName || 'a friend',
                        song: {
                            album: song.album || '',
                            artist: song.artistName,
                            duration: song.duration,
                            id: song.id,
                            imageId: song.imageId ?? null,
                            title: song.name,
                        },
                    },
                    ...alongHistory,
                ].slice(0, 100),
            });
        }, 5000);
        return () => clearInterval(timer);
    }, [following, followingName]);
    return null;
};
