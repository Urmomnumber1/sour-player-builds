import type { SourLayout } from '/@/renderer/features/sour/layouts/layout-kind';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { type ReactNode, useState } from 'react';
import { generatePath, useLocation, useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';

import { ItemImage } from '/@/renderer/components/item-image/item-image';
import { GroupPlayButton } from '/@/renderer/features/group-play/components/group-play-button';
import { PlayCounter } from '/@/renderer/features/hermes-plays/components/play-counter';
import { RequestButton } from '/@/renderer/features/hermes-request/components/request-button';
import { HermesUpdateButton } from '/@/renderer/features/hermes-update/components/hermes-update-button';
import { MusicVideoButton } from '/@/renderer/features/hermes-video/components/music-video-button';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { PopoverPlayQueue } from '/@/renderer/features/now-playing/components/popover-play-queue';
import { DlnaCastButton } from '/@/renderer/features/player/components/dlna-cast-button';
import { PlayerConfig } from '/@/renderer/features/player/components/player-config';
import {
    AutoDJButton,
    FavoriteButton,
    LyricsButton,
    RatingButton,
    SourWatchers,
} from '/@/renderer/features/player/components/right-controls';
import { SleepTimerButton } from '/@/renderer/features/player/components/sleep-timer-button';
import { sourApi, type SourProfile, timeAgo } from '/@/renderer/features/sour/api/sour-api';
import { AlongHost } from '/@/renderer/features/sour/components/along-extras';
import { FeedbackButton } from '/@/renderer/features/sour/components/feedback';
import { useJoin } from '/@/renderer/features/sour/components/home-sections';
import {
    FriendChips,
    MiniPlayerButton,
    NextUpHint,
} from '/@/renderer/features/sour/components/look';
import {
    openProfile,
    PeopleButton,
    ProfileAvatar,
    SongCover,
} from '/@/renderer/features/sour/components/people';
import { PlaybackTools } from '/@/renderer/features/sour/components/playback10';
import { nameColor } from '/@/renderer/features/sour/components/profile-bits';
import { ListenAlong } from '/@/renderer/features/sour/components/social';
import { openInbox, useInbox } from '/@/renderer/features/sour/components/social10';
import { openSourStudio } from '/@/renderer/features/sour/components/sour-studio';
import { useBotAccess } from '/@/renderer/features/sour/discord-bot/bot-api';
import {
    SourStageButton,
    toggleStage,
    useStageOpen,
} from '/@/renderer/features/sour/stage/sour-stage';
import {
    useMyProfile,
    useSourProfiles,
    useSourStore,
} from '/@/renderer/features/sour/store/sour.store';
import { startListenAlong } from '/@/renderer/features/sour/utils/switching';
import { useHotkeys } from '/@/renderer/hooks/use-hotkeys';
import { FullScreenOverlay } from '/@/renderer/layouts/default-layout/full-screen-overlay';
import { FullScreenVisualizerOverlay } from '/@/renderer/layouts/default-layout/full-screen-visualizer-overlay';
import { MainContentBody } from '/@/renderer/layouts/default-layout/main-content';
import { WindowBar } from '/@/renderer/layouts/window-bar';
import { AppRoute } from '/@/renderer/router/routes';
import {
    useAppStore,
    useAutoDJSettings,
    useHotkeySettings,
    usePlayerSong,
} from '/@/renderer/store';
import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { Icon } from '/@/shared/components/icon/icon';
import { LibraryItem, type QueueSong } from '/@/shared/types/domain-types';
import { PlayerShuffle } from '/@/shared/types/types';

type IconName = Parameters<typeof Icon>[0]['icon'];

// ---------- the frame ----------

// Every layout: the window bar (frameless windows), its own parts, and the helpers that used to live in
// the player bar (presence, Group Play sync, listen along, floating video...), which must keep running
export const Frame = ({ children, kind }: { children: ReactNode; kind: SourLayout }) => (
    <div className={`x-shell x-${kind}`} id="default-layout">
        <WindowBar />
        {children}
        <SourWatchers />
    </div>
);

// the page: the same routes every look shows, and the full-screen overlays that cover it
export const Page = ({ className }: { className?: string }) => (
    <main className={clsx('x-page', className)} id="main-content">
        <FullScreenVisualizerOverlay />
        <FullScreenOverlay />
        <MainContentBody />
    </main>
);

// ---------- navigation ----------

export interface NavItem {
    go: () => void;
    icon: IconName;
    key: string;
    label: string;
    on: boolean;
}

const hubTab = (path: string, search: string) =>
    path.startsWith(AppRoute.SOUR_HUB) ? new URLSearchParams(search).get('tab') || 'feed' : null;

export const isLibraryPath = (path: string) =>
    path.startsWith('/library') ||
    path.startsWith(AppRoute.FAVORITES) ||
    path.startsWith(AppRoute.RADIO) ||
    path.startsWith(AppRoute.SOUR_LIBRARY) ||
    path.startsWith(AppRoute.PLAYLISTS);

export const openSearch = () => useAppStore.getState().commandPalette.open();

// the main places: Home, the library, the friend group's things, the bot and the Studio
export const useMainNav = (): NavItem[] => {
    const navigate = useNavigate();
    const { pathname, search } = useLocation();
    const bot = useBotAccess();
    const tab = hubTab(pathname, search);
    const items: (false | NavItem)[] = [
        {
            go: () => navigate(AppRoute.HOME),
            icon: 'house',
            key: 'home',
            label: 'Home',
            on: pathname === '/' || pathname === '',
        },
        {
            go: () => navigate(AppRoute.LIBRARY_ALBUMS),
            icon: 'library',
            key: 'library',
            label: 'Library',
            on: isLibraryPath(pathname) && !pathname.startsWith(AppRoute.PLAYLISTS),
        },
        {
            go: () => navigate(AppRoute.PLAYLISTS),
            icon: 'playlist',
            key: 'playlists',
            label: 'Playlists',
            on: pathname.startsWith(AppRoute.PLAYLISTS),
        },
        {
            go: () => navigate(`${AppRoute.SOUR_HUB}?tab=feed`),
            icon: 'group',
            key: 'friends',
            label: 'Friends',
            on: !!tab && tab !== 'shop' && tab !== 'requests',
        },
        {
            go: () => navigate(`${AppRoute.SOUR_HUB}?tab=shop`),
            icon: 'gift',
            key: 'shop',
            label: 'Shop',
            on: tab === 'shop',
        },
        {
            go: () => navigate(`${AppRoute.SOUR_HUB}?tab=requests`),
            icon: 'download',
            key: 'requests',
            label: 'Requests',
            on: tab === 'requests',
        },
        {
            go: () => navigate(AppRoute.PHONE_TV),
            icon: 'tv',
            key: 'tv',
            label: 'TV party',
            on: pathname.startsWith(AppRoute.PHONE_TV),
        },
        bot && {
            go: () => navigate(AppRoute.SOUR_DISCORD_BOT),
            icon: 'bot',
            key: 'bot',
            label: 'Discord bot',
            on: pathname.startsWith(AppRoute.SOUR_DISCORD_BOT),
        },
    ];
    return items.filter(Boolean) as NavItem[];
};

// the library's own pages (a strip under the menu in Magazine and Pop, a list in Hi-Fi)
export const useLibraryNav = (): NavItem[] => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const at = (route: string, label: string, icon: IconName, key: string): NavItem => ({
        go: () => navigate(route),
        icon,
        key,
        label,
        on: pathname === route || pathname.startsWith(`${route}/`),
    });
    return [
        at(AppRoute.LIBRARY_ALBUMS, 'Albums', 'album', 'albums'),
        at(AppRoute.LIBRARY_ALBUM_ARTISTS, 'Artists', 'artist', 'album-artists'),
        at(AppRoute.LIBRARY_ARTISTS, 'All artists', 'artist', 'artists'),
        at(AppRoute.LIBRARY_SONGS, 'Songs', 'itemSong', 'songs'),
        at(AppRoute.LIBRARY_GENRES, 'Genres', 'genre', 'genres'),
        at(AppRoute.LIBRARY_FOLDERS, 'Folders', 'folder', 'folders'),
        at(AppRoute.FAVORITES, 'Favorites', 'favorite', 'favorites'),
        at(AppRoute.PLAYLISTS, 'Playlists', 'playlist', 'playlists'),
        at(AppRoute.RADIO, 'Radio', 'radio', 'radio'),
        at(AppRoute.SOUR_LIBRARY, 'Cover wall', 'grid', 'cover-wall'),
    ];
};

export const NavButton = ({ item, text = true }: { item: NavItem; text?: boolean }) => (
    <button
        aria-current={item.on ? 'page' : undefined}
        className={clsx('x-nav-item', item.on && 'x-on')}
        onClick={item.go}
        title={text ? undefined : item.label}
        type="button"
    >
        <span className="x-nav-icon">
            <Icon icon={item.icon} />
        </span>
        <span className="x-nav-label">{item.label}</span>
    </button>
);

export const LibraryStrip = () => {
    const { pathname } = useLocation();
    const items = useLibraryNav();
    if (!isLibraryPath(pathname)) return null;
    return (
        <nav className="x-subnav">
            {items.map((item) => (
                <NavButton item={item} key={item.key} />
            ))}
        </nav>
    );
};

// ---------- you ----------

export const useMe = () => useMyProfile().data ?? null;

export const MeButton = ({ size = 34 }: { size?: number }) => {
    const me = useMe();
    if (!me) return null;
    return (
        <button
            className="x-me"
            onClick={() => openProfile(me)}
            title={`${me.name} - your profile`}
            type="button"
        >
            <ProfileAvatar profile={me} size={size} />
        </button>
    );
};

export const Points = ({ suffix = ' pts' }: { suffix?: string }) => {
    const me = useMe();
    const navigate = useNavigate();
    if (!me) return null;
    return (
        <button
            className="x-points"
            onClick={() => navigate(`${AppRoute.SOUR_HUB}?tab=shop`)}
            title={`${me.pointsToday ?? 0} of ${me.pointsCap ?? 300} earned today - spend them in the Shop`}
            type="button"
        >
            <Icon icon="citrus" />
            {(me.points ?? 0).toLocaleString()}
            {suffix}
        </button>
    );
};

export const InboxBell = () => {
    const unread = (useInbox().data ?? []).filter((m) => !m.read).length;
    return (
        <button
            className="x-icon-btn x-bell"
            onClick={openInbox}
            title={unread ? `Inbox - ${unread} new` : 'Inbox'}
            type="button"
        >
            <Icon icon="bell" />
            {!!unread && <i className="x-dot" />}
        </button>
    );
};

export const IconButton = ({
    icon,
    label,
    onClick,
}: {
    icon: IconName;
    label: string;
    onClick: () => void;
}) => (
    <button className="x-icon-btn" onClick={onClick} title={label} type="button">
        <Icon icon={icon} />
    </button>
);

export const SettingsButton = () => {
    const navigate = useNavigate();
    return (
        <IconButton icon="settings" label="Settings" onClick={() => navigate(AppRoute.SETTINGS)} />
    );
};

export const StudioButton = () => (
    <IconButton icon="palette" label="Sour Studio" onClick={openSourStudio} />
);

export const SearchButton = ({ wide }: { wide?: boolean }) =>
    wide ? (
        <button className="x-search" onClick={openSearch} type="button">
            <Icon icon="search" />
            <span>Search everything</span>
            <kbd>Ctrl K</kbd>
        </button>
    ) : (
        <IconButton icon="search" label="Search (Ctrl K)" onClick={openSearch} />
    );

export const greeting = (d = new Date()) => {
    const h = d.getHours();
    return h < 5
        ? 'Good night'
        : h < 12
          ? 'Good morning'
          : h < 18
            ? 'Good afternoon'
            : 'Good evening';
};

// ---------- now playing ----------

export const useNow = () => usePlayerSong();

export const NowCover = ({ className }: { className?: string }) => {
    const song = useNow();
    return (
        <button
            className={clsx('x-cover', className)}
            onClick={() => toggleStage(true)}
            title="Open the Sour Stage"
            type="button"
        >
            {song?.imageId ? (
                <ItemImage
                    className="x-cover-img"
                    containerClassName="x-cover-img"
                    enableDebounce={false}
                    enableViewport={false}
                    fetchPriority="high"
                    id={song.imageId}
                    itemType={LibraryItem.SONG}
                    serverId={song._serverId}
                    type="header"
                />
            ) : (
                <span className="x-cover-empty">
                    <Icon icon="itemSong" />
                </span>
            )}
        </button>
    );
};

export const NowTitle = ({ fallback = 'Nothing playing' }: { fallback?: string }) => {
    const song = useNow();
    return (
        <button className="x-now-title" onClick={() => toggleStage(true)} type="button">
            {song?.name ?? fallback}
        </button>
    );
};

export const NowArtist = () => {
    const song = useNow();
    const navigate = useNavigate();
    if (!song) return <span className="x-now-artist">Pick something to play</span>;
    const artist = song.albumArtists?.[0] ?? song.artists?.[0];
    return (
        <button
            className="x-now-artist"
            onClick={() =>
                artist &&
                navigate(
                    generatePath(AppRoute.LIBRARY_ALBUM_ARTISTS_DETAIL, {
                        albumArtistId: artist.id,
                    }),
                )
            }
            type="button"
        >
            {song.artistName}
        </button>
    );
};

export const NowAlbum = ({ year = true }: { year?: boolean }) => {
    const song = useNow();
    const navigate = useNavigate();
    if (!song?.album) return null;
    return (
        <button
            className="x-now-album"
            onClick={() =>
                song.albumId &&
                navigate(generatePath(AppRoute.LIBRARY_ALBUMS_DETAIL, { albumId: song.albumId }))
            }
            type="button"
        >
            {song.album}
            {year && song.releaseYear ? ` / ${song.releaseYear}` : ''}
        </button>
    );
};

// the next few songs, in the order they will play (shuffle included)
export const useUpNext = (count: number) =>
    usePlayerStoreBase(
        useShallow((state) => {
            const items = state.getQueue().items;
            const index = state.player.index;
            const shuffled =
                state.player.shuffle === PlayerShuffle.TRACK && state.queue.shuffled.length > 0;
            const next = shuffled
                ? state.queue.shuffled.slice(index + 1, index + 1 + count).map((i) => items[i])
                : items.slice(index + 1, index + 1 + count);
            return next.filter(Boolean) as QueueSong[];
        }),
    );

export const useQueueLength = () => usePlayerStoreBase((state) => state.getQueue().items.length);

const clock = (ms?: number) => {
    const s = Math.max(0, Math.round((ms ?? 0) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const UpNextList = ({ count, numbered = true }: { count: number; numbered?: boolean }) => {
    const next = useUpNext(count);
    if (!next.length) return <p className="x-empty">Nothing queued after this song.</p>;
    return (
        <ol className="x-upnext">
            {next.map((s, i) => (
                <li key={s._uniqueId}>
                    {numbered && <span className="x-upnext-n">{i + 1}</span>}
                    <span className="x-upnext-t">
                        <b>{s.name}</b> <span>{s.artistName}</span>
                    </span>
                    <span className="x-upnext-d">{clock(s.duration)}</span>
                </li>
            ))}
        </ol>
    );
};

// ---------- the player's extras, as labelled keys ----------

export const QueueTool = () => {
    const [opened, setOpened] = useState(false);
    const { bindings } = useHotkeySettings();
    useHotkeys([
        [
            bindings.toggleQueue.isGlobal ? '' : bindings.toggleQueue.hotkey,
            () => setOpened((o) => !o),
        ],
    ]);
    return (
        <PopoverPlayQueue
            onClose={() => setOpened(false)}
            onToggle={(e) => {
                e.stopPropagation();
                setOpened((o) => !o);
            }}
            opened={opened}
        />
    );
};

export type ToolKey =
    | 'autodj'
    | 'cast'
    | 'feedback'
    | 'group'
    | 'love'
    | 'lyrics'
    | 'mini'
    | 'people'
    | 'queue'
    | 'rating'
    | 'request'
    | 'sleep'
    | 'sound'
    | 'stage'
    | 'tools'
    | 'video';

const TOOLS: Record<ToolKey, { label: string; node: () => ReactNode }> = {
    autodj: { label: 'Auto DJ', node: () => <AutoDJButton /> },
    cast: { label: 'Cast', node: () => <DlnaCastButton /> },
    feedback: { label: 'Feedback', node: () => <FeedbackButton /> },
    group: { label: 'Group', node: () => <GroupPlayButton /> },
    love: { label: 'Love', node: () => <FavoriteButton /> },
    lyrics: { label: 'Lyrics', node: () => <LyricsButton /> },
    mini: { label: 'Mini', node: () => <MiniPlayerButton /> },
    people: { label: 'People', node: () => <PeopleButton /> },
    queue: { label: 'Queue', node: () => <QueueTool /> },
    rating: { label: 'Rating', node: () => <RatingButton /> },
    request: { label: 'Request', node: () => <RequestButton /> },
    sleep: { label: 'Sleep', node: () => <SleepTimerButton /> },
    sound: { label: 'Sound', node: () => <PlayerConfig /> },
    stage: { label: 'Stage', node: () => <SourStageButton /> },
    tools: { label: 'Tools', node: () => <PlaybackTools /> },
    video: { label: 'Video', node: () => <MusicVideoButton /> },
};

export const ALL_TOOLS = Object.keys(TOOLS) as ToolKey[];

// which keys are lit
const useToolOn = () => {
    const stage = useStageOpen();
    const autoDJ = useAutoDJSettings();
    return (key: ToolKey) =>
        key === 'lyrics' || key === 'stage' ? stage : key === 'autodj' ? !!autoDJ?.enabled : false;
};

export const Tool = ({ k, label }: { k: ToolKey; label?: string }) => {
    const on = useToolOn()(k);
    return (
        <div className={clsx('x-tool', `x-tool-${k}`, on && 'x-on')}>
            <span className="x-tool-btn">{TOOLS[k].node()}</span>
            <span className="x-tool-label">{label ?? TOOLS[k].label}</span>
        </div>
    );
};

export const Tools = ({ className, keys }: { className?: string; keys: ToolKey[] }) => (
    <div className={clsx('x-tools', className)}>
        {keys.map((k) => (
            <Tool k={k} key={k} />
        ))}
    </div>
);

// everything a layout doesn't show as its own key, in one place (nothing from the old player bar is lost)
export const MoreTools = ({ shown }: { shown: ToolKey[] }) => {
    const [open, setOpen] = useState(false);
    const rest = ALL_TOOLS.filter((k) => !shown.includes(k));
    return (
        <div className={clsx('x-more', open && 'x-open')}>
            <button
                aria-expanded={open}
                className="x-tool x-more-btn"
                onClick={() => setOpen((o) => !o)}
                type="button"
            >
                <span className="x-tool-btn">
                    <Icon icon="ellipsisHorizontal" />
                </span>
                <span className="x-tool-label">More</span>
            </button>
            {/* stays mounted (hidden) so the buttons' own hotkeys and popovers keep working */}
            <div className="x-more-panel" hidden={!open}>
                <Tools keys={rest} />
            </div>
        </div>
    );
};

// little live notes: listening along, hosting, up next, friends on the same song, update ready
export const StatusBits = ({ className }: { className?: string }) => (
    <div className={clsx('x-status', className)}>
        <ListenAlong />
        <AlongHost />
        <NextUpHint />
        <FriendChips />
        <PlayCounter />
        <HermesUpdateButton />
    </div>
);

// ---------- friends ----------

export const useFriends = () => {
    const me = useSourStore((s) => s.me);
    const close = useSourStore((s) => s.closeFriends ?? []);
    const list = (useSourProfiles().data ?? []).filter((p) => p.id !== me?.id);
    const rank = (p: SourProfile) => (close.includes(p.id) ? 2 : 0) + (p.listening ? 1 : 0);
    return {
        offline: list
            .filter((p) => !p.online)
            .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0)),
        online: list.filter((p) => p.online).sort((a, b) => rank(b) - rank(a)),
    };
};

export const FriendAction = ({ p }: { p: SourProfile }) => {
    const join = useJoin();
    if (p.group)
        return (
            <button
                className="x-act x-act-join"
                onClick={() => p.group && join(p.group.code)}
                type="button"
            >
                Join
            </button>
        );
    if (p.listening)
        return (
            <button className="x-act" onClick={() => startListenAlong(p)} type="button">
                Tune in
            </button>
        );
    return null;
};

export const FriendName = ({ p }: { p: SourProfile }) => (
    <button
        className="x-friend-name"
        onClick={() => openProfile(p)}
        style={{ color: nameColor(p) }}
        type="button"
    >
        {p.name}
    </button>
);

export const friendLine = (p: SourProfile) => {
    if (!p.online) return p.lastSeen ? `Last on ${timeAgo(p.lastSeen)}` : 'Offline';
    if (p.group) return `in ${p.group.name}`;
    if (p.listening) return p.playing ? 'is playing' : 'paused';
    return p.status || 'online';
};

export const FriendRow = ({ cover = true, p }: { cover?: boolean; p: SourProfile }) => (
    <div className={clsx('x-friend', !p.online && 'x-offline')}>
        <button className="x-friend-ava" onClick={() => openProfile(p)} type="button">
            <ProfileAvatar online={p.online} profile={p} size={36} />
        </button>
        <div className="x-friend-text">
            <div>
                <FriendName p={p} /> <span className="x-muted">{friendLine(p)}</span>
            </div>
            {p.online && p.listening && (
                <div className="x-friend-song">
                    {p.listening.title} <span className="x-muted">- {p.listening.artist}</span>
                </div>
            )}
        </div>
        {cover && p.online && p.listening && <SongCover size={34} song={p.listening} />}
        {p.online && <FriendAction p={p} />}
    </div>
);

// ---------- the group's things ----------

export const useSongOfDay = () => {
    const url = useHermesUrl();
    return (
        useQuery({
            enabled: !!url,
            queryFn: () => sourApi.songOfTheDay(url),
            queryKey: ['song-of-the-day', url],
            staleTime: 30 * 60000,
        }).data ?? null
    );
};

export interface RequestRow {
    id: string;
    pos?: number;
    profile?: string;
    query: string;
    status: string;
    title?: string;
}

const STEPS = ['pending', 'searching', 'downloading', 'tagging', 'done'];

export const requestStep = (r: RequestRow) => {
    const at = Math.max(0, STEPS.indexOf(r.status));
    const label =
        r.status === 'failed'
            ? 'Failed'
            : r.status === 'ask'
              ? 'Needs your answer'
              : r.status === 'done'
                ? 'Ready'
                : r.pos && r.status === 'pending'
                  ? `Queued #${r.pos}`
                  : r.status.charAt(0).toUpperCase() + r.status.slice(1);
    return { label, pct: r.status === 'failed' ? 0 : Math.round(((at + 1) / STEPS.length) * 100) };
};

export const useRequests = () => {
    const url = useHermesUrl();
    return (
        useQuery({
            enabled: !!url,
            queryFn: async () => {
                const json = await fetch(`${url}/api/requests`).then((r) => r.json());
                return (Array.isArray(json) ? json : []) as RequestRow[];
            },
            queryKey: ['hermes-requests', url],
            refetchInterval: 15000,
        }).data ?? []
    );
};

// Hermes Music reachable? (the friends list answers every 15 s)
export const useHermesState = () => {
    const url = useHermesUrl();
    const profiles = useSourProfiles();
    if (!url) return 'none';
    if (profiles.isError) return 'offline';
    return profiles.isSuccess ? 'online' : 'checking';
};

export const longDate = (d = new Date()) =>
    d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        weekday: 'long',
        year: 'numeric',
    });

// the lime slice from Sour Player's icon: the rind takes the text colour, the pulp --x-slice
export const SliceMark = ({ size = 30 }: { size?: number }) => (
    <svg aria-hidden className="x-slice" height={size} viewBox="0 0 32 32" width={size}>
        <circle cx="16" cy="16" fill="currentColor" r="14.4" />
        <circle className="x-slice-pulp" cx="16" cy="16" r="11.2" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <rect
                fill="currentColor"
                height="11"
                key={a}
                transform={`rotate(${a} 16 16)`}
                width="1.8"
                x="15.1"
                y="5"
            />
        ))}
        <circle cx="16" cy="16" fill="currentColor" r="2.3" />
    </svg>
);
