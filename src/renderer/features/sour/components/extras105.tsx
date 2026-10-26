import { openModal } from '@mantine/modals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { saveAsPlaylist } from '/@/renderer/features/group-play/components/group-extras';
import {
    useHermesUrl,
    useHermesVideoActions,
} from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { getAlbumSongsById, getPlaylistSongsById } from '/@/renderer/features/player/utils';
import { sourApi } from '/@/renderer/features/sour/api/sour-api';
import { Card } from '/@/renderer/features/sour/components/hub-panels';
import {
    useMyProfile,
    useSourProfiles,
    useSourStore,
} from '/@/renderer/features/sour/store/sour.store';
import { useCurrentServer } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { Group } from '/@/shared/components/group/group';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Select } from '/@/shared/components/select/select';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, type Song } from '/@/shared/types/domain-types';

// Sour Player 0.10.5: album liner notes, playlist versions and covers, the prediction game, close
// friends, outfit presets and showcase, the setup guide, and the admins' log and approvals.

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

// ---------- album liner notes (MusicBrainz) ----------
interface Liner {
    country: null | string;
    credits: { name: string; role: string }[];
    date: null | string;
    label: null | string;
    link: string;
    title: string;
    tracks: { credits: { name: string; role: string }[]; n: number; title: string }[];
}
const LinerNotes = ({ album, artist }: { album: string; artist: string }) => {
    const url = useHermesUrl();
    const q = useQuery({
        queryFn: async () => {
            const res = await fetch(
                `${url}/api/liner-notes?${new URLSearchParams({ album, artist })}`,
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'not found');
            return json as Liner;
        },
        queryKey: ['liner-notes', url, artist, album],
        retry: false,
        staleTime: Infinity,
    });
    if (q.isLoading)
        return (
            <Text isMuted size="sm">
                Asking MusicBrainz...
            </Text>
        );
    if (q.isError)
        return (
            <Text isMuted size="sm">
                {(q.error as Error).message}
            </Text>
        );
    const d = q.data;
    if (!d) return null;
    const group = (list: { name: string; role: string }[]) => {
        const by = new Map<string, string[]>();
        for (const c of list) by.set(c.role, [...(by.get(c.role) ?? []), c.name]);
        return [...by.entries()];
    };
    return (
        <Stack gap="sm">
            <Text size="sm">{[d.date, d.label, d.country].filter(Boolean).join(' - ')}</Text>
            {group(d.credits).map(([role, names]) => (
                <Text key={role} size="sm">
                    <b>{role}:</b> {[...new Set(names)].join(', ')}
                </Text>
            ))}
            <Stack gap={4}>
                {d.tracks.map((t) => (
                    <div key={`${t.n}-${t.title}`}>
                        <Text fw={600} size="sm">
                            {t.n}. {t.title}
                        </Text>
                        {group(t.credits).map(([role, names]) => (
                            <Text isMuted key={role} size="xs">
                                {role}: {[...new Set(names)].join(', ')}
                            </Text>
                        ))}
                    </div>
                ))}
            </Stack>
            <Text isMuted size="xs">
                From MusicBrainz ({d.link})
            </Text>
        </Stack>
    );
};

export const LinerNotesAction = ({ ids }: { ids: string[] }) => {
    const qc = useQueryClient();
    const serverId = useCurrentServer()?.id;
    if (!serverId || ids.length !== 1) return null;
    const onSelect = async () => {
        const songs = (await getAlbumSongsById({ id: ids, queryClient: qc, serverId })).items;
        const s = songs[0];
        if (!s) return;
        openModal({
            children: (
                <LinerNotes album={s.album || ''} artist={s.albumArtistName || s.artistName} />
            ),
            size: 'lg',
            title: `Liner notes: ${s.album}`,
        });
    };
    return (
        <ContextMenu.Item leftIcon="info" onSelect={onSelect}>
            Liner notes
        </ContextMenu.Item>
    );
};

// ---------- playlists: save a version, make a cover ----------
export const PlaylistVersionAction = ({ ids, names }: { ids: string[]; names: string[] }) => {
    const qc = useQueryClient();
    const serverId = useCurrentServer()?.id;
    if (!serverId || ids.length !== 1) return null;
    const onSelect = async () => {
        try {
            const songs = (await getPlaylistSongsById({ id: ids[0], queryClient: qc, serverId }))
                .items;
            const when = new Date().toLocaleDateString();
            await saveAsPlaylist(
                serverId,
                `${names[0]} (version ${when})`,
                songs.map((s) => ({
                    album: s.album || '',
                    artist: s.artistName,
                    duration: s.duration,
                    id: s.id,
                    imageId: s.imageId ?? null,
                    title: s.name,
                })),
            );
            toast.success({ message: `Saved a copy: ${names[0]} (version ${when})` });
        } catch (e) {
            fail(e as Error);
        }
    };
    return (
        <ContextMenu.Item leftIcon="save" onSelect={onSelect}>
            Save a version
        </ContextMenu.Item>
    );
};

const CoverMaker = ({ id, name }: { id: string; name: string }) => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const qc = useQueryClient();
    const serverId = useCurrentServer()?.id;
    const songs = useQuery({
        enabled: !!serverId,
        queryFn: async () =>
            (await getPlaylistSongsById({ id, queryClient: qc, serverId: serverId || '' }))
                .items as Song[],
        queryKey: ['cover-maker-songs', id],
    }).data;
    const picks = [...new Map((songs ?? []).map((s) => [s.albumId, s])).values()].slice(0, 4);
    const [title, setTitle] = useState(name);
    const [style, setStyle] = useState('grid');
    return (
        <Stack gap="sm">
            <Group gap="xs" wrap="nowrap">
                <TextInput
                    label="Text on the cover"
                    onChange={(e) => setTitle(e.currentTarget.value)}
                    style={{ flex: 1 }}
                    value={title}
                />
                <Select
                    data={[
                        { label: 'Four covers', value: 'grid' },
                        { label: 'One big cover', value: 'one' },
                        { label: 'Just colour', value: 'plain' },
                    ]}
                    label="Look"
                    onChange={(v) => v && setStyle(v)}
                    value={style}
                />
            </Group>
            <CoverCanvas picks={picks} style={style} title={title} />
            <Button
                disabled={!me}
                onClick={async () => {
                    const canvas = document.getElementById(
                        'sour-cover-maker',
                    ) as HTMLCanvasElement | null;
                    if (!canvas || !me) return;
                    try {
                        await sourApi.setPlaylistTheme(url, me, id, {
                            image: canvas.toDataURL('image/jpeg', 0.9),
                        });
                        qc.invalidateQueries({ queryKey: ['sour-playlist-theme'] });
                        toast.success({ message: 'Cover saved as the playlist picture' });
                    } catch (e) {
                        fail(e as Error);
                    }
                }}
            >
                Use as the playlist picture
            </Button>
        </Stack>
    );
};

const CoverImg = ({ id, onReady }: { id?: null | string; onReady: (src: string) => void }) => {
    const src = useItemImageUrl({
        id: id || undefined,
        itemType: LibraryItem.ALBUM,
        type: 'itemCard',
    });
    if (src) onReady(src);
    return null;
};

const CoverCanvas = ({ picks, style, title }: { picks: Song[]; style: string; title: string }) => {
    const [srcs, setSrcs] = useState<Record<string, string>>({});
    const ready = (k: string) => (src: string) => {
        if (srcs[k] !== src)
            setTimeout(() => setSrcs((s) => (s[k] === src ? s : { ...s, [k]: src })), 0);
    };
    const draw = (c: HTMLCanvasElement | null) => {
        if (!c) return;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const n = 600;
        ctx.fillStyle = '#2a1f3d';
        ctx.fillRect(0, 0, n, n);
        const imgs = picks.map((p) => srcs[p.id]).filter(Boolean);
        const paint = (src: string, x: number, y: number, w: number) =>
            new Promise<void>((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    ctx.drawImage(img, x, y, w, w);
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = src;
            });
        (async () => {
            if (style === 'grid')
                for (let i = 0; i < Math.min(4, imgs.length); i++)
                    await paint(imgs[i], (i % 2) * 300, Math.floor(i / 2) * 300, 300);
            if (style === 'one' && imgs[0]) await paint(imgs[0], 0, 0, n);
            const g = ctx.createLinearGradient(0, n * 0.55, 0, n);
            g.addColorStop(0, 'transparent');
            g.addColorStop(1, 'rgba(0,0,0,.75)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, n, n);
            ctx.fillStyle = '#fff';
            ctx.font = '800 54px system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(title.slice(0, 22), 30, n - 40);
        })();
    };
    return (
        <>
            {picks.map((p) => (
                <CoverImg id={p.albumId} key={p.id} onReady={ready(p.id)} />
            ))}
            <canvas
                height={600}
                id="sour-cover-maker"
                key={`${style}|${title}|${Object.keys(srcs).length}`}
                ref={draw}
                style={{ borderRadius: 12, maxWidth: '100%', width: 300 }}
                width={600}
            />
        </>
    );
};

export const CoverMakerAction = ({ ids, names }: { ids: string[]; names: string[] }) => {
    if (ids.length !== 1) return null;
    return (
        <ContextMenu.Item
            leftIcon="image"
            onSelect={() =>
                openModal({
                    children: <CoverMaker id={ids[0]} name={names[0]} />,
                    title: 'Make a cover',
                })
            }
        >
            Make a cover
        </ContextMenu.Item>
    );
};

// ---------- Hub: the prediction game ----------
export const PredictCard = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const qc = useQueryClient();
    const friends = (useSourProfiles().data ?? []).filter(
        (p) => p.id !== me?.id && p.online && p.listening,
    );
    const [friend, setFriend] = useState<null | string>(null);
    const [artist, setArtist] = useState('');
    const mine =
        useQuery({
            enabled: !!url && !!me,
            queryFn: async () =>
                (await (await fetch(`${url}/api/predict?profile=${me?.id}`)).json()) as {
                    actual?: string;
                    artist: string;
                    friendName: string;
                    id: string;
                    result: null | string;
                }[],
            queryKey: ['sour-predict', url, me?.id],
            refetchInterval: 30000,
        }).data ?? [];
    return (
        <Card icon="🔮" title="Call it">
            <Stack gap={6}>
                <Text isMuted size="xs">
                    Guess the artist a friend plays next. Right guesses earn 15 points.
                </Text>
                <Group gap="xs" wrap="nowrap">
                    <Select
                        data={friends.map((f) => ({ label: f.name, value: f.id }))}
                        onChange={setFriend}
                        placeholder={friends.length ? 'Friend' : 'Nobody listening'}
                        size="xs"
                        value={friend}
                        w={120}
                    />
                    <TextInput
                        onChange={(e) => setArtist(e.currentTarget.value)}
                        placeholder="Artist"
                        size="xs"
                        style={{ flex: 1 }}
                        value={artist}
                    />
                    <Button
                        disabled={!friend || !artist.trim()}
                        onClick={() =>
                            me &&
                            post(`${url}/api/predict`, {
                                artist,
                                friend,
                                key: me.key,
                                profile: me.id,
                            })
                                .then(() => {
                                    setArtist('');
                                    qc.invalidateQueries({ queryKey: ['sour-predict'] });
                                })
                                .catch(fail)
                        }
                        size="xs"
                    >
                        Call it
                    </Button>
                </Group>
                {mine.slice(0, 5).map((p) => (
                    <Text isMuted key={p.id} size="xs">
                        {p.friendName} plays {p.artist}?{' '}
                        {p.result === 'right'
                            ? '✅ called it'
                            : p.result === 'wrong'
                              ? `❌ (${p.actual})`
                              : '⏳'}
                    </Text>
                ))}
            </Stack>
        </Card>
    );
};

// ---------- close friends ----------
export const CloseFriendButton = ({ id, name }: { id: string; name: string }) => {
    const close = useSourStore((s) => s.closeFriends ?? []);
    const on = close.includes(id);
    return (
        <Button
            onClick={() => {
                useSourStore
                    .getState()
                    .set({ closeFriends: on ? close.filter((x) => x !== id) : [...close, id] });
                toast.info({
                    message: on
                        ? `${name} is no longer a close friend`
                        : `${name} is a close friend now`,
                });
            }}
            size="xs"
            variant={on ? 'light' : 'subtle'}
        >
            {on ? '★ Close friend' : '☆ Close friend'}
        </Button>
    );
};

// ---------- shop: outfit presets ----------
export const OutfitPresets = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const mine = useMyProfile().data;
    const presets = useSourStore((s) => s.outfits ?? []);
    const qc = useQueryClient();
    const [name, setName] = useState('');
    if (!me || !mine) return null;
    const current = { ...(mine.looks ?? {}), decoration: mine.decoration ?? undefined } as Record<
        string,
        string | undefined
    >;
    const wear = async (o: Record<string, string | undefined>) => {
        for (const slot of [
            'decoration',
            'frame',
            'nameStyle',
            'banner',
            'effect',
            'bubble',
            'sidebar',
        ]) {
            await post(`${url}/api/shop/equip`, {
                item: o[slot] || null,
                key: me.key,
                profile: me.id,
                slot,
            }).catch(() => {});
        }
        qc.invalidateQueries({ queryKey: ['sour-me'] });
        toast.success({ message: 'Outfit on' });
    };
    return (
        <Stack gap={4}>
            <Text fw={700} size="sm">
                Outfits
            </Text>
            <Group gap={4}>
                {presets.map((p) => (
                    <Button
                        key={p.name}
                        onClick={() => wear(p.looks)}
                        size="compact-xs"
                        variant="light"
                    >
                        {p.name}
                    </Button>
                ))}
                <TextInput
                    onChange={(e) => setName(e.currentTarget.value)}
                    placeholder="Name this outfit"
                    size="xs"
                    value={name}
                    w={150}
                />
                <Button
                    disabled={!name.trim()}
                    onClick={() => {
                        useSourStore.getState().set({
                            outfits: [
                                ...presets.filter((p) => p.name !== name.trim()),
                                { looks: current, name: name.trim() },
                            ].slice(-8),
                        });
                        setName('');
                    }}
                    size="compact-xs"
                    variant="default"
                >
                    Save what I&apos;m wearing
                </Button>
            </Group>
        </Stack>
    );
};

// ---------- first start: a short setup guide ----------
export const SetupGuide = () => {
    const done = useSourStore((s) => !!s.setupDone);
    const me = useSourStore((s) => s.me);
    const url = useHermesUrl();
    const { setUrl } = useHermesVideoActions();
    const [step, setStep] = useState(0);
    const [addr, setAddr] = useState(url || '');
    const ui = useSourStore((s) => s.look.ui ?? 'liquid');
    const navigate = useNavigate();
    if (done || (me && url)) return null;
    const finish = () => useSourStore.getState().set({ setupDone: true });
    return (
        <div
            style={{
                background: 'rgb(0 0 0 / 55%)',
                display: 'grid',
                inset: 0,
                placeItems: 'center',
                position: 'fixed',
                zIndex: 500,
            }}
        >
            <div
                style={{
                    background: 'var(--theme-colors-surface)',
                    borderRadius: 18,
                    maxWidth: 460,
                    padding: 24,
                    width: 'calc(100vw - 32px)',
                }}
            >
                <Stack gap="md">
                    <Text fw={800} size="xl">
                        🍋 Welcome to Sour Player
                    </Text>
                    {step === 0 && (
                        <>
                            <Text size="sm">
                                First, the address of Hermes Music (your group&apos;s Umbrel). An
                                admin can tell you, it looks like http://192.168.1.20:3340.
                            </Text>
                            <TextInput
                                onChange={(e) => setAddr(e.currentTarget.value)}
                                placeholder="http://..."
                                value={addr}
                            />
                            <Button
                                disabled={!/^https?:\/\//.test(addr.trim())}
                                onClick={() => {
                                    setUrl(addr.trim());
                                    setStep(1);
                                }}
                            >
                                Next
                            </Button>
                        </>
                    )}
                    {step === 1 && (
                        <>
                            <Text size="sm">
                                Pick how it looks (you can change it any time in Sour Studio).
                            </Text>
                            <SegmentedControl
                                data={[
                                    { label: 'New (v0.10)', value: 'liquid' },
                                    { label: 'v2 (v0.9)', value: 'new' },
                                    { label: 'Classic', value: 'classic' },
                                ]}
                                onChange={(v) =>
                                    useSourStore.getState().setLook({ ui: v as 'liquid' })
                                }
                                value={ui}
                            />
                            <Button onClick={() => setStep(2)}>Next</Button>
                        </>
                    )}
                    {step === 2 && (
                        <>
                            <Text size="sm">
                                Last step: sign in to the music server with your Navidrome account.
                                Your profile is made from it, and friends will see you in the Sour
                                Hub.
                            </Text>
                            <Button
                                onClick={() => {
                                    finish();
                                    navigate('/servers');
                                }}
                            >
                                Sign in
                            </Button>
                        </>
                    )}
                    <Button onClick={finish} size="xs" variant="subtle">
                        Skip
                    </Button>
                </Stack>
            </div>
        </div>
    );
};

// ---------- admin: the log and approvals ----------
export const AdminExtras = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const mine = useMyProfile().data;
    const qc = useQueryClient();
    const auth = me ? { key: me.key, profile: me.id } : null;
    const approvals =
        useQuery({
            enabled: !!url && !!mine?.admin,
            queryFn: async () =>
                (await (await fetch(`${url}/api/requests/approval`)).json()) as {
                    by?: string;
                    id: string;
                    query: string;
                    type: string;
                }[],
            queryKey: ['hermes-approvals', url],
            refetchInterval: 30000,
        }).data ?? [];
    const log =
        useQuery({
            enabled: !!url && !!mine?.admin && !!auth,
            queryFn: () =>
                post(`${url}/api/admin/log`, auth) as Promise<
                    { at: number; by: null | string; kind: string; text: string }[]
                >,
            queryKey: ['hermes-admin-log', url],
            refetchInterval: 60000,
        }).data ?? [];
    if (!mine?.admin) return null;
    const answer = (id: string, yes: boolean) =>
        auth &&
        post(`${url}/api/requests/approval`, { ...auth, id, yes })
            .then(() => qc.invalidateQueries({ queryKey: ['hermes-approvals', url] }))
            .catch(fail);
    return (
        <Card icon="📋" title="Waiting for an admin, and what changed">
            <Stack gap={6}>
                {approvals.map((a) => (
                    <Group gap="xs" justify="space-between" key={a.id} wrap="nowrap">
                        <Text size="sm" truncate>
                            {a.type}: {a.query}
                            {a.by ? ` (${a.by})` : ''}
                        </Text>
                        <Group gap={4} wrap="nowrap">
                            <Button onClick={() => answer(a.id, true)} size="compact-xs">
                                Yes
                            </Button>
                            <Button
                                onClick={() => answer(a.id, false)}
                                size="compact-xs"
                                variant="subtle"
                            >
                                No
                            </Button>
                        </Group>
                    </Group>
                ))}
                {!approvals.length && (
                    <Text isMuted size="xs">
                        No big requests waiting (turn approvals on in Hermes Music&#39;s Config).
                    </Text>
                )}
                <Stack gap={2} mah={220} style={{ overflowY: 'auto' }}>
                    {log.slice(0, 50).map((l) => (
                        <Text isMuted key={`${l.at}-${l.text}`} size="xs">
                            {new Date(l.at).toLocaleString([], {
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                month: 'short',
                            })}{' '}
                            - {l.by ? `${l.by}: ` : ''}
                            {l.text}
                        </Text>
                    ))}
                </Stack>
            </Stack>
        </Card>
    );
};
