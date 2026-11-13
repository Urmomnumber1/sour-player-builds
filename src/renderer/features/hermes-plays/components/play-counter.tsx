import { useEffect } from 'react';

import { useGroupPlayStore } from '/@/renderer/features/group-play/store/group-play.store';
import { pushHeard } from '/@/renderer/features/hermes-plays/heard';
import { usePlayCountStore } from '/@/renderer/features/hermes-plays/store/play-count.store';
import { isPodcast } from '/@/renderer/features/sour/podcasts/podcast-id';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { PlayerStatus } from '/@/shared/types/types';

// Counts a play once a song has actually been listened to: half of it, or 30 seconds for longer songs. Past
// halfway (or 4 minutes) it also earns Sour Shop points. The time heard is how far the song really moved, so a
// timer that only ticks now and then (a phone in the background) still counts all of it.
export const PlayCounter = () => {
    useEffect(() => {
        let playing: string | undefined;
        let heard = 0;
        let counted = false;
        let pointed = false;
        let lastPos = 0;
        let lastAt = Date.now();
        const timer = setInterval(() => {
            const now = Date.now();
            const gap = (now - lastAt) / 1000;
            lastAt = now;
            const player = usePlayerStoreBase.getState();
            const song = player.getCurrentSong();
            const pos = useTimestampStoreBase.getState().timestamp;
            if (!song || isPodcast(song)) return; // podcasts don't count as plays
            if (song._uniqueId !== playing) {
                playing = song._uniqueId;
                heard = 0;
                counted = false;
                pointed = false;
                lastPos = pos;
                return;
            }
            const moved = pos - lastPos;
            lastPos = pos;
            if (player.player.status !== PlayerStatus.PLAYING) return;
            // a jump (seeking ahead) only counts as the time that went by
            heard += moved > 0 && moved <= gap * 2.2 + 1 ? moved : Math.min(gap, 1.5);
            const length = (song.duration ?? 0) / 1000;
            if (!counted && heard >= Math.min(30, Math.max(5, length / 2))) {
                counted = true;
                usePlayCountStore.getState().addPlay(song);
            }
            if (!pointed && length > 0 && heard >= Math.min(length / 2, 240)) {
                pointed = true;
                const sour = useSourStore.getState();
                const group = useGroupPlayStore.getState().state;
                if (!sour.privateSession) {
                    pushHeard({
                        at: now,
                        id: song.id,
                        social: !!(group && !group.ended) || !!sour.listenAlong,
                        title: song.name,
                    });
                }
            }
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return null;
};
