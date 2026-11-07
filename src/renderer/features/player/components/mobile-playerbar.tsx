import clsx from 'clsx';
import { MouseEvent, TouchEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './mobile-playerbar.module.css';

import { ItemImage } from '/@/renderer/components/item-image/item-image';
import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { RadioMetadataDisplay } from '/@/renderer/features/player/components/radio-metadata-display';
import { SourWatchers } from '/@/renderer/features/player/components/right-controls';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import {
    useIsRadioActive,
    useRadioPlayer,
} from '/@/renderer/features/radio/hooks/use-radio-player';
import { ListenAlong } from '/@/renderer/features/sour/components/social';
import { toggleStage } from '/@/renderer/features/sour/stage/sour-stage';
import { usePlayerSong, usePlayerStatus } from '/@/renderer/store';
import { usePlayerTimestamp } from '/@/renderer/store/timestamp.store';
import { Icon } from '/@/shared/components/icon/icon';
import { PlaybackSelectors } from '/@/shared/constants/playback-selectors';
import { LibraryItem } from '/@/shared/types/domain-types';
import { PlayerStatus } from '/@/shared/types/types';

// the progress line along the bottom of the mini player (its own component: it updates often)
const Progress = ({ duration }: { duration: number }) => {
    const seconds = usePlayerTimestamp();
    const p = duration > 0 ? Math.min(1, Math.max(0, (seconds * 1000) / duration)) : 0;
    return (
        <div className={styles.progress}>
            <div style={{ transform: `scaleX(${p})` }} />
        </div>
    );
};

// Phones: the mini player above the tab bar. Tap it (or swipe up) for Now Playing, swipe left or
// right for the next or previous song, long-press for the song's menu. Hidden while nothing plays.
export const MobilePlayerbar = () => {
    const { t } = useTranslation();
    const currentSong = usePlayerSong();
    const { currentStationArt } = useRadioPlayer();
    const status = usePlayerStatus();
    const { mediaNext, mediaPrevious, mediaTogglePlayPause } = usePlayer();
    const isRadioActive = useIsRadioActive();
    const isSongDefined = Boolean(currentSong?.id);
    const touch = useRef<null | { t: number; x: number; y: number }>(null);
    const swiped = useRef(false);

    const openNowPlaying = () => {
        if (swiped.current) return;
        toggleStage(true);
    };

    const handleToggleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentSong) return;
        ContextMenuController.call({
            cmd: { items: [currentSong], type: LibraryItem.SONG },
            event: e,
        });
    };

    const onTouchStart = (e: TouchEvent) => {
        const p = e.touches[0];
        touch.current = { t: Date.now(), x: p.clientX, y: p.clientY };
        swiped.current = false;
    };
    const onTouchEnd = (e: TouchEvent) => {
        const start = touch.current;
        touch.current = null;
        const p = e.changedTouches[0];
        if (!start || !p || Date.now() - start.t > 700) return;
        const dx = p.clientX - start.x;
        const dy = p.clientY - start.y;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5 && !isRadioActive) {
            swiped.current = true;
            navigator.vibrate?.(8);
            if (dx < 0) mediaNext(false);
            else mediaPrevious(false);
        } else if (dy < -40 && Math.abs(dy) > Math.abs(dx)) {
            swiped.current = true;
            toggleStage(true);
        }
    };

    const artists = currentSong?.artists?.map((a) => a.name).join(', ') || currentSong?.artistName;
    const showing = isSongDefined || isRadioActive;

    return (
        <div
            className={clsx(styles.container, PlaybackSelectors.mediaPlayer, {
                [styles.empty]: !showing,
            })}
        >
            {/* the Sour things that run in the background (presence, Group Play, listen along...) */}
            <SourWatchers />
            <div className={styles.listenAlong}>
                <ListenAlong />
            </div>
            {showing && (
                <div
                    aria-label={t('player.toggleFullscreenPlayer')}
                    className={styles.card}
                    onClick={openNowPlaying}
                    onContextMenu={handleToggleContextMenu}
                    onTouchEnd={onTouchEnd}
                    onTouchStart={onTouchStart}
                    role="button"
                >
                    <div className={styles.cover}>
                        <ItemImage
                            blurHash={isRadioActive ? null : currentSong?.blurHash}
                            className={clsx(styles.coverImage, PlaybackSelectors.playerCoverArt)}
                            enableDebounce={false}
                            enableViewport={false}
                            fetchPriority="high"
                            id={isRadioActive ? currentStationArt?.imageId : currentSong?.imageId}
                            itemType={LibraryItem.SONG}
                            thumbHash={isRadioActive ? null : currentSong?.thumbHash}
                            type="table"
                        />
                    </div>
                    <div className={styles.meta}>
                        {isRadioActive ? (
                            <RadioMetadataDisplay
                                onStopPropagation={() => undefined}
                                onToggleContextMenu={handleToggleContextMenu}
                            />
                        ) : (
                            <>
                                <div className={clsx(styles.title, PlaybackSelectors.songTitle)}>
                                    {currentSong?.name || '-'}
                                </div>
                                <div className={clsx(styles.artist, PlaybackSelectors.songArtist)}>
                                    {artists || '-'}
                                </div>
                            </>
                        )}
                    </div>
                    <button
                        aria-label={
                            status === PlayerStatus.PLAYING ? t('player.pause') : t('player.play')
                        }
                        className={styles.button}
                        onClick={(e) => {
                            e.stopPropagation();
                            mediaTogglePlayPause();
                        }}
                        type="button"
                    >
                        <Icon
                            fill="default"
                            icon={status === PlayerStatus.PLAYING ? 'mediaPause' : 'mediaPlay'}
                            size="xl"
                        />
                    </button>
                    {!isRadioActive && (
                        <button
                            aria-label={t('player.next')}
                            className={styles.button}
                            onClick={(e) => {
                                e.stopPropagation();
                                mediaNext(false);
                            }}
                            type="button"
                        >
                            <Icon fill="default" icon="mediaNext" size="lg" />
                        </button>
                    )}
                    {!isRadioActive && <Progress duration={currentSong?.duration || 0} />}
                </div>
            )}
        </div>
    );
};
