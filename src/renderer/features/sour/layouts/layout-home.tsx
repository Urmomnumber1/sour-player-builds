import type { SourLayout } from '/@/renderer/features/sour/layouts/layout-kind';

import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { type ReactNode } from 'react';

import { ItemImage } from '/@/renderer/components/item-image/item-image';
import { type GroupSong } from '/@/renderer/features/group-play/store/group-play.store';
import { getSongById } from '/@/renderer/features/player/utils';
import { MOODS, usePlayRandom } from '/@/renderer/features/sour/components/home-plus';
import { ProfileAvatar } from '/@/renderer/features/sour/components/people';
import { usePlaySong } from '/@/renderer/features/sour/components/profile-bits';
import { SourSafe } from '/@/renderer/features/sour/components/sour-safe';
import {
    FriendAction,
    FriendRow,
    greeting,
    InboxBell,
    longDate,
    Points,
    requestStep,
    SearchButton,
    SliceMark,
    useFriends,
    useMe,
    useRequests,
    useSongOfDay,
} from '/@/renderer/features/sour/layouts/layout-bits';
import { PhoneHomeTop } from '/@/renderer/features/sour/mobile/phone-tabs';
import { useCurrentServer } from '/@/renderer/store';
import { addToQueueByData } from '/@/renderer/store/player.store';
import { Icon } from '/@/shared/components/icon/icon';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

// The top of Home in the 0.12 layouts: the song of the day, who's listening and the moods, each
// layout in its own way. The rest of Home (quick mixes, carousels, the group's sections) follows as usual.
const LayoutHomeTop = ({ kind, phone }: { kind: SourLayout; phone?: boolean }) => (
    <SourSafe name={`${kind} home`}>
        {kind === 'mag' && <MagTop phone={phone} />}
        {kind === 'hifi' && <HifiTop phone={phone} />}
        {kind === 'pop' && <PopTop phone={phone} />}
    </SourSafe>
);

export default LayoutHomeTop;

// ---------- shared ----------

const useQueueNext = () => {
    const queryClient = useQueryClient();
    const serverId = useCurrentServer()?.id;
    return (song: GroupSong) => {
        if (!serverId) return Promise.resolve();
        return getSongById({ id: song.id, queryClient, serverId })
            .then((res) => addToQueueByData(Play.NEXT, res.items))
            .then(() => toast.success({ message: `${song.title} plays next` }))
            .catch(() => toast.error({ message: `${song.title} isn't on your music server` }));
    };
};

const BigCover = ({ className, song }: { className?: string; song: GroupSong | null }) => {
    const serverId = useCurrentServer()?.id;
    return (
        <div className={clsx('x-big-cover', className)}>
            {song?.imageId && serverId ? (
                <ItemImage
                    className="x-cover-img"
                    containerClassName="x-cover-img"
                    enableViewport={false}
                    id={song.imageId}
                    itemType={LibraryItem.SONG}
                    serverId={serverId}
                    type="header"
                />
            ) : (
                <span className="x-cover-empty">
                    <Icon icon="itemSong" />
                </span>
            )}
        </div>
    );
};

const SongButtons = ({ song }: { song: GroupSong | null }) => {
    const play = usePlaySong();
    const next = useQueueNext();
    if (!song) return null;
    return (
        <div className="x-btns">
            <button className="x-btn x-btn-fill" onClick={() => play(song)} type="button">
                <Icon icon="mediaPlay" /> Play
            </button>
            <button className="x-btn" onClick={() => next(song)} type="button">
                <Icon icon="mediaPlayNext" /> Queue
            </button>
        </div>
    );
};

const useMoods = () => {
    const playRandom = usePlayRandom();
    return MOODS.map((m) => ({
        label: m.label,
        play: () =>
            playRandom(
                { genre: m.genres[Math.floor(Math.random() * m.genres.length)] },
                `Mood: ${m.label}`,
            ),
    }));
};

const plays = (n: number) => `${n} time${n === 1 ? '' : 's'}`;

const MyRequest = () => {
    const me = useMe();
    const mine = useRequests().filter(
        (r) => r.profile === me?.id && r.status !== 'done' && r.status !== 'failed',
    );
    const r = mine[0];
    if (!r) return null;
    const step = requestStep(r);
    return (
        <div className="x-myreq">
            <div className="x-myreq-top">
                <span className="x-label">Your request</span>
                <b>{r.title || r.query}</b>
                <span>{step.label}</span>
            </div>
            <div className="x-bar">
                <i style={{ width: `${step.pct}%` }} />
            </div>
        </div>
    );
};

const SecHead = ({ right, title }: { right?: ReactNode; title: string }) => (
    <div className="x-sec-h">
        <h3>{title}</h3>
        {right && <span>{right}</span>}
    </div>
);

// ---------- Magazine ----------

const MagTop = ({ phone }: { phone?: boolean }) => {
    const sotd = useSongOfDay();
    const me = useMe();
    const { online } = useFriends();
    const moods = useMoods();
    const lead = (
        <section className="x-lead">
            <div className="x-lead-cover">
                <BigCover song={sotd} />
                {sotd?.album && <div className="x-caption">{sotd.album}</div>}
            </div>
            <div className="x-lead-text">
                <div className="x-eyebrow">
                    <i /> {sotd ? 'Song of the day' : longDate()}
                </div>
                <h1 className="x-headline">
                    {sotd ? sotd.title : `${greeting()}${me ? `, ${me.name}` : ''}`}
                </h1>
                <p className="x-deck">
                    {sotd
                        ? `${sotd.artist}. The group played it ${plays(sotd.plays)} this week.`
                        : 'Play something, send a friend a song, or start a Group Play.'}
                </p>
                <SongButtons song={sotd} />
            </div>
            {!phone && (
                <aside className="x-lead-side">
                    <SecHead right={`${online.length} on now`} title="Friends are playing" />
                    {online.slice(0, 4).map((p) => (
                        <FriendRow cover={false} key={p.id} p={p} />
                    ))}
                    {!online.length && <p className="x-empty">Nobody else is on right now.</p>}
                    <MyRequest />
                </aside>
            )}
        </section>
    );
    const moodLine = (
        <section className="x-moodline">
            <SecHead right="Quick mixes below" title="Pick a mood" />
            <div className="x-moods">
                {moods.map((m, i) => (
                    <span key={m.label}>
                        {i > 0 && <em>/</em>}
                        <button onClick={m.play} type="button">
                            {m.label}
                        </button>
                    </span>
                ))}
            </div>
        </section>
    );
    if (!phone)
        return (
            <div className="x-home x-home-mag">
                {lead}
                {moodLine}
            </div>
        );
    return (
        <div className="x-home x-home-mag x-phone-home">
            <header className="x-p-mast">
                <span className="x-logo">
                    <SliceMark size={26} />
                    <span>Sour Player</span>
                </span>
                <SearchButton />
                <InboxBell />
            </header>
            <div className="x-p-date">
                <span>
                    {new Date().toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        weekday: 'short',
                    })}
                </span>
                <span>{online.filter((p) => p.listening).length} friends listening</span>
            </div>
            <PhoneHomeTop />
            {lead}
            <section>
                <SecHead right={`${online.length} on now`} title="Friends are playing" />
                {online.slice(0, 3).map((p) => (
                    <FriendRow cover={false} key={p.id} p={p} />
                ))}
                {!online.length && <p className="x-empty">Nobody else is on right now.</p>}
            </section>
            {moodLine}
        </div>
    );
};

// ---------- Hi-Fi ----------

const Mod = ({
    children,
    className,
    idx,
    right,
    title,
}: {
    children: ReactNode;
    className?: string;
    idx: string;
    right?: string;
    title: string;
}) => (
    <section className={clsx('x-mod', className)}>
        <div className="x-mod-h">
            <span className="x-mod-idx">{idx}</span>
            <span className="x-mod-title">{title}</span>
            {right && <span className="x-mod-right">{right}</span>}
        </div>
        <div className="x-mod-b">{children}</div>
    </section>
);

const HifiTop = ({ phone }: { phone?: boolean }) => {
    const sotd = useSongOfDay();
    const me = useMe();
    const { offline, online } = useFriends();
    const moods = useMoods();
    const channels = (
        <Mod
            className="x-mod-friends"
            idx="01"
            right={`${online.length} live / ${offline.length} offline`}
            title="Friends on air"
        >
            <div className="x-chs">
                {online.slice(0, phone ? 3 : 4).map((p, i) => (
                    <div className="x-ch" key={p.id}>
                        <div className="x-ch-h">
                            <i className={p.group ? 'x-led x-amber' : 'x-led x-on'} />
                            <b>{p.name}</b>
                            <span>{p.group ? 'Group' : `CH ${i + 1}`}</span>
                        </div>
                        <div className="x-ch-b">
                            <ProfileAvatar online profile={p} size={40} />
                            <div className="x-ch-text">
                                <b>{p.listening?.title ?? 'Online'}</b>
                                <span>{p.listening?.artist ?? (p.status || '')}</span>
                            </div>
                        </div>
                        <FriendAction p={p} />
                    </div>
                ))}
                {!online.length && <p className="x-empty">Nobody else is on the air.</p>}
            </div>
        </Mod>
    );
    const song = (
        <Mod
            className="x-mod-sotd"
            idx="02"
            right={sotd ? `${plays(sotd.plays)} in the group` : undefined}
            title="Song of the day"
        >
            <div className="x-sotd">
                <BigCover song={sotd} />
                <div className="x-sotd-text">
                    <span className="x-label">{sotd ? sotd.artist : longDate()}</span>
                    <h2>{sotd ? sotd.title : `${greeting()}${me ? `, ${me.name}` : ''}`}</h2>
                    {sotd?.album && <span className="x-muted">From {sotd.album}</span>}
                    <SongButtons song={sotd} />
                </div>
            </div>
        </Mod>
    );
    const presets = (
        <Mod className="x-mod-presets" idx="03" right="Moods" title="Presets">
            <div className="x-presets">
                {moods.map((m, i) => (
                    <button className="x-preset" key={m.label} onClick={m.play} type="button">
                        <span>P{i + 1}</span>
                        {m.label}
                    </button>
                ))}
            </div>
        </Mod>
    );
    return (
        <div className={clsx('x-home x-home-hifi', phone && 'x-phone-home')}>
            <div className="x-home-h">
                <h1>Home</h1>
                <span>
                    {greeting()}
                    {me ? `, ${me.name}` : ''}
                </span>
                {phone ? <InboxBell /> : <span className="x-home-date">{longDate()}</span>}
            </div>
            {phone && <PhoneHomeTop />}
            {channels}
            {phone ? (
                <>
                    {presets}
                    {song}
                </>
            ) : (
                <div className="x-duo">
                    {song}
                    {presets}
                </div>
            )}
        </div>
    );
};

// ---------- Pop ----------

const CANDY = ['x-sky', 'x-pink', 'x-lilac', 'x-mint', 'x-yellow', 'x-orange'];

const PopTop = ({ phone }: { phone?: boolean }) => {
    const sotd = useSongOfDay();
    const me = useMe();
    const { online } = useFriends();
    const moods = useMoods();
    const hero = (
        <section className="x-hero">
            <BigCover song={sotd} />
            <div className="x-hero-text">
                <span className="x-tag x-pink">{sotd ? 'Song of the day' : 'Hey there'}</span>
                <h2>{sotd ? sotd.title : `${greeting()}${me ? `, ${me.name}` : ''}`}</h2>
                <p>
                    {sotd
                        ? `${sotd.artist}. The group played it ${plays(sotd.plays)} this week.`
                        : 'Play something, send a friend a song, or start a Group Play.'}
                </p>
                <SongButtons song={sotd} />
            </div>
        </section>
    );
    const moodTiles = (
        <section className="x-moods-wrap">
            <div className="x-lab">
                <span className="x-tag x-yellow">Pick a mood</span>
                <small>Quick mixes below</small>
            </div>
            <div className="x-moods">
                {moods.map((m, i) => (
                    <button
                        className={clsx('x-mood', CANDY[i % CANDY.length])}
                        key={m.label}
                        onClick={m.play}
                        type="button"
                    >
                        {m.label}
                    </button>
                ))}
            </div>
        </section>
    );
    if (!phone)
        return (
            <div className="x-home x-home-pop">
                {hero}
                {moodTiles}
            </div>
        );
    return (
        <div className="x-home x-home-pop x-phone-home">
            <header className="x-p-h">
                <h1>Hey{me ? `, ${me.name}` : ''}</h1>
                <Points suffix="" />
                <InboxBell />
            </header>
            <PhoneHomeTop />
            {hero}
            <section>
                <div className="x-lab">
                    <span className="x-tag x-lime">Friends on now</span>
                </div>
                <div className="x-faces">
                    {online.slice(0, 4).map((p) => (
                        <div className="x-face" key={p.id}>
                            <ProfileAvatar online profile={p} size={52} />
                            <b>{p.name}</b>
                            <span>{p.listening?.title ?? 'online'}</span>
                        </div>
                    ))}
                    {!online.length && <p className="x-empty">Nobody else is on right now.</p>}
                </div>
            </section>
            {moodTiles}
        </div>
    );
};
