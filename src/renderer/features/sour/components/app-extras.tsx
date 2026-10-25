import { openModal } from '@mantine/modals';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import styles from './app-extras.module.css';

import { openRequestWindow } from '/@/renderer/features/hermes-request/components/request-button';
import { openPeople } from '/@/renderer/features/sour/components/people';
import { moreMixes } from '/@/renderer/features/sour/components/playback10';
import { SongCover, usePlaySong } from '/@/renderer/features/sour/components/profile-bits';
import {
    copyNowPlaying,
    quickMixes,
    removeQueueDuplicates,
    toggleClassicLook,
} from '/@/renderer/features/sour/components/quick-mixes';
import { openSourStudio } from '/@/renderer/features/sour/components/sour-studio';
import { toggleFocus } from '/@/renderer/features/sour/components/ui10';
import { toggleStage } from '/@/renderer/features/sour/stage/sour-stage';
import { useTranslateLyrics } from '/@/renderer/features/sour/stage/translate';
import { type HistoryEntry, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { AppRoute } from '/@/renderer/router/routes';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

// ---------- queue history: everything played on this computer, newest first ----------
const dayLabel = (at: number) => {
    const d = new Date(at);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', weekday: 'long' });
};

const History = () => {
    const history = useSourStore((s) => s.history);
    const play = usePlaySong();
    const groups: Array<[string, HistoryEntry[]]> = [];
    for (const h of history) {
        const label = dayLabel(h.at);
        const last = groups[groups.length - 1];
        if (last && last[0] === label) last[1].push(h);
        else groups.push([label, [h]]);
    }
    if (!history.length) return <Text isMuted>Nothing played yet on this computer.</Text>;
    return (
        <div className={styles.history}>
            {groups.map(([label, list]) => (
                <div key={label}>
                    <Text className={styles.day}>{label}</Text>
                    {list.map((h, i) => (
                        <button
                            className={styles.historyRow}
                            key={`${h.at}-${i}`}
                            onClick={() => play(h.song)}
                            type="button"
                        >
                            <SongCover size={34} song={h.song} />
                            <span className={styles.grow}>
                                <Text size="sm" truncate>
                                    {h.song.title}
                                </Text>
                                <Text isMuted size="xs" truncate>
                                    {h.song.artist}
                                </Text>
                            </span>
                            <span className={styles.time}>
                                {new Date(h.at).toLocaleTimeString(undefined, {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                })}
                            </span>
                        </button>
                    ))}
                </div>
            ))}
        </div>
    );
};

export const openQueueHistory = () =>
    openModal({ children: <History />, size: 'lg', title: 'Played on this computer' });

// ---------- Sour commands for the command palette (Ctrl+K) ----------
export const sourCommands = (navigate: (to: string) => void) => [
    { label: 'Sour Stage (full screen now playing)', run: () => toggleStage(true) },
    { label: 'Sour Studio (skins, holidays, visualizers)', run: openSourStudio },
    { label: 'Sour Hub (feed, duels, gifts)', run: () => navigate(AppRoute.SOUR_HUB) },
    { label: 'Sour Library (cover wall, tools)', run: () => navigate(AppRoute.SOUR_LIBRARY) },
    { label: 'People and profiles', run: openPeople },
    { label: 'Queue history', run: openQueueHistory },
    { label: 'Mix: never heard', run: quickMixes.neverHeard },
    { label: 'Mix: old favorites', run: quickMixes.oldFavorites },
    { label: "Mix: the playing song's decade", run: quickMixes.decade },
    { label: "Mix: the playing song's genre", run: quickMixes.genre },
    { label: 'Remove duplicates from the queue', run: removeQueueDuplicates },
    { label: 'Copy what is playing', run: copyNowPlaying },
    { label: 'Switch between the new and Classic look', run: toggleClassicLook },
    { label: 'Focus mode (Ctrl+Shift+F)', run: () => toggleFocus(true) },
    {
        label: 'Private session on / off',
        run: () => {
            const on = !useSourStore.getState().privateSession;
            useSourStore.getState().set({ privateSession: on });
            toast.info({
                message: on
                    ? 'Private session: nothing is counted or shown'
                    : 'Private session off',
            });
        },
    },
    { label: 'Mix: forgotten favourites', run: moreMixes.forgotten },
    { label: 'Mix: deep cuts', run: moreMixes.deepCuts },
    { label: "Mix: I'm bored (something different)", run: moreMixes.bored },
    { label: 'Mix: decade hop', run: moreMixes.decades },
    { label: 'Mix: genre journey', run: moreMixes.journey },
    { label: 'Mix: same year as this song', run: moreMixes.sameYear },
    { label: 'Mix: random dive', run: moreMixes.dive },
    { label: 'Shuffle the queue, favourites first', run: moreMixes.weighted },
    { label: 'Smooth the queue (no artist twice in a row)', run: quickMixes.smooth },
    {
        label: 'Translate the lyrics',
        run: () => {
            toggleStage(true);
            useTranslateLyrics.getState().toggle();
        },
    },
    { label: 'Request music', run: openRequestWindow },
    {
        label: 'Sour Library tools (storage, wishlist, lyrics doctor)',
        run: () => navigate(AppRoute.SOUR_LIBRARY),
    },
];

// ---------- startup splash ----------
export const Splash = () => {
    const splash = useSourStore((s) => s.look.splash && !s.look.reducedMotion && !s.look.simple);
    const [show, setShow] = useState(splash);
    useEffect(() => {
        if (!show) return undefined;
        const timer = setTimeout(() => setShow(false), 1500);
        return () => clearTimeout(timer);
    }, [show]);
    if (!show) return null;
    return (
        <div aria-hidden className={styles.splash}>
            <span className={styles.splashLemon}>{'\u{1F34B}'}</span>
            <span className={styles.splashName}>Sour Player</span>
        </div>
    );
};

// ---------- the history and command shortcuts ----------
export const ExtraShortcuts = () => {
    const navigate = useNavigate();
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!e.ctrlKey || !e.altKey) return;
            const key = e.key.toLowerCase();
            if (key === 'h') openQueueHistory();
            else if (key === 'u') navigate(AppRoute.SOUR_HUB);
            else return;
            e.preventDefault();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [navigate]);
    return null;
};
