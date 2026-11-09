import { useQuery } from '@tanstack/react-query';
import { nanoid } from 'nanoid/non-secure';
import { ReactNode, useState } from 'react';
import { createSearchParams, generatePath, useNavigate } from 'react-router';

import packageJson from '../../../../../package.json';
import styles from './phone-pages.module.css';

import { ItemImage } from '/@/renderer/components/item-image/item-image';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { genresQueries } from '/@/renderer/features/genres/api/genres-api';
import { useGroupPlayStore } from '/@/renderer/features/group-play/store/group-play.store';
import { openRequestWindow } from '/@/renderer/features/hermes-request/components/request-button';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { playlistsQueries } from '/@/renderer/features/playlists/api/playlists-api';
import { FindSong } from '/@/renderer/features/sour/components/extras10';
import { openFeedback } from '/@/renderer/features/sour/components/feedback';
import { MoodTiles } from '/@/renderer/features/sour/components/home-plus';
import { openPeople, openProfile } from '/@/renderer/features/sour/components/people';
import { ProfileAvatar } from '/@/renderer/features/sour/components/profile-bits';
import { openInbox, useInbox } from '/@/renderer/features/sour/components/social10';
import { openSourStudio } from '/@/renderer/features/sour/components/sour-studio';
import { useBotAccess } from '/@/renderer/features/sour/discord-bot/bot-api';
import { isNativeApp } from '/@/renderer/features/sour/mobile/android';
import { offlineAvailable } from '/@/renderer/features/sour/mobile/offline';
import { openDriving } from '/@/renderer/features/sour/mobile/phone-features';
import {
    openOffline,
    openPhoneSettings,
    openQr,
    whatsPlaying,
} from '/@/renderer/features/sour/mobile/phone-panels';
import { useMyProfile, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { AppRoute } from '/@/renderer/router/routes';
import { useCurrentServer } from '/@/renderer/store';
import { Icon } from '/@/shared/components/icon/icon';
import {
    AlbumListSort,
    GenreListSort,
    LibraryItem,
    PlaylistListSort,
    SortOrder,
} from '/@/shared/types/domain-types';

// The phone tabs that aren't a normal page: Library (everything you have), Search (find, browse,
// request) and You (your profile, inbox, shop, settings...).

type IconName = Parameters<typeof Icon>[0]['icon'];

const PhonePage = ({
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

const Row = ({
    badge,
    icon,
    label,
    note,
    onClick,
}: {
    badge?: number;
    icon: IconName;
    label: string;
    note?: string;
    onClick: () => void;
}) => (
    <button className={styles.row} onClick={onClick} type="button">
        <span className={styles.rowIcon}>
            <Icon icon={icon} size="lg" />
        </span>
        <span className={styles.rowLabel}>
            {label}
            {note && <small>{note}</small>}
        </span>
        {!!badge && <span className={styles.badge}>{badge > 9 ? '9+' : badge}</span>}
        <Icon icon="arrowRightS" size="md" />
    </button>
);

const MeButton = () => {
    const navigate = useNavigate();
    const mine = useMyProfile().data;
    if (!mine) return null;
    return (
        <button
            aria-label="You"
            className={styles.meButton}
            onClick={() => navigate(AppRoute.PHONE_ME)}
            type="button"
        >
            <ProfileAvatar profile={mine} size={34} />
        </button>
    );
};

// ---------- Library ----------
const LIBRARY: { icon: IconName; label: string; to: string }[] = [
    { icon: 'playlist', label: 'Playlists', to: AppRoute.PLAYLISTS },
    { icon: 'album', label: 'Albums', to: AppRoute.LIBRARY_ALBUMS },
    { icon: 'artist', label: 'Artists', to: AppRoute.LIBRARY_ALBUM_ARTISTS },
    { icon: 'itemSong', label: 'Songs', to: AppRoute.LIBRARY_SONGS },
    { icon: 'favorite', label: 'Favorites', to: AppRoute.FAVORITES },
    { icon: 'genre', label: 'Genres', to: AppRoute.LIBRARY_GENRES },
    { icon: 'folder', label: 'Folders', to: AppRoute.LIBRARY_FOLDERS },
    { icon: 'radio', label: 'Radio stations', to: AppRoute.RADIO },
    { icon: 'grid', label: 'Cover wall and tools', to: AppRoute.SOUR_LIBRARY },
];

export const PhoneLibrary = () => {
    const navigate = useNavigate();
    const server = useCurrentServer();
    const playlists = useQuery(
        playlistsQueries.list({
            options: { enabled: !!server?.id },
            query: { sortBy: PlaylistListSort.NAME, sortOrder: SortOrder.ASC, startIndex: 0 },
            serverId: server?.id,
        }),
    ).data?.items;
    const recent = useQuery(
        albumQueries.list({
            options: { enabled: !!server?.id },
            query: {
                limit: 12,
                sortBy: AlbumListSort.RECENTLY_ADDED,
                sortOrder: SortOrder.DESC,
                startIndex: 0,
            },
            serverId: server?.id || '',
        }),
    ).data?.items;
    return (
        <PhonePage right={<MeButton />} title="Library">
            <div className={styles.list}>
                {LIBRARY.map((r) => (
                    <Row
                        icon={r.icon}
                        key={r.label}
                        label={r.label}
                        onClick={() => navigate(r.to)}
                    />
                ))}
                {offlineAvailable() && (
                    <Row icon="download" label="Downloaded" onClick={openOffline} />
                )}
            </div>
            {!!recent?.length && (
                <section className={styles.section}>
                    <h2>Recently added</h2>
                    <div className={styles.shelf}>
                        {recent.map((a) => (
                            <button
                                className={styles.tile}
                                key={a.id}
                                onClick={() =>
                                    navigate(
                                        generatePath(AppRoute.LIBRARY_ALBUMS_DETAIL, {
                                            albumId: a.id,
                                        }),
                                    )
                                }
                                type="button"
                            >
                                <ItemImage
                                    className={styles.tileImage}
                                    id={a.imageId}
                                    itemType={LibraryItem.ALBUM}
                                    type="itemCard"
                                />
                                <span className={styles.tileTitle}>{a.name}</span>
                                <span className={styles.tileSub}>{a.albumArtistName}</span>
                            </button>
                        ))}
                    </div>
                </section>
            )}
            {!!playlists?.length && (
                <section className={styles.section}>
                    <h2>Your playlists</h2>
                    <div className={styles.list}>
                        {playlists.slice(0, 60).map((p) => (
                            <button
                                className={styles.row}
                                key={p.id}
                                onClick={() =>
                                    navigate(
                                        generatePath(AppRoute.PLAYLISTS_DETAIL_SONGS, {
                                            playlistId: p.id,
                                        }),
                                    )
                                }
                                type="button"
                            >
                                <ItemImage
                                    className={styles.rowImage}
                                    id={p.imageId}
                                    itemType={LibraryItem.PLAYLIST}
                                    type="table"
                                />
                                <span className={styles.rowLabel}>
                                    {p.name}
                                    <small>
                                        {p.songCount ?? 0} songs{p.owner ? ` - ${p.owner}` : ''}
                                    </small>
                                </span>
                                <Icon icon="arrowRightS" size="md" />
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </PhonePage>
    );
};

// ---------- Search ----------
const GENRE_COLORS = [
    '#7c3aed',
    '#db2777',
    '#ea580c',
    '#16a34a',
    '#0891b2',
    '#4f46e5',
    '#ca8a04',
    '#be123c',
    '#0d9488',
    '#9333ea',
];

export const PhoneSearch = () => {
    const navigate = useNavigate();
    const server = useCurrentServer();
    const recentSearches = useSourStore((s) => s.recentSearches ?? []);
    const [text, setText] = useState('');
    const genres = useQuery(
        genresQueries.list({
            options: { enabled: !!server?.id },
            query: {
                limit: 24,
                sortBy: GenreListSort.SONG_COUNT,
                sortOrder: SortOrder.DESC,
                startIndex: 0,
            },
            serverId: server?.id || '',
        }),
    ).data?.items;
    const go = (q: string) => {
        const query = q.trim();
        if (!query) return;
        useSourStore.getState().set({
            recentSearches: [
                query,
                ...recentSearches.filter((x) => x.toLowerCase() !== query.toLowerCase()),
            ].slice(0, 8),
        });
        navigate(
            {
                pathname: generatePath(AppRoute.SEARCH, { itemType: LibraryItem.SONG }),
                search: createSearchParams({ query }).toString(),
            },
            { state: { navigationId: nanoid() } },
        );
    };
    return (
        <PhonePage right={<MeButton />} title="Search">
            <form
                className={styles.searchBox}
                onSubmit={(e) => {
                    e.preventDefault();
                    go(text);
                }}
            >
                <Icon icon="search" size="lg" />
                <input
                    aria-label="Search"
                    enterKeyHint="search"
                    onChange={(e) => setText(e.currentTarget.value)}
                    placeholder="Songs, artists, albums"
                    type="search"
                    value={text}
                />
            </form>
            {!!recentSearches.length && (
                <section className={styles.section}>
                    <div className={styles.sectionHead}>
                        <h2>Recent</h2>
                        <button
                            className={styles.link}
                            onClick={() => useSourStore.getState().set({ recentSearches: [] })}
                            type="button"
                        >
                            Clear
                        </button>
                    </div>
                    <div className={styles.chips}>
                        {recentSearches.map((q) => (
                            <button
                                className={styles.chip}
                                key={q}
                                onClick={() => go(q)}
                                type="button"
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                </section>
            )}
            <section className={styles.section}>
                <MoodTiles />
            </section>
            {!!genres?.length && (
                <section className={styles.section}>
                    <h2>Browse genres</h2>
                    <div className={styles.genres}>
                        {genres
                            .filter((g) => g.name)
                            .map((g, i) => (
                                <button
                                    className={styles.genre}
                                    key={g.id}
                                    onClick={() =>
                                        navigate(
                                            generatePath(AppRoute.LIBRARY_GENRES_DETAIL, {
                                                genreId: g.id,
                                            }),
                                        )
                                    }
                                    style={{ background: GENRE_COLORS[i % GENRE_COLORS.length] }}
                                    type="button"
                                >
                                    {g.name}
                                </button>
                            ))}
                    </div>
                </section>
            )}
            <section className={styles.card}>
                <FindSong />
            </section>
            <section className={styles.section}>
                <button className={styles.wide} onClick={openRequestWindow} type="button">
                    <Icon icon="download" size="lg" />
                    Not in the library? Request it
                </button>
            </section>
        </PhonePage>
    );
};

// ---------- You ----------
export const PhoneMe = () => {
    const navigate = useNavigate();
    const mine = useMyProfile().data;
    const hermes = useHermesUrl();
    const server = useCurrentServer();
    const unread = (useInbox().data ?? []).filter((m) => !m.read).length;
    const native = isNativeApp();
    const bot = useBotAccess();
    return (
        <PhonePage title="You">
            {mine ? (
                <button className={styles.profile} onClick={() => openProfile(mine)} type="button">
                    <ProfileAvatar profile={mine} size={64} />
                    <span className={styles.profileText}>
                        <strong>{mine.name}</strong>
                        <small>
                            {(mine.points ?? 0).toLocaleString()} points - see your profile
                        </small>
                    </span>
                    <Icon icon="arrowRightS" size="md" />
                </button>
            ) : (
                <button
                    className={styles.profile}
                    onClick={() => navigate(AppRoute.SETTINGS)}
                    type="button"
                >
                    <span className={styles.rowIcon}>
                        <Icon icon="user" size="lg" />
                    </span>
                    <span className={styles.profileText}>
                        <strong>{hermes ? 'Make your profile' : 'Connect Hermes Music'}</strong>
                        <small>
                            {hermes
                                ? 'Friends, listen along, Group Play and more'
                                : 'Settings > General > Hermes Music'}
                        </small>
                    </span>
                    <Icon icon="arrowRightS" size="md" />
                </button>
            )}
            <div className={styles.list}>
                <Row badge={unread} icon="bell" label="Inbox" onClick={openInbox} />
                <Row
                    icon="gift"
                    label="Shop"
                    note="Spend your points"
                    onClick={() => navigate(`${AppRoute.SOUR_HUB}?tab=shop`)}
                />
                <Row
                    icon="groupPlay"
                    label="Group Play"
                    onClick={() => useGroupPlayStore.setState({ panelOpen: true })}
                />
                <Row icon="user" label="People" onClick={openPeople} />
                <Row icon="download" label="Request music" onClick={openRequestWindow} />
            </div>
            <div className={styles.list}>
                {offlineAvailable() && (
                    <Row
                        icon="download"
                        label="Downloaded"
                        note="Songs saved for offline"
                        onClick={openOffline}
                    />
                )}
                {native && <Row icon="mediaPlay" label="Driving mode" onClick={openDriving} />}
                {native && <Row icon="search" label="Scan or show a code" onClick={openQr} />}
                {native && <Row icon="microphone" label="What's playing?" onClick={whatsPlaying} />}
                {native && (
                    <Row icon="settings" label="Phone settings" onClick={openPhoneSettings} />
                )}
                {bot && (
                    <Row
                        icon="bot"
                        label="Discord Bot"
                        note="Music, ambience and sound effects in a Discord call"
                        onClick={() => navigate(AppRoute.SOUR_DISCORD_BOT)}
                    />
                )}
            </div>
            <div className={styles.list}>
                <Row
                    icon="palette"
                    label="Sour Studio"
                    note="Looks, skins, visualizers"
                    onClick={openSourStudio}
                />
                <Row icon="settings" label="Settings" onClick={() => navigate(AppRoute.SETTINGS)} />
                <Row icon="messageCircle" label="Report a bug or an idea" onClick={openFeedback} />
            </div>
            <p className={styles.footer}>
                Sour Player {packageJson.version}
                {server?.name ? ` - ${server.name}` : ''}
            </p>
        </PhonePage>
    );
};
