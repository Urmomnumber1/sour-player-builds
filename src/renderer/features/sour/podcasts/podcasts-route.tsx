import { useQueries, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { type CSSProperties, useState } from 'react';
import { useSearchParams } from 'react-router';

import styles from './podcasts.module.css';

import { NativeScrollArea } from '/@/renderer/components/native-scroll-area/native-scroll-area';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import {
    episodeId,
    followShow,
    playEpisodes,
    type PodcastEpisode,
    type PodcastFeed,
    podcastGet,
    type PodcastShow,
    setEpisodeProgress,
    type ShowBits,
    unfollowShow,
    usePodcastFeed,
    usePodcasts,
} from '/@/renderer/features/sour/podcasts/podcasts';
import { usePlayerActions, usePlayerSong, usePlayerStatus } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Icon } from '/@/shared/components/icon/icon';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { useDebouncedValue } from '/@/shared/hooks/use-debounced-value';
import { Play, PlayerStatus } from '/@/shared/types/types';

// The Podcasts page: what you follow, what you were in the middle of, new episodes, and the top shows
// (or what you searched for). Opening a show lists its episodes; they play in the normal player.

// the shows met on the way, so a show's page has its name and cover before its feed arrives
const known = new Map<string, PodcastShow>();

export const minutes = (seconds: number) => {
    if (!seconds) return '';
    const m = Math.round(seconds / 60);
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`;
};

const DAY = 86400000;
export const when = (date: number) => {
    if (!date) return '';
    const days = Math.floor((Date.now() - date) / DAY);
    if (days < 1) return 'Today';
    if (days < 2) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(date).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: days > 300 ? 'numeric' : undefined,
    });
};

const Cover = ({ className, src }: { className?: string; src?: null | string }) =>
    src ? (
        <img
            alt=""
            className={clsx(styles.cover, className)}
            decoding="async"
            loading="lazy"
            src={src}
        />
    ) : (
        <div className={clsx(styles.cover, styles.noCover, className)}>
            <Icon icon="podcast" size="xl" />
        </div>
    );

const useOpenShow = () => {
    const [, setParams] = useSearchParams();
    return (show: PodcastShow) => {
        known.set(show.feed, show);
        setParams({ feed: show.feed });
    };
};

const ShowCard = ({ show }: { show: PodcastShow }) => {
    const open = useOpenShow();
    return (
        <button className={styles.showCard} onClick={() => open(show)} type="button">
            <Cover src={show.image} />
            <span className={styles.showTitle}>{show.title}</span>
            <span className={styles.showAuthor}>{show.author}</span>
        </button>
    );
};

const ShowGrid = ({ shows }: { shows: PodcastShow[] }) => (
    <div className={styles.grid}>
        {shows.map((s) => (
            <ShowCard key={s.feed} show={s} />
        ))}
    </div>
);

const EpisodeRow = ({
    ep,
    show,
    withShow,
}: {
    ep: PodcastEpisode;
    show: ShowBits;
    withShow?: boolean;
}) => {
    const id = episodeId(ep.audio);
    const progress = usePodcasts((s) => s.progress[id]);
    const current = usePlayerSong();
    const status = usePlayerStatus();
    const { mediaTogglePlayPause } = usePlayerActions();
    const isCurrent = current?.id === id;
    const playing = isCurrent && status === PlayerStatus.PLAYING;
    const length = ep.duration || progress?.d || 0;
    const left = progress && !progress.done && length ? Math.max(0, length - progress.t) : 0;
    const share = progress?.done ? 1 : progress && length ? Math.min(1, progress.t / length) : 0;
    return (
        <div
            className={clsx(
                styles.episode,
                isCurrent && styles.current,
                progress?.done && styles.played,
            )}
        >
            <button
                aria-label={playing ? 'Pause' : 'Play'}
                className={styles.play}
                onClick={() => (isCurrent ? mediaTogglePlayPause() : playEpisodes(show, [ep]))}
                type="button"
            >
                <Icon fill="inherit" icon={playing ? 'mediaPause' : 'mediaPlay'} />
            </button>
            {withShow && <Cover className={styles.episodeCover} src={ep.image || show.image} />}
            <div className={styles.episodeText}>
                <span className={styles.episodeTitle}>{ep.title}</span>
                <span className={styles.episodeMeta}>
                    {[
                        withShow ? show.title : '',
                        when(ep.date),
                        progress?.done
                            ? 'Played'
                            : left > 30
                              ? `${minutes(left)} left`
                              : minutes(length),
                    ]
                        .filter(Boolean)
                        .join(' · ')}
                </span>
                {ep.description && !withShow && (
                    <span className={styles.episodeAbout}>{ep.description}</span>
                )}
                {share > 0 && (
                    <span className={styles.bar} style={{ '--share': share } as CSSProperties} />
                )}
            </div>
            <div className={styles.episodeActions}>
                <button
                    className={styles.small}
                    onClick={() => playEpisodes(show, [ep], Play.NEXT)}
                    title="Play next"
                    type="button"
                >
                    <Icon icon="mediaPlayNext" />
                </button>
                <button
                    className={styles.small}
                    onClick={() => playEpisodes(show, [ep], Play.LAST)}
                    title="Add to the queue"
                    type="button"
                >
                    <Icon icon="mediaPlayLast" />
                </button>
                <button
                    className={styles.small}
                    onClick={() =>
                        setEpisodeProgress(id, {
                            d: length,
                            done: !progress?.done,
                            t: progress?.done ? 0 : length,
                        })
                    }
                    title={progress?.done ? 'Mark as not played' : 'Mark as played'}
                    type="button"
                >
                    <Icon icon={progress?.done ? 'undo' : 'check'} />
                </button>
            </div>
        </div>
    );
};

const ShowView = ({ feed }: { feed: string }) => {
    const [, setParams] = useSearchParams();
    const { data, error, isLoading } = usePodcastFeed(feed);
    const following = usePodcasts((s) => s.shows.some((x) => x.feed === feed));
    const [count, setCount] = useState(30);
    const seen = known.get(feed);
    const show: PodcastShow = {
        author: data?.author || seen?.author || '',
        feed,
        genre: seen?.genre,
        id: seen?.id || feed,
        image: seen?.image || data?.image || null,
        title: data?.title || seen?.title || 'Podcast',
    };
    const episodes = data?.episodes ?? [];
    return (
        <div className={styles.show}>
            <button className={styles.back} onClick={() => setParams({})} type="button">
                <Icon icon="arrowLeftS" /> Podcasts
            </button>
            <div className={styles.showHead}>
                <Cover className={styles.bigCover} src={show.image} />
                <div className={styles.showHeadText}>
                    {show.genre && <span className={styles.kicker}>{show.genre}</span>}
                    <h1 className={styles.showName}>{show.title}</h1>
                    <span className={styles.showBy}>{show.author}</span>
                    {data?.description && <p className={styles.about}>{data.description}</p>}
                    <div className={styles.buttons}>
                        <Button
                            disabled={!episodes.length}
                            leftSection={<Icon fill="inherit" icon="mediaPlay" />}
                            onClick={() => playEpisodes(show, [episodes[0]])}
                            variant="filled"
                        >
                            Latest episode
                        </Button>
                        <Button
                            leftSection={<Icon icon={following ? 'check' : 'plus'} />}
                            onClick={() => (following ? unfollowShow(feed) : followShow(show))}
                            variant={following ? 'default' : 'subtle'}
                        >
                            {following ? 'Following' : 'Follow'}
                        </Button>
                    </div>
                </div>
            </div>
            {isLoading && <Text isMuted>Getting the episodes...</Text>}
            {error && <Text isMuted>Couldn&apos;t get this show: {(error as Error).message}</Text>}
            <div className={styles.list}>
                {episodes.slice(0, count).map((ep) => (
                    <EpisodeRow ep={ep} key={ep.audio} show={show} />
                ))}
            </div>
            {episodes.length > count && (
                <Button onClick={() => setCount((n) => n + 30)} variant="subtle">
                    Older episodes ({episodes.length - count})
                </Button>
            )}
        </div>
    );
};

const Section = ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {children}
    </section>
);

const Home = ({ query }: { query: string }) => {
    const shows = usePodcasts((s) => s.shows);
    const recent = usePodcasts((s) => s.recent);
    const progress = usePodcasts((s) => s.progress);
    const search = useQuery({
        enabled: query.length > 1,
        queryFn: () => podcastGet<PodcastShow[]>(`search?q=${encodeURIComponent(query)}`),
        queryKey: ['sour-podcast-search', query],
        staleTime: 10 * 60 * 1000,
    });
    const top = useQuery({
        queryFn: () => podcastGet<PodcastShow[]>('top'),
        queryKey: ['sour-podcast-top'],
        staleTime: 6 * 3600 * 1000,
    });
    // the newest episodes of the shows you follow (the first 12 shows)
    const feeds = useQueries({
        queries: shows.slice(0, 12).map((s) => ({
            queryFn: () => podcastGet<PodcastFeed>(`feed?url=${encodeURIComponent(s.feed)}`),
            queryKey: ['sour-podcast-feed', s.feed],
            staleTime: 15 * 60 * 1000,
        })),
    });
    // (a few dozen episodes at most: cheap enough to work out on every render)
    const fresh: { ep: PodcastEpisode; show: PodcastShow }[] = [];
    feeds.forEach((f, i) => {
        for (const ep of f.data?.episodes.slice(0, 3) ?? []) fresh.push({ ep, show: shows[i] });
    });
    fresh.sort((a, b) => b.ep.date - a.ep.date);
    const newest = fresh.filter((x) => !progress[episodeId(x.ep.audio)]?.done).slice(0, 8);
    const going = recent.filter((r) => {
        const p = progress[episodeId(r.ep.audio)];
        return p && !p.done && p.t > 15;
    });

    if (query.length > 1) {
        return (
            <Section title={`Shows for "${query}"`}>
                {search.isLoading && <Text isMuted>Looking...</Text>}
                {search.error && <Text isMuted>{(search.error as Error).message}</Text>}
                {search.data && !search.data.length && <Text isMuted>No shows by that name.</Text>}
                {search.data && <ShowGrid shows={search.data} />}
            </Section>
        );
    }
    return (
        <>
            {going.length > 0 && (
                <Section title="Continue listening">
                    <div className={styles.list}>
                        {going.slice(0, 4).map((r) => (
                            <EpisodeRow ep={r.ep} key={r.ep.audio} show={r.show} withShow />
                        ))}
                    </div>
                </Section>
            )}
            {newest.length > 0 && (
                <Section title="New from your shows">
                    <div className={styles.list}>
                        {newest.map((r) => (
                            <EpisodeRow ep={r.ep} key={r.ep.audio} show={r.show} withShow />
                        ))}
                    </div>
                </Section>
            )}
            {shows.length > 0 && (
                <Section title="Your shows">
                    <ShowGrid shows={shows} />
                </Section>
            )}
            <Section title="Top shows right now">
                {top.isLoading && <Text isMuted>Getting the charts...</Text>}
                {top.error && <Text isMuted>{(top.error as Error).message}</Text>}
                {top.data && <ShowGrid shows={top.data} />}
            </Section>
        </>
    );
};

const PodcastsRoute = () => {
    const [params] = useSearchParams();
    const feed = params.get('feed');
    const hermes = useHermesUrl();
    const [typed, setTyped] = useState('');
    const [query] = useDebouncedValue(typed.trim(), 450);
    return (
        <NativeScrollArea>
            <div className={styles.page}>
                {!feed && (
                    <header className={styles.header}>
                        <div>
                            <h1 className={styles.title}>Podcasts</h1>
                            <Text isMuted size="sm">
                                Follow shows, pick up where you left off. They play with your EQ and
                                effects, like any song.
                            </Text>
                        </div>
                        <TextInput
                            className={styles.search}
                            leftSection={<Icon icon="search" />}
                            onChange={(e) => setTyped(e.currentTarget.value)}
                            placeholder="Find a show"
                            value={typed}
                        />
                    </header>
                )}
                {!hermes ? (
                    <Text isMuted>
                        Podcasts come through Hermes Music. Set its address first (Settings &gt;
                        General &gt; Music videos).
                    </Text>
                ) : feed ? (
                    <ShowView feed={feed} key={feed} />
                ) : (
                    <Home query={query ?? ''} />
                )}
            </div>
        </NativeScrollArea>
    );
};

export default PodcastsRoute;
