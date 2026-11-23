import { useEffect, useRef } from 'react';

import { usePlayerEvents } from '/@/renderer/features/player/audio-player/hooks/use-player-events';
import { useSongUrl } from '/@/renderer/features/player/audio-player/hooks/use-stream-url';
import { setPlayerElement } from '/@/renderer/features/player/audio-player/player-elements';
import { takeReloadSeek, useMainMute } from '/@/renderer/features/sour/versions/versions';
import {
    usePlaybackSettings,
    usePlayerActions,
    usePlayerData,
    usePlayerMuted,
    usePlayerRepeat,
    usePlayerSpeed,
    usePlayerVolume,
} from '/@/renderer/store';
import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { PlayerRepeat, PlayerStatus } from '/@/shared/types/types';

// iPhone / iPad in the browser (Hermes Music's /app/, the Home Screen app): one audio element that
// changes songs, instead of the usual two that hand over to each other. iOS only lets the element
// that is already playing carry on in the background, and ties the lock screen / Control Center
// controls to it - with two, the second song stayed silent and the controls stopped answering.
// (also the iPhone app itself: the same rule applies inside it)
export const isIphoneBrowser = () =>
    (window as any).Capacitor?.getPlatform?.() === 'ios' ||
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// (0.16) iPhones play the app's other sounds (the Stage's rain, split ears) through the ringer switch:
// on silent they made no sound at all. Telling iOS this is a music player lifts that (iOS 16.4 and newer)
if (typeof navigator !== 'undefined' && isIphoneBrowser()) {
    try {
        const session = (navigator as { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'playback';
    } catch {
        // an older iPhone: nothing to set
    }
}

// how many times a song that broke off is picked up again before moving on
const RETRIES = 3;

export function IosWebPlayer() {
    const audio = useRef<HTMLAudioElement>(null);
    const { nextSong, num, player1, player2, status } = usePlayerData();
    const song = num === 1 ? player1 : player2;
    const { mediaAutoNext, setTimestamp } = usePlayerActions();
    const { transcode } = usePlaybackSettings();
    const url = useSongUrl(song, true, transcode);
    // (0.16) the next song's address, ready before this one ends: iOS only lets the next song start by
    // itself (screen off, app in the background) in the very moment the last one ends
    const upcoming = nextSong && nextSong._uniqueId !== song?._uniqueId ? nextSong : undefined;
    const nextUrl = useSongUrl(upcoming, false, transcode);
    const repeat = usePlayerRepeat();
    const volume = usePlayerVolume();
    const muted = usePlayerMuted();
    // Slowed and Nightcore: the speed, with the pitch moving along (unless the setting keeps it)
    const speed = usePlayerSpeed();
    const { preservePitch } = usePlaybackSettings();
    const firstLoad = useRef(true);
    // Sour Player 0.15: split ears play both versions alongside, with this one silent (see versions)
    const versionsMuted = useMainMute((s) => s.on);
    const latest = useRef({
        mediaAutoNext,
        next: { uid: upcoming?._uniqueId, url: nextUrl },
        repeat,
        setTimestamp,
        status,
        uid: song?._uniqueId,
    });
    latest.current = {
        mediaAutoNext,
        next: { uid: upcoming?._uniqueId, url: nextUrl },
        repeat,
        setTimestamp,
        status,
        uid: song?._uniqueId,
    };
    // the song the element was already given when the last one ended (its address isn't loaded twice)
    const started = useRef<null | string>(null);
    // when the app itself last paused the element or changed its song (that "pause" isn't iOS's doing)
    const ours = useRef(0);
    const retries = useRef({ n: 0, uid: '' });

    useEffect(() => {
        setPlayerElement(1, audio.current);
        return () => setPlayerElement(1, null);
    }, []);

    // play() the way iOS wants it: refused (no tap behind it) means the app shows "paused" again, instead
    // of a pause button over silence
    const play = (a: HTMLAudioElement) => {
        a.play().catch((e: Error) => {
            if (e?.name === 'NotAllowedError') usePlayerStoreBase.getState().mediaPause();
        });
    };
    const playRef = useRef(play);
    playRef.current = play;

    // a new song: same element, new source (keeps playing in the background)
    useEffect(() => {
        const a = audio.current;
        if (!a || !url) return;
        const uid = latest.current.uid;
        // the element took this song itself when the last one ended
        const taken = !!uid && started.current === uid;
        started.current = null;
        if (!taken && a.src !== url) {
            ours.current = Date.now();
            a.src = url;
            a.load();
            // another version of the same song: carry on from the same moment
            const at = takeReloadSeek(uid);
            if (at !== null && at > 0.5)
                a.addEventListener('loadedmetadata', () => (a.currentTime = at), { once: true });
            if (firstLoad.current) {
                // carry on where the last session stopped
                const at = useTimestampStoreBase.getState().timestamp;
                if (at > 0)
                    a.addEventListener('loadedmetadata', () => (a.currentTime = at), {
                        once: true,
                    });
            }
        }
        firstLoad.current = false;
        if (latest.current.status === PlayerStatus.PLAYING && a.paused) playRef.current(a);
    }, [url]);

    // (0.16) play and pause reach the element in the same moment as the tap (or the lock screen button):
    // a moment later iOS no longer counts it as the person's doing and can refuse to start the sound
    useEffect(
        () =>
            usePlayerStoreBase.subscribe(
                (s) => s.player.status,
                (next) => {
                    const a = audio.current;
                    if (!a) return;
                    if (next === PlayerStatus.PLAYING) {
                        if (a.paused && a.src) playRef.current(a);
                    } else if (!a.paused) {
                        ours.current = Date.now();
                        a.pause();
                    }
                },
            ),
        [],
    );
    // (and after a redraw, for what the line above couldn't do yet: a song that had no address)
    useEffect(() => {
        const a = audio.current;
        if (!a) return;
        if (status === PlayerStatus.PLAYING) {
            if (a.paused && a.src) playRef.current(a);
        } else if (!a.paused) {
            ours.current = Date.now();
            a.pause();
        }
    }, [status]);

    useEffect(() => {
        const a = audio.current;
        if (!a) return undefined;
        const apply = () => {
            a.defaultPlaybackRate = speed || 1;
            a.playbackRate = speed || 1;
            const media = a as HTMLAudioElement & { webkitPreservesPitch?: boolean };
            media.preservesPitch = preservePitch;
            media.webkitPreservesPitch = preservePitch;
        };
        apply();
        // a new song starts at normal speed: set it again
        a.addEventListener('loadedmetadata', apply);
        a.addEventListener('play', apply);
        return () => {
            a.removeEventListener('loadedmetadata', apply);
            a.removeEventListener('play', apply);
        };
    }, [speed, preservePitch]);

    useEffect(() => {
        const a = audio.current;
        if (!a) return;
        a.volume = Math.max(0, Math.min(1, volume / 100)); // iOS keeps its own volume; harmless
        a.muted = muted || versionsMuted;
    }, [volume, muted, versionsMuted]);

    usePlayerEvents(
        {
            onPlayerSeekToTimestamp: ({ timestamp }) => {
                if (audio.current) audio.current.currentTime = timestamp;
            },
        },
        [],
    );

    // (0.16) a song that breaks off (the phone changed networks, the server hiccuped): picked up again from
    // the same moment a few times, then the next song - instead of silence in the middle of a playlist
    const recover = () => {
        const a = audio.current;
        const uid = latest.current.uid ?? '';
        if (!a || !a.src || latest.current.status !== PlayerStatus.PLAYING) return;
        if (retries.current.uid !== uid) retries.current = { n: 0, uid };
        if (retries.current.n >= RETRIES) {
            retries.current = { n: 0, uid: '' };
            latest.current.mediaAutoNext();
            return;
        }
        retries.current.n++;
        const at = a.currentTime;
        const again = () => {
            if (latest.current.uid !== uid || latest.current.status !== PlayerStatus.PLAYING)
                return;
            ours.current = Date.now();
            const src = a.src;
            a.src = src;
            a.load();
            if (at > 0.5)
                a.addEventListener('loadedmetadata', () => (a.currentTime = at), { once: true });
            playRef.current(a);
        };
        if (navigator.onLine) window.setTimeout(again, 1200 * retries.current.n);
        else window.addEventListener('online', again, { once: true });
    };

    return (
        <audio
            id="sour-ios-player"
            onEnded={() => {
                const a = audio.current;
                if (latest.current.repeat === PlayerRepeat.ONE && a) {
                    a.currentTime = 0;
                    a.play().catch(() => undefined);
                    return;
                }
                const next = latest.current.next;
                latest.current.mediaAutoNext();
                // the next song starts right here, inside "ended": the store has moved on to it, and by the
                // time the screen would redraw (it doesn't, in a pocket) iOS has stopped listening
                const now = usePlayerStoreBase.getState().getPlayerData();
                if (
                    a &&
                    next.url &&
                    next.uid &&
                    now.status === PlayerStatus.PLAYING &&
                    now.currentSong?._uniqueId === next.uid
                ) {
                    started.current = next.uid;
                    ours.current = Date.now();
                    a.src = next.url;
                    a.load();
                    playRef.current(a);
                }
            }}
            onError={recover}
            onPause={() => {
                // iOS paused it (a call, Siri, headphones pulled out, another app's sound): the app says so
                // too. Without this the button still showed "pause" and took two taps to play again
                const a = audio.current;
                if (!a || !a.paused || a.ended || Date.now() - ours.current < 1500) return;
                if (usePlayerStoreBase.getState().player.status === PlayerStatus.PLAYING)
                    usePlayerStoreBase.getState().mediaPause();
            }}
            onPlaying={() => {
                // ...and when iOS starts it again (the headphones' button, the call ended)
                const a = audio.current;
                retries.current = { n: 0, uid: latest.current.uid ?? '' };
                if (!a || a.paused) return;
                if (usePlayerStoreBase.getState().player.status !== PlayerStatus.PLAYING)
                    usePlayerStoreBase.getState().mediaPlay();
            }}
            onTimeUpdate={() => {
                if (audio.current) latest.current.setTimestamp(audio.current.currentTime);
            }}
            preload="auto"
            ref={audio}
            style={{ display: 'none' }}
        />
    );
}
