import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { getAlbumSongsById } from '/@/renderer/features/player/utils';
import { Card } from '/@/renderer/features/sour/components/hub-panels';
import { useMyProfile, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { useCurrentServer } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { Textarea } from '/@/shared/components/textarea/textarea';
import { toast } from '/@/shared/components/toast/toast';

// Sour Player 0.10 request extras: the wishlist (songs Hermes Music couldn't find yet, retried every
// week), storage, the lyrics doctor, request bundles, your request history and completing albums.
const post = async (url: string, body: unknown = {}) => {
    const res = await fetch(url, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Hermes Music returned ${res.status}`);
    return json;
};

const gb = (bytes: number) =>
    bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;

const useWho = () => {
    const me = useSourStore((s) => s.me);
    const name = useMyProfile().data?.name;
    return { by: name || undefined, profile: me?.id };
};

export const WishlistCard = () => {
    const url = useHermesUrl();
    const list = useQuery({
        enabled: !!url,
        queryFn: async () =>
            (await (await fetch(`${url}/api/requests/wishlist`)).json()) as {
                id: string;
                note?: string;
                query: string;
                retries: number;
                retryAt: null | number;
            }[],
        queryKey: ['request-wishlist', url],
    });
    return (
        <Card icon="🌠" title="Wishlist">
            <Stack gap={4}>
                <Text isMuted size="sm">
                    Songs Hermes Music couldn&#39;t find yet. Each is tried again every week (4
                    tries).
                </Text>
                {(list.data ?? []).slice(0, 40).map((w) => (
                    <Group gap="xs" justify="space-between" key={w.id} wrap="nowrap">
                        <Stack gap={0} miw={0}>
                            <Text size="sm" truncate>
                                {w.query}
                            </Text>
                            <Text isMuted size="xs" truncate>
                                {w.retries ? `tried ${w.retries + 1} times` : w.note || 'not found'}
                                {w.retryAt
                                    ? ` - next try ${new Date(w.retryAt).toLocaleDateString()}`
                                    : ''}
                            </Text>
                        </Stack>
                        <Button
                            onClick={() =>
                                post(`${url}/api/requests/${w.id}/retry`)
                                    .then(() => {
                                        toast.info({ message: `Trying ${w.query} again` });
                                        list.refetch();
                                    })
                                    .catch((e: Error) => toast.error({ message: e.message }))
                            }
                            size="compact-xs"
                            variant="default"
                        >
                            Try now
                        </Button>
                    </Group>
                ))}
                {list.isFetched && !list.data?.length && (
                    <Text isMuted size="sm">
                        Nothing waiting.
                    </Text>
                )}
            </Stack>
        </Card>
    );
};

export const StorageCard = () => {
    const url = useHermesUrl();
    const data = useQuery({
        enabled: !!url,
        queryFn: async () =>
            (await (await fetch(`${url}/api/storage`)).json()) as {
                artists: { artist: string; bytes: number }[];
                disk: null | { free: number; size: number };
                files: number;
                total: number;
            },
        queryKey: ['hermes-storage', url],
        staleTime: 5 * 60000,
    }).data;
    const top = data?.artists[0]?.bytes || 1;
    return (
        <Card icon="💽" title="Storage">
            {data ? (
                <Stack gap={4}>
                    <Text size="sm">
                        {data.files} songs take <b>{gb(data.total)}</b>
                        {data.disk ? ` - ${gb(data.disk.free)} free of ${gb(data.disk.size)}` : ''}
                    </Text>
                    {data.artists.slice(0, 10).map((a) => (
                        <Group gap="xs" key={a.artist} wrap="nowrap">
                            <Text size="xs" style={{ width: 140 }} truncate>
                                {a.artist}
                            </Text>
                            <div
                                style={{
                                    background: 'var(--theme-colors-primary)',
                                    borderRadius: 4,
                                    height: 6,
                                    width: `${Math.max(2, (a.bytes / top) * 100)}%`,
                                }}
                            />
                            <Text isMuted size="xs">
                                {gb(a.bytes)}
                            </Text>
                        </Group>
                    ))}
                </Stack>
            ) : (
                <Text isMuted size="sm">
                    Adding it up...
                </Text>
            )}
        </Card>
    );
};

export const LyricsDoctorCard = () => {
    const url = useHermesUrl();
    const status = useQuery({
        enabled: !!url,
        queryFn: async () =>
            (await (await fetch(`${url}/api/lyrics/doctor`)).json()) as {
                done: number;
                found: number;
                missing: number;
                running: boolean;
            },
        queryKey: ['lyrics-doctor', url],
        refetchInterval: (q) => (q.state.data?.running ? 4000 : 60000),
    }).data;
    return (
        <Card icon="🩺" title="Lyrics doctor">
            <Stack gap={6}>
                <Text size="sm">
                    {status ? `${status.missing} songs have no synced lyrics.` : '...'}
                    {status?.running
                        ? ` Checking: ${status.done} done, ${status.found} found so far.`
                        : ''}
                </Text>
                <Button
                    disabled={!status?.missing || status.running}
                    onClick={() =>
                        post(`${url}/api/lyrics/doctor`)
                            .then(() =>
                                toast.info({ message: 'Looking for lyrics in the background' }),
                            )
                            .catch((e: Error) => toast.error({ message: e.message }))
                    }
                    size="xs"
                    variant="default"
                >
                    Find missing lyrics
                </Button>
            </Stack>
        </Card>
    );
};

export const BundleCard = () => {
    const url = useHermesUrl();
    const who = useWho();
    const [text, setText] = useState('');
    const count = text.split('\n').filter((l) => l.trim().length >= 2).length;
    return (
        <Card icon="📦" title="Request a bundle">
            <Stack gap={6}>
                <Textarea
                    autosize
                    minRows={3}
                    onChange={(e) => setText(e.currentTarget.value)}
                    placeholder={'One song per line\nArtist - Song\nArtist - Song'}
                    value={text}
                />
                <Button
                    disabled={!count}
                    onClick={() =>
                        post(`${url}/api/requests/bundle`, { ...who, text })
                            .then((r) => {
                                toast.success({ message: `Requested ${r.queued} songs` });
                                setText('');
                            })
                            .catch((e: Error) => toast.error({ message: e.message }))
                    }
                    size="xs"
                >
                    Request {count || ''} song{count === 1 ? '' : 's'}
                </Button>
            </Stack>
        </Card>
    );
};

export const MyRequestsCard = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const list = useQuery({
        enabled: !!url && !!me,
        queryFn: async () =>
            (await (await fetch(`${url}/api/requests/history?profile=${me?.id}`)).json()) as {
                created: string;
                id: string;
                query: string;
                status: string;
                title?: string;
            }[],
        queryKey: ['my-requests', url, me?.id],
        refetchInterval: 15000,
    }).data;
    if (!me) return null;
    return (
        <Card icon="🧾" title="Your requests">
            <Stack gap={2} mah={260} style={{ overflowY: 'auto' }}>
                {(list ?? []).slice(0, 60).map((r) => (
                    <Group gap="xs" justify="space-between" key={r.id} wrap="nowrap">
                        <Text size="xs" truncate>
                            {r.title || r.query}
                        </Text>
                        <Text isMuted size="xs">
                            {r.status}
                        </Text>
                    </Group>
                ))}
                {list && !list.length && (
                    <Text isMuted size="sm">
                        You haven&#39;t asked for anything yet.
                    </Text>
                )}
            </Stack>
        </Card>
    );
};

// album right-click: ask Hermes Music for the songs of this album you don't have yet
export const CompleteAlbumAction = ({ ids }: { ids: string[] }) => {
    const url = useHermesUrl();
    const serverId = useCurrentServer()?.id;
    const queryClient = useQueryClient();
    const who = useWho();
    if (!url || !serverId) return null;
    const onSelect = async () => {
        try {
            const songs = (await getAlbumSongsById({ id: ids, queryClient, serverId })).items;
            const lines = [
                ...new Set(songs.map((s) => `${s.albumArtistName || s.artistName} - ${s.album}`)),
            ];
            const r = await post(`${url}/api/requests/bundle`, { ...who, lines, type: 'album' });
            toast.success({
                message: `Asked for the rest of ${r.queued === 1 ? 'the album' : `${r.queued} albums`} - songs you have are skipped`,
            });
        } catch (error) {
            toast.error({ message: (error as Error).message });
        }
    };
    return (
        <ContextMenu.Item leftIcon="download" onSelect={onSelect}>
            Complete this album
        </ContextMenu.Item>
    );
};
