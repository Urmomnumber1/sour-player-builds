import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createWithEqualityFn } from 'zustand/traditional';

import { episodeId, hermesBase, isPodcast } from '/@/renderer/features/sour/podcasts/podcast-id';
import { addToQueueByData, useAuthStore, usePlayerStoreBase } from '/@/renderer/store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { LibraryItem, ServerType, Song } from '/@/shared/types/domain-types';
import { Play, PlayerStatus } from '/@/shared/types/types';

// Podcasts (0.13). Hermes Music finds the shows (Apple's free podcast directory), reads their feeds and
// relays the episodes (so the EQ, reverb and visualizer work on them too). What you follow and how far
// you got in each episode stay on this device. An episode plays like a song: it goes in the queue with
// the id "podcast:...", the show's cover, and picks up where you left off.

// how far you got: t = seconds in, d = length, at = when
export interface EpisodeProgress {
    at: number;
    d: number;
    done?: boolean;
    t: number;
}

export interface PodcastEpisode {
    audio: string;
    date: number;
    description: string;
    duration: number;
    guid: string;
    image: null | string;
    title: string;
}

export interface PodcastFeed {
    author: string;
    description: string;
    episodes: PodcastEpisode[];
    image: null | string;
    title: string;
    url: string;
}

export interface PodcastShow {
    author: string;
    feed: string;
    genre?: string;
    id: string;
    image: null | string;
    title: string;
}

export type ShowBits = Pick<PodcastShow, 'author' | 'feed' | 'image' | 'title'>;

interface PodcastState {
    progress: Record<string, EpisodeProgress>;
    // the episodes you played lately (for Continue listening)
    recent: { ep: PodcastEpisode; show: ShowBits }[];
    shows: PodcastShow[];
}

export const usePodcasts = createWithEqualityFn<PodcastState>()(
    persist((): PodcastState => ({ progress: {}, recent: [], shows: [] }), {
        name: 'sour-podcasts',
        storage: createJSONStorage(() => localStorage),
    }),
);

export const followShow = (show: PodcastShow) =>
    usePodcasts.setState((s) => ({
        shows: [show, ...s.shows.filter((x) => x.feed !== show.feed)],
    }));

export const unfollowShow = (feed: string) =>
    usePodcasts.setState((s) => ({ shows: s.shows.filter((x) => x.feed !== feed) }));

export const setEpisodeProgress = (id: string, p: Omit<EpisodeProgress, 'at'>) =>
    usePodcasts.setState((s) => {
        const progress = { ...s.progress, [id]: { ...p, at: Date.now() } };
        // the 400 most recent are plenty
        const ids = Object.keys(progress);
        if (ids.length > 400) {
            ids.sort((a, b) => progress[a].at - progress[b].at)
                .slice(0, ids.length - 400)
                .forEach((k) => delete progress[k]);
        }
        return { progress };
    });

export {
    episodeId,
    hermesBase,
    isPodcast,
    podcastStreamUrl,
} from '/@/renderer/features/sour/podcasts/podcast-id';

export const podcastGet = async <T>(path: string): Promise<T> => {
    const base = hermesBase();
    if (!base)
        throw new Error('Podcasts come through Hermes Music: add its address in Settings first.');
    const r = await fetch(`${base}/api/podcasts/${path}`);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body?.error || `Hermes Music answered ${r.status}`);
    return body as T;
};

export const usePodcastFeed = (feed?: null | string) =>
    useQuery({
        enabled: !!feed,
        queryFn: () => podcastGet<PodcastFeed>(`feed?url=${encodeURIComponent(feed!)}`),
        queryKey: ['sour-podcast-feed', feed],
        staleTime: 15 * 60 * 1000,
    });

// an episode as a song for the queue
export const episodeSong = (show: ShowBits, ep: PodcastEpisode): Song => {
    const server = useAuthStore.getState().currentServer;
    const id = episodeId(ep.audio);
    const saved = usePodcasts.getState().progress[id];
    const cover = ep.image || show.image || null;
    const artist = show.author || show.title;
    const date = ep.date ? new Date(ep.date).toISOString() : '';
    const song: Song & { _podcast: { audio: string; feed: string } } = {
        _itemType: LibraryItem.SONG,
        _podcast: { audio: ep.audio, feed: show.feed },
        _serverId: server?.id ?? '',
        _serverType: server?.type ?? ServerType.NAVIDROME,
        album: show.title,
        albumArtistName: artist,
        albumArtists: [],
        albumId: '',
        artistName: artist,
        artists: [],
        bitDepth: null,
        bitRate: 0,
        blurHash: null,
        bpm: null,
        channels: null,
        codec: null,
        comment: ep.description || null,
        compilation: null,
        container: null,
        createdAt: date,
        date: null,
        discNumber: 1,
        discSubtitle: null,
        duration: (ep.duration || saved?.d || 0) * 1000,
        explicitStatus: null,
        folderId: null,
        gain: null,
        genres: [],
        id,
        // a picture from the internet: the image code shows an address given as the id as it is
        imageId: cover,
        imageUrl: cover,
        lastPlayedAt: null,
        libraryId: null,
        libraryName: null,
        lyrics: null,
        mbzAlbumId: null,
        mbzAlbumType: null,
        mbzRecordingId: null,
        mbzReleaseGroupId: null,
        mbzTrackId: null,
        missing: null,
        name: ep.title,
        originalDate: null,
        originalYear: null,
        participants: null,
        path: ep.audio,
        peak: null,
        playCount: 0,
        releaseDate: null,
        releaseYear: ep.date ? new Date(ep.date).getFullYear() : null,
        // pick up where you left off (unless you finished it)
        resumePositionMs: saved && !saved.done && saved.t > 15 ? (saved.t - 3) * 1000 : 0,
        sampleRate: null,
        size: 0,
        sortName: ep.title,
        tags: null,
        thumbHash: null,
        trackNumber: 1,
        trackSubtitle: null,
        updatedAt: date,
        userFavorite: false,
        userRating: null,
        year: ep.date ? new Date(ep.date).getFullYear() : null,
    };
    return song;
};

export const playEpisodes = (show: ShowBits, eps: PodcastEpisode[], how: Play = Play.NOW) => {
    if (how === Play.NOW && eps[0]) {
        const first = eps[0];
        usePodcasts.setState((s) => ({
            recent: [
                {
                    ep: first,
                    show: {
                        author: show.author,
                        feed: show.feed,
                        image: show.image,
                        title: show.title,
                    },
                },
                ...s.recent.filter((r) => r.ep.audio !== first.audio),
            ].slice(0, 16),
        }));
    }
    return addToQueueByData(
        how,
        eps.map((ep) => episodeSong(show, ep)),
    );
};

// remembers how far you got in the episode that's playing (every 5 seconds, and when it changes)
export const PodcastProgress = () => {
    useEffect(() => {
        let last: null | { d: number; id: string; t: number } = null;
        const save = () => {
            if (!last) return;
            const done = last.d > 0 && last.t >= last.d - 30;
            setEpisodeProgress(last.id, { d: last.d, done, t: Math.floor(last.t) });
        };
        const timer = window.setInterval(() => {
            const player = usePlayerStoreBase.getState();
            const song = player.getCurrentSong();
            if (!isPodcast(song)) {
                if (last) save();
                last = null;
                return;
            }
            if (last && last.id !== song!.id) save();
            const t = useTimestampStoreBase.getState().timestamp;
            const d = (song!.duration || 0) / 1000;
            const moved = !last || last.id !== song!.id || Math.abs(t - last.t) >= 4;
            last = { d, id: song!.id, t };
            if (moved && player.player.status === PlayerStatus.PLAYING && t > 1) save();
        }, 5000);
        return () => {
            window.clearInterval(timer);
            save();
        };
    }, []);
    return null;
};
