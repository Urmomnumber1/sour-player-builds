import { useHermesVideoStore } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { QueueSong } from '/@/shared/types/domain-types';

// The few podcast bits the player itself needs (kept apart from the rest, so the player loads light).

// a short, stable id from the episode's audio address
const hash = (text: string) => {
    let a = 2166136261;
    let b = 5381;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        a = Math.imul(a ^ c, 16777619);
        b = (Math.imul(b, 33) + c) | 0;
    }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36);
};

export const episodeId = (audio: string) => `podcast:${hash(audio)}`;

export const isPodcast = (song?: null | { id?: string }) => !!song?.id?.startsWith('podcast:');

export type PodcastSong = QueueSong & { _podcast?: { audio: string; feed: string } };

export const hermesBase = () => useHermesVideoStore.getState().url.replace(/\/+$/, '');

// where the player gets an episode: through Hermes Music
export const podcastStreamUrl = (song?: null | QueueSong): string | undefined => {
    if (!isPodcast(song)) return undefined;
    const p = (song as PodcastSong)._podcast;
    if (!p) return undefined;
    return `${hermesBase()}/api/podcasts/audio?url=${encodeURIComponent(p.audio)}&feed=${encodeURIComponent(p.feed)}`;
};
