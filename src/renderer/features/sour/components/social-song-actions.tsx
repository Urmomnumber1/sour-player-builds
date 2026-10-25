import { closeAllModals, openModal } from '@mantine/modals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { toGroupSong } from '/@/renderer/features/group-play/api/group-play-api';
import { type GroupSong } from '/@/renderer/features/group-play/store/group-play.store';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { socialApi } from '/@/renderer/features/sour/api/social-api';
import { timeAgo } from '/@/renderer/features/sour/api/sour-api';
import {
    useMyProfile,
    useSourProfiles,
    useSourStore,
} from '/@/renderer/features/sour/store/sour.store';
import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { Button } from '/@/shared/components/button/button';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { Group } from '/@/shared/components/group/group';
import { Select } from '/@/shared/components/select/select';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { type Song } from '/@/shared/types/domain-types';

const fail = (error: Error) => toast.error({ message: error.message });

const useFriendChoices = () => {
    const me = useSourStore((s) => s.me);
    return (useSourProfiles().data ?? [])
        .filter((p) => p.id !== me?.id)
        .map((p) => ({ label: p.name, value: p.id }));
};

const SendForm = ({ mode, song }: { mode: 'ask' | 'gift'; song: GroupSong }) => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const friends = useFriendChoices();
    const [to, setTo] = useState<null | string>(null);
    const [note, setNote] = useState('');
    return (
        <Stack gap="sm">
            <Text isMuted size="sm">
                {mode === 'gift'
                    ? 'It arrives wrapped - they unwrap it to hear it.'
                    : 'They get a pop-up asking to play it next.'}
            </Text>
            <Select data={friends} onChange={setTo} placeholder="Who's it for?" value={to} />
            {mode === 'gift' && (
                <TextInput
                    maxLength={200}
                    onChange={(e) => setNote(e.currentTarget.value)}
                    placeholder="A note (optional)"
                    value={note}
                />
            )}
            <Group justify="flex-end">
                <Button
                    disabled={!to || !me}
                    onClick={() =>
                        me &&
                        to &&
                        (mode === 'gift'
                            ? socialApi.gift(url, me, to, song, note)
                            : socialApi.ask(url, me, to, song)
                        )
                            .then(() => {
                                toast.success({ message: mode === 'gift' ? 'Gift sent' : 'Asked' });
                                closeAllModals();
                            })
                            .catch(fail)
                    }
                    variant="filled"
                >
                    {mode === 'gift' ? 'Send the gift' : 'Ask'}
                </Button>
            </Group>
        </Stack>
    );
};

// sticky notes everyone sees when the song plays
const StickyNotes = ({ song }: { song: GroupSong }) => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const qc = useQueryClient();
    const [text, setText] = useState('');
    const notes = useQuery({
        enabled: !!url,
        queryFn: () => socialApi.notes(url, song.id),
        queryKey: ['sour-song-notes', url, song.id],
    });
    const change = (c: { remove?: string; text?: string }) =>
        me &&
        socialApi
            .note(url, me, song.id, {
                ...c,
                // pinned to the moment on the seek bar when you're listening to it
                position:
                    c.text && usePlayerStoreBase.getState().getCurrentSong()?.id === song.id
                        ? useTimestampStoreBase.getState().timestamp
                        : undefined,
            })
            .then(() => {
                setText('');
                qc.invalidateQueries({ queryKey: ['sour-song-notes', url, song.id] });
            })
            .catch(fail);
    return (
        <Stack gap="sm">
            <Text isMuted size="sm">
                Friends see these notes pop up when this song plays for them.
            </Text>
            {(notes.data ?? []).map((n) => (
                <Group gap="xs" key={n.id} wrap="nowrap">
                    <Text flex={1} size="sm">
                        <b>{n.fromName}:</b> {n.text}{' '}
                        <span style={{ opacity: 0.6 }}>({timeAgo(n.at)})</span>
                    </Text>
                    {n.from === me?.id && (
                        <Button
                            onClick={() => change({ remove: n.id })}
                            size="compact-xs"
                            variant="subtle"
                        >
                            Remove
                        </Button>
                    )}
                </Group>
            ))}
            <Group gap="xs">
                <TextInput
                    flex={1}
                    maxLength={200}
                    onChange={(e) => setText(e.currentTarget.value)}
                    placeholder="this bridge!!"
                    value={text}
                />
                <Button disabled={!text.trim() || !me} onClick={() => change({ text })}>
                    Stick it
                </Button>
            </Group>
        </Stack>
    );
};

const DuelForm = ({ song }: { song: GroupSong }) => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const friends = useFriendChoices();
    const [opponent, setOpponent] = useState('');
    return (
        <Stack gap="sm">
            <Text isMuted size="sm">
                Someone answers with their song, the group votes for a day, and the winner joins the
                Hall of Fame.
            </Text>
            <Select
                data={[
                    { label: 'Anyone can answer', value: '' },
                    ...friends.map((f) => ({ ...f, label: `Challenge ${f.label}` })),
                ]}
                onChange={(v) => setOpponent(v ?? '')}
                value={opponent}
            />
            <Group justify="flex-end">
                <Button
                    disabled={!me}
                    onClick={() =>
                        me &&
                        socialApi
                            .startDuel(url, me, song, opponent || null)
                            .then(() => {
                                toast.success({ message: 'Duel started - see it in the Sour Hub' });
                                closeAllModals();
                            })
                            .catch(fail)
                    }
                    variant="filled"
                >
                    Start the duel
                </Button>
            </Group>
        </Stack>
    );
};

const CapsuleForm = ({ song }: { song: GroupSong }) => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const friends = useFriendChoices();
    const [to, setTo] = useState<null | string>('group');
    const [note, setNote] = useState('');
    const [when, setWhen] = useState('');
    return (
        <Stack gap="sm">
            <Text isMuted size="sm">
                Sealed until the date you pick.
            </Text>
            <Select
                data={[{ label: 'The whole group', value: 'group' }, ...friends]}
                onChange={setTo}
                value={to}
            />
            <TextInput
                maxLength={500}
                onChange={(e) => setNote(e.currentTarget.value)}
                placeholder="A note for later"
                value={note}
            />
            <TextInput
                onChange={(e) => setWhen(e.currentTarget.value)}
                type="datetime-local"
                value={when}
            />
            <Group justify="flex-end">
                <Button
                    disabled={!me || !to || !when}
                    onClick={() =>
                        me &&
                        to &&
                        socialApi
                            .capsule(url, me, {
                                note,
                                song,
                                to,
                                unlockAt: new Date(when).getTime(),
                            })
                            .then(() => {
                                toast.success({ message: 'Capsule sealed' });
                                closeAllModals();
                            })
                            .catch(fail)
                    }
                    variant="filled"
                >
                    Seal it
                </Button>
            </Group>
        </Stack>
    );
};

// Song right-click > Sour: gifts, asks, sticky notes, duels and time capsules
export const SocialSongMenu = ({ songs }: { songs: Song[] }) => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const myName = useMyProfile().data?.name ?? 'Sour Player';
    const song = songs[0];
    if (!url || !me || songs.length !== 1 || !song) return null;
    const g = toGroupSong(song);
    return (
        <ContextMenu.Submenu>
            <ContextMenu.SubmenuTarget>
                <ContextMenu.Item leftIcon="citrus" rightIcon="arrowRightS">
                    Sour
                </ContextMenu.Item>
            </ContextMenu.SubmenuTarget>
            <ContextMenu.SubmenuContent>
                <ContextMenu.Item
                    leftIcon="gift"
                    onSelect={() =>
                        openModal({
                            children: <SendForm mode="gift" song={g} />,
                            title: `Gift ${song.name}`,
                        })
                    }
                >
                    Gift it to a friend
                </ContextMenu.Item>
                <ContextMenu.Item
                    leftIcon="mediaPlayNext"
                    onSelect={() =>
                        openModal({
                            children: <SendForm mode="ask" song={g} />,
                            title: `Ask a friend to play ${song.name}`,
                        })
                    }
                >
                    Ask a friend to play it next
                </ContextMenu.Item>
                <ContextMenu.Item
                    leftIcon="stickyNote"
                    onSelect={() =>
                        openModal({
                            children: <StickyNotes song={g} />,
                            title: `Sticky notes: ${song.name}`,
                        })
                    }
                >
                    Sticky notes
                </ContextMenu.Item>
                <ContextMenu.Item
                    leftIcon="swords"
                    onSelect={() =>
                        openModal({
                            children: <DuelForm song={g} />,
                            title: `Duel with ${song.name}`,
                        })
                    }
                >
                    Start a song duel
                </ContextMenu.Item>
                <ContextMenu.Item
                    leftIcon="hourglass"
                    onSelect={() =>
                        openModal({
                            children: <CapsuleForm song={g} />,
                            title: `Time capsule: ${song.name}`,
                        })
                    }
                >
                    Put it in a time capsule
                </ContextMenu.Item>
                {!!song.album && (
                    <ContextMenu.Item
                        leftIcon="download"
                        onSelect={() =>
                            fetch(`${url}/api/requests`, {
                                body: JSON.stringify({
                                    by: myName,
                                    profile: me.id,
                                    query: `${song.albumArtists?.[0]?.name || song.artistName} - ${song.album}`,
                                    type: 'album',
                                }),
                                headers: { 'content-type': 'application/json' },
                                method: 'POST',
                            })
                                .then(async (res) => {
                                    if (!res.ok)
                                        throw new Error(
                                            (await res.json().catch(() => null))?.error ||
                                                `Hermes Music returned ${res.status}`,
                                        );
                                    toast.success({
                                        message: `Asked Hermes Music for the rest of ${song.album}`,
                                    });
                                })
                                .catch(fail)
                        }
                    >
                        Get the whole album
                    </ContextMenu.Item>
                )}
            </ContextMenu.SubmenuContent>
        </ContextMenu.Submenu>
    );
};
