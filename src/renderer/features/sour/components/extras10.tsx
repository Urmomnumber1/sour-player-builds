import { openModal } from '@mantine/modals';
import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useEffect, useRef, useState } from 'react';

import { useGroupPlayStore } from '/@/renderer/features/group-play/store/group-play.store';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { useCustom } from '/@/renderer/features/sour/components/customize';
import {
    clearOffline,
    loadWebOffline,
    offlineBytes,
    onOfflineProgress,
    setPlaylistOffline,
    syncOffline,
} from '/@/renderer/features/sour/mobile/offline';
import { usePhoneStore } from '/@/renderer/features/sour/mobile/phone-store';
import {
    useMyProfile,
    useSourProfiles,
    useSourStore,
} from '/@/renderer/features/sour/store/sour.store';
import { startListenAlong } from '/@/renderer/features/sour/utils/switching';
import { useCurrentServer } from '/@/renderer/store';
import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { Button } from '/@/shared/components/button/button';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { type Song } from '/@/shared/types/domain-types';
import { PlayerStyle } from '/@/shared/types/types';

// The last of the v0.10 ideas: Song DNA, humming search, requests from Group Play, offline playlists on
// the computer, friends' notes on the seek bar, crossfade that follows the mood and joining from Discord.

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

// ---------- Song DNA ----------
interface Dna {
    firstHeard: null | string;
    inLibrary: boolean;
    listeners: { name: string; plays: number }[];
    lovedBy: string[];
    notes: number;
    plays: number;
    weekPlays: number;
}

const SongDna = ({ song }: { song: Song }) => {
    const url = useHermesUrl();
    const dna = useQuery({
        enabled: !!url,
        queryFn: async () => {
            const q = new URLSearchParams({
                artist: song.artistName,
                id: song.id,
                title: song.name,
            });
            const res = await fetch(`${url}/api/song-dna?${q}`);
            if (!res.ok) throw new Error(`Hermes Music returned ${res.status}`);
            return (await res.json()) as Dna;
        },
        queryKey: ['song-dna', url, song.id],
    }).data;
    const facts: [string, string][] = [
        ['Album', `${song.album || 'Unknown'}${song.releaseYear ? ` (${song.releaseYear})` : ''}`],
        ['Genre', song.genres?.map((g) => g.name).join(', ') || 'Unknown'],
        [
            'Length',
            `${Math.floor(song.duration / 60000)}:${String(Math.floor((song.duration / 1000) % 60)).padStart(2, '0')}`,
        ],
        [
            'Quality',
            [song.container?.toUpperCase(), song.bitRate ? `${song.bitRate} kbps` : '']
                .filter(Boolean)
                .join(' ') || 'Unknown',
        ],
        ['BPM', song.bpm ? String(song.bpm) : 'Unknown'],
        ['Your plays', String(song.playCount ?? 0)],
    ];
    if (dna) {
        facts.push(
            ['The group played it', `${dna.plays} times (${dna.weekPlays} this week)`],
            [
                'First heard',
                dna.firstHeard
                    ? new Date(`${dna.firstHeard}T12:00:00`).toLocaleDateString()
                    : 'Not yet',
            ],
            ['Loved by', dna.lovedBy.join(', ') || 'Nobody yet'],
            ['Notes on it', String(dna.notes)],
        );
    }
    const top = dna?.listeners[0]?.plays || 1;
    return (
        <Stack gap="sm">
            {facts.map(([k, v]) => (
                <Group gap="md" justify="space-between" key={k} wrap="nowrap">
                    <Text isMuted size="sm">
                        {k}
                    </Text>
                    <Text size="sm" ta="right">
                        {v}
                    </Text>
                </Group>
            ))}
            {!!dna?.listeners.length && (
                <Stack gap={4}>
                    <Text fw={700} size="sm">
                        Who plays it most
                    </Text>
                    {dna.listeners.slice(0, 6).map((l) => (
                        <Group gap="xs" key={l.name} wrap="nowrap">
                            <Text size="xs" style={{ width: 90 }} truncate>
                                {l.name}
                            </Text>
                            <div
                                style={{
                                    background: 'var(--theme-colors-primary)',
                                    borderRadius: 4,
                                    height: 6,
                                    width: `${Math.max(3, (l.plays / top) * 100)}%`,
                                }}
                            />
                            <Text isMuted size="xs">
                                {l.plays}
                            </Text>
                        </Group>
                    ))}
                </Stack>
            )}
        </Stack>
    );
};

export const openSongDna = (song: Song) =>
    openModal({ children: <SongDna song={song} />, size: 'md', title: `Song DNA: ${song.name}` });

export const SongDnaAction = ({ songs }: { songs: Song[] }) => {
    if (songs.length !== 1) return null;
    return (
        <ContextMenu.Item leftIcon="info" onSelect={() => openSongDna(songs[0])}>
            Song DNA
        </ContextMenu.Item>
    );
};

// ---------- humming search ----------
export const HumButton = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const name = useMyProfile().data?.name;
    const [state, setState] = useState<'idle' | 'listening' | 'thinking'>('idle');
    const [guess, setGuess] = useState<null | {
        artist: string;
        inLibrary: boolean;
        title: string;
    }>(null);
    const recorded = useRef<Blob | null>(null);
    const hum = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const rec = new MediaRecorder(stream);
            const parts: Blob[] = [];
            rec.ondataavailable = (e) => parts.push(e.data);
            setState('listening');
            setGuess(null);
            rec.start();
            await new Promise((r) => setTimeout(r, 9000));
            await new Promise<void>((r) => {
                rec.onstop = () => r();
                rec.stop();
            });
            stream.getTracks().forEach((t) => t.stop());
            setState('thinking');
            const blob = new Blob(parts, { type: rec.mimeType || 'audio/webm' });
            recorded.current = blob;
            const audio = await new Promise<string>((r) => {
                const fr = new FileReader();
                fr.onload = () => r(String(fr.result));
                fr.readAsDataURL(blob);
            });
            setGuess(await post(`${url}/api/requests/hum`, { audio }));
        } catch (e) {
            toast.error({ message: (e as Error).message || "Couldn't use the microphone" });
        } finally {
            setState('idle');
        }
    };
    return (
        <Stack gap={6}>
            <Button disabled={state !== 'idle'} onClick={hum} size="xs" variant="default">
                {state === 'listening'
                    ? 'Listening... hum or sing for 9 seconds'
                    : state === 'thinking'
                      ? 'Working out the song...'
                      : 'Hum it (find a song by humming)'}
            </Button>
            {guess && (
                <Group gap="xs" justify="space-between" wrap="nowrap">
                    <Text size="sm" truncate>
                        {guess.artist} - {guess.title}
                        {guess.inLibrary ? ' (already in the library)' : ''}
                    </Text>
                    {!guess.inLibrary && (
                        <Button
                            onClick={() =>
                                post(`${url}/api/requests`, {
                                    by: name,
                                    profile: me?.id,
                                    query: `${guess.artist} - ${guess.title}`,
                                })
                                    .then(() =>
                                        toast.success({ message: `Requested ${guess.title}` }),
                                    )
                                    .catch((e: Error) => toast.error({ message: e.message }))
                            }
                            size="compact-xs"
                        >
                            Request it
                        </Button>
                    )}
                </Group>
            )}
        </Stack>
    );
};

// ---------- requests from Group Play: the group's chat says when it's in ----------
export const GroupRequest = () => {
    const url = useHermesUrl();
    const code = useGroupPlayStore((s) => s.code);
    const me = useSourStore((s) => s.me);
    const name = useMyProfile().data?.name;
    const [q, setQ] = useState('');
    if (!code) return null;
    return (
        <Group gap="xs" wrap="nowrap">
            <TextInput
                onChange={(e) => setQ(e.currentTarget.value)}
                placeholder="Not in the library? Request it for the group"
                size="xs"
                style={{ flex: 1 }}
                value={q}
            />
            <Button
                disabled={q.trim().length < 2}
                onClick={() =>
                    post(`${url}/api/requests`, {
                        by: name,
                        group: code,
                        profile: me?.id,
                        query: q.trim(),
                    })
                        .then(() => {
                            toast.success({
                                message: 'Requested - the group chat says when it is in',
                            });
                            setQ('');
                        })
                        .catch((e: Error) => toast.error({ message: e.message }))
                }
                size="xs"
            >
                Request
            </Button>
        </Group>
    );
};

// ---------- offline playlists on the computer ----------
export const DesktopOffline = () => {
    useEffect(() => {
        if (!isElectron()) return undefined;
        loadWebOffline().then(() => syncOffline());
        const timer = window.setInterval(() => syncOffline(), 15 * 60000);
        return () => window.clearInterval(timer);
    }, []);
    return null;
};

export const KeepOfflineAction = ({ ids }: { ids: string[] }) => {
    const serverId = useCurrentServer()?.id;
    const offline = usePhoneStore((s) => s.offlinePlaylists);
    if (!isElectron() || !serverId || ids.length !== 1) return null;
    const on = !!offline[ids[0]];
    return (
        <ContextMenu.Item
            leftIcon="download"
            onSelect={() =>
                setPlaylistOffline(ids[0], serverId, !on).then(() =>
                    toast.info({
                        message: on ? 'No longer kept offline' : 'Saving this playlist for offline',
                    }),
                )
            }
        >
            {on ? 'Stop keeping offline' : 'Keep offline'}
        </ContextMenu.Item>
    );
};

export const OfflineCardBody = () => {
    const lists = usePhoneStore((s) => s.offlinePlaylists);
    const songs = usePhoneStore((s) => s.offline);
    const [progress, setProgress] = useState('');
    useEffect(() => onOfflineProgress(setProgress), []);
    const mb = Math.round(offlineBytes() / 1e6);
    return (
        <Stack gap={6}>
            <Text size="sm">
                {Object.keys(lists).length} playlists, {Object.keys(songs).length} songs saved ({mb}{' '}
                MB). Right-click a playlist &gt; Keep offline. Saved songs play without the internet
                (with the built-in player: Settings &gt; Playback &gt; Web).
            </Text>
            {progress && (
                <Text isMuted size="xs">
                    {progress}
                </Text>
            )}
            <Group gap="xs">
                <Button onClick={() => syncOffline()} size="xs" variant="default">
                    Update now
                </Button>
                <Button
                    color="red"
                    disabled={!Object.keys(songs).length}
                    onClick={() =>
                        clearOffline().then(() => toast.info({ message: 'Offline songs removed' }))
                    }
                    size="xs"
                    variant="subtle"
                >
                    Remove all
                </Button>
            </Group>
        </Stack>
    );
};

// ---------- crossfade that follows the mood ----------
const CHILL = /chill|lo-?fi|ambient|jazz|acoustic|soul|classical|piano|r&b/i;
const HYPE = /hip.?hop|rap|edm|electronic|dance|metal|rock|punk|drill|trap/i;
export const CrossfadeByMood = () => {
    const on = useCustom().moodCrossfade;
    useEffect(() => {
        if (!on) return undefined;
        let last = '';
        const timer = setInterval(() => {
            const player = usePlayerStoreBase.getState();
            const song = player.getCurrentSong();
            if (!song || song._uniqueId === last) return;
            last = song._uniqueId;
            const genres = song.genres?.map((g) => g.name).join(' ') || '';
            const seconds = CHILL.test(genres) ? 9 : HYPE.test(genres) ? 2 : 5;
            if (player.player.transitionType !== PlayerStyle.CROSSFADE) {
                player.setTransitionType(PlayerStyle.CROSSFADE);
            }
            if (player.player.crossfadeDuration !== seconds) player.setCrossfadeDuration(seconds);
        }, 2000);
        return () => clearInterval(timer);
    }, [on]);
    return null;
};

// ---------- friends' notes on the seek bar ----------
interface PlacedNote {
    fromName: string;
    id: string;
    position?: number;
    text: string;
}
export const NoteMarks = ({ duration, songId }: { duration: number; songId?: string }) => {
    const url = useHermesUrl();
    const notes = useQuery({
        enabled: !!url && !!songId,
        queryFn: async () => {
            const res = await fetch(`${url}/api/song-notes/${encodeURIComponent(songId || '')}`);
            return res.ok ? ((await res.json()) as PlacedNote[]) : [];
        },
        queryKey: ['sour-song-notes', url, songId],
        staleTime: 60000,
    }).data;
    const placed = (notes ?? []).filter((n) => typeof n.position === 'number');
    if (!duration || !placed.length) return null;
    return (
        <div
            style={{
                bottom: '60%',
                height: 0,
                left: 0,
                pointerEvents: 'none',
                position: 'absolute',
                right: 0,
            }}
        >
            {placed.map((n) => (
                <span
                    key={n.id}
                    style={{
                        cursor: 'help',
                        fontSize: '0.75rem',
                        left: `${Math.min(100, ((n.position ?? 0) / duration) * 100)}%`,
                        pointerEvents: 'auto',
                        position: 'absolute',
                        transform: 'translateX(-50%)',
                    }}
                    title={`${n.fromName}: ${n.text}`}
                >
                    📝
                </span>
            ))}
        </div>
    );
};

// ---------- joining from Discord: sourplayer://listen/<profile> ----------
export const OpenLinks = () => {
    const profiles = useSourProfiles().data;
    const latest = useRef(profiles);
    latest.current = profiles;
    useEffect(() => {
        if (!isElectron()) return undefined;
        const onUrl = (_e: unknown, link: string) => {
            const m = /^sourplayer:\/\/listen\/([\w-]+)/.exec(String(link));
            if (!m) return;
            const friend = latest.current?.find((p) => p.id === m[1]);
            if (!friend)
                return toast.error({ message: "Couldn't find that friend on this Hermes Music" });
            return startListenAlong(friend).then(
                (ok) => ok && toast.success({ message: `Listening along with ${friend.name}` }),
            );
        };
        window.api?.ipc?.on?.('sour-open-url', onUrl);
        return () => window.api?.ipc?.removeListener?.('sour-open-url', onUrl);
    }, []);
    return null;
};
