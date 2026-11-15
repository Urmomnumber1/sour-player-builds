import { create } from 'zustand';

import {
    type MusicVideo,
    useMusicVideo,
} from '/@/renderer/features/hermes-video/hooks/use-music-video';
import { useDeck } from '/@/renderer/features/sour/versions/version-deck';
import {
    findVersion,
    inStep,
    ORIGINAL,
    useLoaded,
    useSongVersions,
    versionLabel,
    versionOffset,
} from '/@/renderer/features/sour/versions/versions';
import { type QueueSong } from '/@/shared/types/domain-types';

// Sour Player 0.15: the music video of the song that's playing, with versions. A version can have a video of its
// own (its YouTube upload, or one picked for it); the video shown is the one of the version you hear, else the
// original's, and you can pick another (watch the original video while hearing the Kasane Teto version). It's
// kept in step through the versions' timings.

// queue item -> the video picked by hand ("original" or a version id)
export const useVideoChoice = create<{ pick: Record<string, string> }>(() => ({ pick: {} }));

export const useSongVideo = (song?: null | QueueSong) => {
    const original = useMusicVideo(song?.artistName, song?.name);
    const entry = useSongVersions(song);
    const uid = song?._uniqueId;
    const main = useLoaded((s) => (uid ? s.v[uid] : undefined)) ?? ORIGINAL;
    const deck = useDeck();
    const choice = useVideoChoice((s) => (uid ? s.pick[uid] : undefined));
    const plain = { data: original.data, isFetching: original.isFetching };
    if (!entry) return plain;
    const hear = (deck.uid === uid && deck.hear) || main;
    const own = (id: string) => findVersion(entry, id)?.video ?? null;
    let source = choice ?? (own(hear) ? hear : ORIGINAL);
    if (source !== ORIGINAL && !own(source)) source = ORIGINAL;
    const offMain = inStep(entry, main) ? versionOffset(entry, main) : 0;
    if (source === ORIGINAL) {
        if (!original.data) return plain;
        // the original's video, timed to the version the player plays
        return {
            ...plain,
            data: { ...original.data, offset: (original.data.offset ?? 0) - offMain },
        };
    }
    const v = own(source)!;
    // the version's own video: in step with that version, which sits versionOffset from the original
    const offset = source === main ? v.offset : v.offset + versionOffset(entry, source) - offMain;
    const data: MusicVideo = {
        channel: v.channel,
        live: null,
        offset,
        pending: v.timing === 'pending',
        title: v.title,
        versionId: source,
        videoId: v.videoId,
    };
    return { data, isFetching: false };
};

// the videos to pick from: the original's and the versions' own
export const useVideoSources = (song?: null | QueueSong) => {
    const original = useMusicVideo(song?.artistName, song?.name);
    const entry = useSongVersions(song);
    if (!entry) return [];
    const list: { id: string; label: string }[] = [];
    if (original.data) list.push({ id: ORIGINAL, label: 'Original video' });
    for (const v of entry.versions)
        if (v.video) list.push({ id: v.id, label: `${versionLabel(entry, v.id)} video` });
    return list.length > 1 ? list : [];
};

export const VideoSourceChip = ({
    className,
    song,
}: {
    className?: string;
    song?: null | QueueSong;
}) => {
    const sources = useVideoSources(song);
    const shown = useSongVideo(song).data;
    const uid = song?._uniqueId;
    if (!uid || sources.length < 2) return null;
    const now = shown?.versionId ?? ORIGINAL;
    const at = Math.max(
        0,
        sources.findIndex((s) => s.id === now),
    );
    const next = sources[(at + 1) % sources.length];
    return (
        <button
            className={className}
            onClick={() =>
                useVideoChoice.setState((s) => ({ pick: { ...s.pick, [uid]: next.id } }))
            }
            title={`Watch the ${next.label.toLowerCase()} instead`}
            type="button"
        >
            {sources[at]?.label ?? 'Video'}
        </button>
    );
};
