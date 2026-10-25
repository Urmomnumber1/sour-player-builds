import isElectron from 'is-electron';
import { useEffect, useState } from 'react';

import styles from './mini-player.module.css';

import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { useMiniStore } from '/@/renderer/features/sour/store/mini.store';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import {
    SourVisualizer,
    useBarVisualizer,
} from '/@/renderer/features/sour/visualizer/sour-visualizer';
import {
    usePlayerMuted,
    usePlayerRepeat,
    usePlayerSong,
    usePlayerStatus,
    usePlayerStoreBase,
    usePlayerVolume,
} from '/@/renderer/store/player.store';
import { usePlayerTimestamp } from '/@/renderer/store/timestamp.store';
import { Icon } from '/@/shared/components/icon/icon';
import { LibraryItem } from '/@/shared/types/domain-types';
import { PlayerRepeat, PlayerStatus } from '/@/shared/types/types';

const useMini = useMiniStore;

export const isMiniPlayer = () => useMini.getState().on;

// The mini player: a small always-on-top window with the cover, the song, the controls, a seek bar
// and a little visualizer. Drag it anywhere by its background; the expand button (or Ctrl+Alt+M)
// brings the full window back.
export const toggleMiniPlayer = () => {
    const on = !useMini.getState().on;
    useMini.setState({ on });
    document.documentElement.classList.toggle('sour-mini', on);
    const widget = !!useSourStore.getState().look.custom10?.widget;
    document.documentElement.classList.toggle('sour-widget', on && widget);
    if (isElectron()) window.api?.ipc?.send('sour-mini', on, { widget });
};

const time = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// desktop widget: a clock over the song
const WidgetClock = () => {
    const widget = useSourStore((s) => !!s.look.custom10?.widget);
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        if (!widget) return undefined;
        const t = setInterval(() => setNow(new Date()), 15000);
        return () => clearInterval(t);
    }, [widget]);
    if (!widget) return null;
    return (
        <div className={styles.clock}>
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            <span>
                {now.toLocaleDateString([], { day: 'numeric', month: 'short', weekday: 'short' })}
            </span>
        </div>
    );
};

const MiniPlayerView = () => {
    const song = usePlayerSong();
    const status = usePlayerStatus();
    const timestamp = usePlayerTimestamp();
    const { mediaNext, mediaPrevious, mediaSeekToTimestamp, mediaTogglePlayPause } = usePlayer();
    const showBars = useSourStore((s) => s.look.barVisualizer && !s.look.simple);
    const bar = useBarVisualizer();
    const cover = useItemImageUrl({
        id: song?.imageId || undefined,
        itemType: LibraryItem.SONG,
        type: 'itemCard',
    });
    const duration = (song?.duration || 0) / 1000;
    const progress = duration ? Math.min(1, timestamp / duration) : 0;
    const playing = status === PlayerStatus.PLAYING;
    const repeat = usePlayerRepeat();
    const volume = usePlayerVolume();
    const muted = usePlayerMuted();
    const [showVolume, setShowVolume] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === ' ' && !(e.target instanceof HTMLInputElement)) {
                e.preventDefault();
                mediaTogglePlayPause();
            }
            if (e.key === 'Escape') toggleMiniPlayer();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [mediaTogglePlayPause]);

    return (
        <div className={styles.mini}>
            {cover && (
                <div className={styles.backdrop} style={{ backgroundImage: `url("${cover}")` }} />
            )}
            <div className={styles.cover}>
                {cover ? <img alt="" src={cover} /> : <Icon icon="itemSong" size="xl" />}
            </div>
            <div className={styles.body}>
                <WidgetClock />
                <div className={styles.top}>
                    <div className={styles.titles}>
                        <div className={styles.title} title={song?.name}>
                            {song?.name ?? 'Nothing playing'}
                        </div>
                        <div className={styles.artist}>{song?.artistName ?? ''}</div>
                    </div>
                    <button
                        aria-label="Back to the full window"
                        className={styles.icon}
                        onClick={toggleMiniPlayer}
                        title="Back to the full window (Esc)"
                        type="button"
                    >
                        <Icon icon="expand" />
                    </button>
                </div>
                <div className={styles.controls}>
                    <button
                        aria-label="Previous"
                        className={styles.icon}
                        onClick={() => mediaPrevious(false)}
                        type="button"
                    >
                        <Icon icon="mediaPrevious" />
                    </button>
                    <button
                        aria-label={playing ? 'Pause' : 'Play'}
                        className={styles.play}
                        onClick={mediaTogglePlayPause}
                        type="button"
                    >
                        <Icon icon={playing ? 'mediaPause' : 'mediaPlay'} />
                    </button>
                    <button
                        aria-label="Next"
                        className={styles.icon}
                        onClick={() => mediaNext(false)}
                        type="button"
                    >
                        <Icon icon="mediaNext" />
                    </button>
                    <span className={styles.time}>
                        {time(timestamp)} / {time(duration)}
                    </span>
                    <button
                        aria-label="Loop"
                        className={repeat === PlayerRepeat.NONE ? styles.icon : styles.iconOn}
                        onClick={() => usePlayerStoreBase.getState().toggleRepeat()}
                        title={
                            repeat === PlayerRepeat.ONE
                                ? 'Looping this song'
                                : repeat === PlayerRepeat.ALL
                                  ? 'Looping the queue'
                                  : 'Loop'
                        }
                        type="button"
                    >
                        <svg
                            aria-hidden
                            fill="none"
                            height="16"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            width="16"
                        >
                            <path d="m17 2 4 4-4 4" />
                            <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                            <path d="m7 22-4-4 4-4" />
                            <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                            {repeat === PlayerRepeat.ONE && <path d="M11 10h1v4" />}
                        </svg>
                    </button>
                    <button
                        aria-label="Volume"
                        className={showVolume ? styles.iconOn : styles.icon}
                        onClick={() => setShowVolume((on) => !on)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            usePlayerStoreBase.getState().mediaToggleMute();
                        }}
                        title="Volume (right-click to mute)"
                        type="button"
                    >
                        <Icon icon={muted || volume === 0 ? 'volumeMute' : 'volumeMax'} />
                    </button>
                    {showVolume && (
                        <input
                            aria-label="Volume"
                            className={styles.volume}
                            max={100}
                            min={0}
                            onChange={(e) =>
                                usePlayerStoreBase
                                    .getState()
                                    .setVolume(Number(e.currentTarget.value))
                            }
                            type="range"
                            value={volume}
                        />
                    )}
                </div>
                <div
                    aria-label="Seek"
                    aria-valuemax={Math.round(duration)}
                    aria-valuemin={0}
                    aria-valuenow={Math.round(timestamp)}
                    className={styles.seek}
                    onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        if (duration)
                            mediaSeekToTimestamp(((e.clientX - r.left) / r.width) * duration);
                    }}
                    role="slider"
                    tabIndex={0}
                >
                    <div style={{ width: `${progress * 100}%` }} />
                </div>
            </div>
            {showBars && (
                <div className={styles.viz}>
                    <SourVisualizer colors={bar.colors} coverUrl={bar.coverUrl} style={bar.style} />
                </div>
            )}
        </div>
    );
};

export const MiniPlayer = () => {
    const on = useMini((s) => s.on);
    return on ? <MiniPlayerView /> : null;
};
