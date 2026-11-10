import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { generatePath, useNavigate } from 'react-router';

import styles from './phone-tabs.module.css';

import { api } from '/@/renderer/api';
import { ItemImage } from '/@/renderer/components/item-image/item-image';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { playlistsQueries } from '/@/renderer/features/playlists/api/playlists-api';
import { isNativeApp, onSourMedia, sourMedia } from '/@/renderer/features/sour/mobile/android';
import {
    clearOffline,
    offlineAvailable,
    offlineBytes,
    onOfflineProgress,
    setPlaylistOffline,
    syncOffline,
} from '/@/renderer/features/sour/mobile/offline';
import { usePhoneSettings, usePhoneStore } from '/@/renderer/features/sour/mobile/phone-store';
import { AppRoute } from '/@/renderer/router/routes';
import { useCurrentServer } from '/@/renderer/store';
import { usePlayerVolume } from '/@/renderer/store/player.store';
import { Icon } from '/@/shared/components/icon/icon';
import { Switch } from '/@/shared/components/switch/switch';
import { toast } from '/@/shared/components/toast/toast';
import {
    AlbumArtistListSort,
    AlbumListSort,
    LibraryItem,
    PlaylistListSort,
    SortOrder,
} from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

// The phone app's tabs in the 0.11 look (after Substreamer's layout): Home, Library, Offline, Friends, You.

const mb = (bytes: number) =>
    bytes >= 1024 ** 3
        ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
        : `${Math.round(bytes / 1024 ** 2)} MB`;

const TabPage = ({
    children,
    right,
    title,
}: {
    children: ReactNode;
    right?: ReactNode;
    title: string;
}) => (
    <div className={styles.page}>
        <header className={styles.header}>
            <h1>{title}</h1>
            {right}
        </header>
        {children}
    </div>
);

// ---------- the search bar at the top of Home and Library (opens Search) ----------
export const PhoneSearchBar = ({
    placeholder = 'Search songs, albums, artists',
}: {
    placeholder?: string;
}) => {
    const navigate = useNavigate();
    return (
        <button
            className={styles.searchBar}
            onClick={() => navigate(AppRoute.PHONE_SEARCH)}
            type="button"
        >
            <Icon icon="search" size="md" />
            <span>{placeholder}</span>
        </button>
    );
};

// ---------- volume: the phone's own media volume in the app (the side buttons move it too) ----------
export const PhoneVolume = () => {
    const native = isNativeApp();
    const player = usePlayer();
    const appVolume = usePlayerVolume();
    const [phone, setPhone] = useState<null | number>(null);
    useEffect(() => {
        if (!native) return undefined;
        sourMedia('volume')
            .then((r: { value?: number }) => setPhone(Number(r?.value ?? 1)))
            .catch(() => setPhone(null));
        return onSourMedia('volume', (d: { value?: number }) => setPhone(Number(d?.value ?? 0)));
    }, [native]);
    const value = native && phone != null ? Math.round(phone * 100) : appVolume;
    const change = (v: number) => {
        if (native && phone != null) {
            setPhone(v / 100);
            sourMedia('setVolume', { value: v / 100 }).catch(() => {});
        } else player.setVolume(v);
    };
    return (
        <div className={styles.volume}>
            <button
                aria-label="Quieter"
                onClick={() => change(Math.max(0, value - 10))}
                type="button"
            >
                <Icon icon={value === 0 ? 'volumeMute' : 'volumeNormal'} size="md" />
            </button>
            <input
                aria-label="Volume"
                max={100}
                min={0}
                onChange={(e) => change(Number(e.currentTarget.value))}
                style={{ '--level': `${value}%` } as React.CSSProperties}
                type="range"
                value={value}
            />
            <button
                aria-label="Louder"
                onClick={() => change(Math.min(100, value + 10))}
                type="button"
            >
                <Icon icon="volumeMax" size="md" />
            </button>
        </div>
    );
};

// ---------- Offline: its own tab (it used to be a window under Library) ----------
export const PhoneOffline = () => {
    const server = useCurrentServer();
    const settings = usePhoneSettings();
    const offline = usePhoneStore((s) => s.offline);
    const offlinePlaylists = usePhoneStore((s) => s.offlinePlaylists);
    const player = usePlayer();
    const [status, setStatus] = useState('');
    const [online, setOnline] = useState(() => navigator.onLine);
    useEffect(() => onOfflineProgress(setStatus), []);
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);
    const playlists =
        useQuery(
            playlistsQueries.list({
                options: { enabled: !!server?.id && online },
                query: { sortBy: PlaylistListSort.NAME, sortOrder: SortOrder.ASC, startIndex: 0 },
                serverId: server?.id,
            }),
        ).data?.items ?? [];
    const saved = Object.values(offline).map((o) => o.song);
    const used = offlineBytes();
    const limit = settings.offlineLimitMb * 1024 * 1024;
    const play = (shuffle: boolean, from?: string) => {
        const songs = shuffle ? [...saved].sort(() => Math.random() - 0.5) : saved;
        player.addToQueueByData(songs, Play.NOW, from);
    };
    if (!offlineAvailable()) {
        return (
            <TabPage title="Offline">
                <p className={styles.note}>
                    Saving songs for offline needs the Sour Player app (or the web app added to the
                    Home Screen).
                </p>
            </TabPage>
        );
    }
    return (
        <TabPage title="Offline">
            <div className={styles.storage}>
                <div className={styles.storageBar}>
                    <span
                        style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }}
                    />
                </div>
                <small>
                    {saved.length} songs · {mb(used)} of {mb(limit)}
                    {online ? '' : ' · no internet: only these play'}
                    {status ? ` · ${status}` : ''}
                </small>
            </div>
            {saved.length > 0 && (
                <div className={styles.actions}>
                    <button className={styles.primary} onClick={() => play(false)} type="button">
                        <Icon icon="mediaPlay" size="md" /> Play all
                    </button>
                    <button className={styles.secondary} onClick={() => play(true)} type="button">
                        <Icon icon="mediaShuffle" size="md" /> Shuffle
                    </button>
                </div>
            )}
            <section className={styles.section}>
                <h2>Playlists on this phone</h2>
                {!online && <p className={styles.note}>Connect to the internet to change these.</p>}
                <div className={styles.cardList}>
                    {playlists.map((p) => (
                        <Switch
                            checked={!!offlinePlaylists[p.id]}
                            disabled={!online}
                            key={p.id}
                            label={`${p.name} (${p.songCount ?? 0})`}
                            onChange={(e) =>
                                setPlaylistOffline(p.id, server!.id, e.currentTarget.checked)
                            }
                        />
                    ))}
                </div>
            </section>
            <section className={styles.section}>
                <h2>Saved songs</h2>
                {saved.length === 0 ? (
                    <p className={styles.note}>
                        Nothing saved yet: switch on a playlist above and its songs download here.
                    </p>
                ) : (
                    <div className={styles.list}>
                        {saved.slice(0, 400).map((song) => (
                            <button
                                className={styles.songRow}
                                key={song.id}
                                onClick={() => play(false, song.id)}
                                type="button"
                            >
                                <ItemImage
                                    className={styles.rowImage}
                                    id={song.imageId}
                                    itemType={LibraryItem.SONG}
                                    type="table"
                                />
                                <span className={styles.rowText}>
                                    {song.name}
                                    <small>{song.artistName}</small>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </section>
            <section className={styles.section}>
                <h2>Settings</h2>
                <div className={styles.cardList}>
                    <Switch
                        checked={settings.offlineWifiOnly}
                        label="Only download on Wi-Fi"
                        onChange={(e) =>
                            usePhoneStore
                                .getState()
                                .set({ offlineWifiOnly: e.currentTarget.checked })
                        }
                    />
                    <label className={styles.limit}>
                        Space for saved songs
                        <select
                            onChange={(e) =>
                                usePhoneStore
                                    .getState()
                                    .set({ offlineLimitMb: Number(e.currentTarget.value) })
                            }
                            value={settings.offlineLimitMb}
                        >
                            {[
                                ...new Set([
                                    1000,
                                    2000,
                                    4000,
                                    8000,
                                    16000,
                                    32000,
                                    64000,
                                    settings.offlineLimitMb,
                                ]),
                            ]
                                .sort((x, y) => x - y)
                                .map((n) => (
                                    <option key={n} value={n}>
                                        {mb(n * 1024 * 1024)}
                                    </option>
                                ))}
                        </select>
                    </label>
                </div>
                <div className={styles.actions}>
                    <button
                        className={styles.secondary}
                        disabled={!online}
                        onClick={() => syncOffline()}
                        type="button"
                    >
                        Download now
                    </button>
                    <button
                        className={styles.danger}
                        onClick={() =>
                            clearOffline().then(() =>
                                toast.success({ message: 'Offline songs removed' }),
                            )
                        }
                        type="button"
                    >
                        Remove all
                    </button>
                </div>
            </section>
        </TabPage>
    );
};

// ---------- Library: albums, artists and playlists right in the tab (grid or list), the rest as chips ----------
const MORE: { icon: Parameters<typeof Icon>[0]['icon']; label: string; to: string }[] = [
    { icon: 'favorite', label: 'Favorites', to: AppRoute.FAVORITES },
    { icon: 'itemSong', label: 'Songs', to: AppRoute.LIBRARY_SONGS },
    { icon: 'genre', label: 'Genres', to: AppRoute.LIBRARY_GENRES },
    { icon: 'folder', label: 'Folders', to: AppRoute.LIBRARY_FOLDERS },
    { icon: 'radio', label: 'Radio', to: AppRoute.RADIO },
    { icon: 'grid', label: 'Tools', to: AppRoute.SOUR_LIBRARY },
];
type Kind = 'albums' | 'artists' | 'playlists';
const PAGE = 60;
const KIND_KEY = 'sour-phone-library-kind';
const GRID_KEY = 'sour-phone-library-grid';
const saved = (k: string, fallback: string) => {
    try {
        return localStorage.getItem(k) || fallback;
    } catch {
        return fallback;
    }
};
const keep = (k: string, v: string) => {
    try {
        localStorage.setItem(k, v);
    } catch {
        /* private mode: not remembered */
    }
};

type Item = { id: string; imageId?: null | string; name: string; sub: string; to: string };

const useLibraryItems = (kind: Kind, serverId?: string) =>
    useInfiniteQuery({
        enabled: !!serverId,
        getNextPageParam: (last: { items: Item[]; next: number }) =>
            last.items.length < PAGE ? undefined : last.next,
        initialPageParam: 0,
        queryFn: async ({ pageParam, signal }): Promise<{ items: Item[]; next: number }> => {
            const apiClientProps = { serverId: serverId!, signal };
            const query = { limit: PAGE, sortOrder: SortOrder.ASC, startIndex: pageParam };
            let items: Item[] = [];
            if (kind === 'albums') {
                const r: any = await api.controller.getAlbumList({
                    apiClientProps,
                    query: { ...query, sortBy: AlbumListSort.NAME },
                } as any);
                items = (r?.items ?? []).map((a: any) => ({
                    id: a.id,
                    imageId: a.imageId,
                    name: a.name,
                    sub: [a.albumArtistName, a.releaseYear].filter(Boolean).join(' · '),
                    to: generatePath(AppRoute.LIBRARY_ALBUMS_DETAIL, { albumId: a.id }),
                }));
            } else if (kind === 'artists') {
                const r: any = await api.controller.getAlbumArtistList({
                    apiClientProps,
                    query: { ...query, sortBy: AlbumArtistListSort.NAME },
                } as any);
                items = (r?.items ?? []).map((a: any) => ({
                    id: a.id,
                    imageId: a.imageId,
                    name: a.name,
                    sub:
                        a.albumCount != null
                            ? `${a.albumCount} album${a.albumCount === 1 ? '' : 's'}`
                            : '',
                    to: generatePath(AppRoute.LIBRARY_ALBUM_ARTISTS_DETAIL, {
                        albumArtistId: a.id,
                    }),
                }));
            } else {
                const r: any = await api.controller.getPlaylistList({
                    apiClientProps,
                    query: { ...query, sortBy: PlaylistListSort.NAME },
                } as any);
                items = (r?.items ?? []).map((p: any) => ({
                    id: p.id,
                    imageId: p.imageId,
                    name: p.name,
                    sub: `${p.songCount ?? 0} songs${p.owner ? ` · ${p.owner}` : ''}`,
                    to: generatePath(AppRoute.PLAYLISTS_DETAIL_SONGS, { playlistId: p.id }),
                }));
            }
            return { items, next: pageParam + PAGE };
        },
        queryKey: ['sour-phone-library', serverId, kind],
        staleTime: 5 * 60 * 1000,
    });

export const PhoneLibraryTab = () => {
    const navigate = useNavigate();
    const server = useCurrentServer();
    const [kind, setKind] = useState<Kind>(() => saved(KIND_KEY, 'albums') as Kind);
    const [grid, setGrid] = useState(() => saved(GRID_KEY, 'grid') === 'grid');
    const list = useLibraryItems(kind, server?.id);
    const items = list.data?.pages.flatMap((p) => p.items) ?? [];
    const [more, setMore] = useState<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!more) return undefined;
        const watch = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && list.hasNextPage && !list.isFetchingNextPage)
                    list.fetchNextPage();
            },
            { rootMargin: '600px' },
        );
        watch.observe(more);
        return () => watch.disconnect();
    }, [list, more]);
    const itemType =
        kind === 'albums'
            ? LibraryItem.ALBUM
            : kind === 'artists'
              ? LibraryItem.ALBUM_ARTIST
              : LibraryItem.PLAYLIST;
    return (
        <TabPage
            right={
                <button
                    aria-label={grid ? 'Show as a list' : 'Show as a grid'}
                    className={styles.iconButton}
                    onClick={() => {
                        setGrid(!grid);
                        keep(GRID_KEY, grid ? 'list' : 'grid');
                    }}
                    type="button"
                >
                    <Icon icon={grid ? 'list' : 'grid'} size="lg" />
                </button>
            }
            title="Library"
        >
            <PhoneSearchBar placeholder="Search your library" />
            <div className={styles.chips}>
                {MORE.map((m) => (
                    <button
                        className={styles.chip}
                        key={m.label}
                        onClick={() => navigate(m.to)}
                        type="button"
                    >
                        <Icon icon={m.icon} size="sm" /> {m.label}
                    </button>
                ))}
            </div>
            <div className={styles.segments} role="tablist">
                {(['albums', 'artists', 'playlists'] as Kind[]).map((k) => (
                    <button
                        aria-selected={kind === k}
                        className={kind === k ? styles.segmentOn : styles.segment}
                        key={k}
                        onClick={() => {
                            setKind(k);
                            keep(KIND_KEY, k);
                        }}
                        role="tab"
                        type="button"
                    >
                        {k[0].toUpperCase() + k.slice(1)}
                    </button>
                ))}
            </div>
            <div className={grid ? styles.grid : styles.list}>
                {items.map((it) => (
                    <button
                        className={grid ? styles.card : styles.songRow}
                        key={it.id}
                        onClick={() => navigate(it.to)}
                        type="button"
                    >
                        <ItemImage
                            className={
                                grid
                                    ? kind === 'artists'
                                        ? styles.cardRound
                                        : styles.cardImage
                                    : styles.rowImage
                            }
                            id={it.imageId}
                            itemType={itemType}
                            type={grid ? 'itemCard' : 'table'}
                        />
                        <span className={grid ? styles.cardText : styles.rowText}>
                            {it.name}
                            {it.sub && <small>{it.sub}</small>}
                        </span>
                    </button>
                ))}
            </div>
            <div className={styles.more} ref={setMore}>
                {list.isFetching ? 'Loading...' : !items.length ? 'Nothing here yet' : ''}
            </div>
        </TabPage>
    );
};

// ---------- the top of Home on phones: search, and the places people go most ----------
export const PhoneHomeTop = () => {
    const navigate = useNavigate();
    return (
        <div className={styles.homeTop}>
            <PhoneSearchBar />
            <div className={styles.chips}>
                <button
                    className={styles.chip}
                    onClick={() => navigate(AppRoute.PHONE_OFFLINE)}
                    type="button"
                >
                    <Icon icon="download" size="sm" /> Offline
                </button>
                <button
                    className={styles.chip}
                    onClick={() => navigate(AppRoute.FAVORITES)}
                    type="button"
                >
                    <Icon icon="favorite" size="sm" /> Favorites
                </button>
                <button
                    className={styles.chip}
                    onClick={() => navigate(AppRoute.PHONE_TV)}
                    type="button"
                >
                    <Icon icon="tv" size="sm" /> TV party
                </button>
            </div>
        </div>
    );
};

// ---------- Sour Player TV, inside the app: the party page from Hermes Music. With Screen Mirroring, AirPlay
// or a cable, the app puts the party's big picture on the TV and keeps the buttons on the phone ----------
export const PhoneTV = () => {
    const url = useHermesUrl();
    const navigate = useNavigate();
    const player = usePlayer();
    const [screens, setScreens] = useState(0);
    useEffect(() => {
        if (!url) return undefined;
        // the party plays its own music: the app's player stops while it's open
        player.mediaPause();
        const onMessage = (e: MessageEvent) => {
            if (!e.origin || !url.startsWith(e.origin)) return; // only Hermes Music's TV page
            const tv = (e.data as { sourtv?: { auth?: null | string; code?: null | string } })
                ?.sourtv;
            if (!tv) return;
            const address = tv.code
                ? `${url}/tv/?screen=${encodeURIComponent(tv.code)}${tv.auth ? `&a=${encodeURIComponent(tv.auth)}` : ''}`
                : null;
            sourMedia('tvShow', { url: address })
                .then((r: { screens?: number }) => setScreens(r?.screens ?? 0))
                .catch(() => {});
        };
        window.addEventListener('message', onMessage);
        const off = onSourMedia('tv', (d: { screens?: number }) => setScreens(d?.screens ?? 0));
        return () => {
            window.removeEventListener('message', onMessage);
            off();
            sourMedia('tvShow', { url: null }).catch(() => {});
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url]);
    if (!url) {
        return (
            <TabPage title="TV party">
                <p className={styles.note}>
                    TV parties run on Hermes Music: add it first (You, then Settings).
                </p>
            </TabPage>
        );
    }
    return (
        <div className={styles.tv}>
            <div className={styles.tvBar}>
                <button className={styles.back} onClick={() => navigate(-1)} type="button">
                    <Icon icon="arrowLeftS" size="md" /> Back
                </button>
                <span>
                    {screens > 0
                        ? 'The party is on the TV'
                        : isNativeApp()
                          ? 'Turn on Screen Mirroring (or plug in the TV) to show it big'
                          : ''}
                </span>
            </div>
            <iframe
                allow="autoplay; fullscreen"
                className={styles.tvFrame}
                src={`${url}/tv/?app=1&parent=${encodeURIComponent(window.location.origin)}`}
                title="Sour Player TV"
            />
        </div>
    );
};
