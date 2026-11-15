import { useEffect } from 'react';
import { create } from 'zustand';

import { api } from '/@/renderer/api';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { isIphoneBrowser } from '/@/renderer/features/player/audio-player/ios-web-player';
import { playerElement } from '/@/renderer/features/player/audio-player/player-elements';
import { convertToLogVolume } from '/@/renderer/features/player/audio-player/utils/player-utils';
import { useWebAudio } from '/@/renderer/features/player/hooks/use-webaudio';
import { useRadioStore } from '/@/renderer/features/radio/hooks/use-radio-player';
import { isNativeApp } from '/@/renderer/features/sour/mobile/android';
import { offlineUrl } from '/@/renderer/features/sour/mobile/offline';
import { phoneTranscode } from '/@/renderer/features/sour/mobile/phone-store';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import {
    countPlay,
    inStep,
    loadedVersion,
    loadVersions,
    ORIGINAL,
    reloadWith,
    setPick,
    useLoaded,
    useMainMute,
    useVersions,
    type VersionedSong,
    versionFileUrl,
    versionGain,
    versionLabel,
    versionOffset,
    versionsOf,
} from '/@/renderer/features/sour/versions/versions';
import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { useSettingsStore } from '/@/renderer/store/settings.store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { toast } from '/@/shared/components/toast/toast';
import { type PlayerData, type QueueSong } from '/@/shared/types/domain-types';
import { PlayerStatus, PlayerType, type WebAudio } from '/@/shared/types/types';

// Sour Player 0.15: what you hear of the song that's playing. The player plays one version of it (the one picked
// when it started, or your favourite); switching mid-song plays the other version alongside it, in step (both
// are timed to the original by Hermes Music), and crossfades over a second, like karaoke drops the vocals. Split
// ears plays two versions at once, one in each ear. Versions that don't line up start from the top instead (the
// song fades out and the player reloads with the version). iPhones switch by reloading, at the same moment.

export interface DeckState {
    // the version you hear (null: what the player plays)
    hear: null | string;
    // a version that doesn't line up: the song fades out, then the player starts it from the top
    hold: null | string;
    // split ears: the second version, in the right ear (the left one with swap)
    split: null | string;
    swap: boolean;
    // the queue item all this is for
    uid: null | string;
}

export const useDeck = create<DeckState>(() => ({
    hear: null,
    hold: null,
    split: null,
    swap: false,
    uid: null,
}));

// blend: the built-in player with its sound graph (desktop, Android); iphone: one element, reloads (split ears
// through its own sound); reload: no sound graph; later: another player (mpv, a TV)
type Mode = 'blend' | 'iphone' | 'later' | 'reload';

interface Voice {
    el: HTMLAudioElement;
    // was in step and playing once (from then on it stays in, through seeks)
    everReady: boolean;
    gain: GainNode | null;
    level: number;
    pan: null | StereoPannerNode;
    side: number;
    src: MediaElementAudioSourceNode | null;
    uid: string;
    version: string;
    want: boolean;
}

const engine = {
    counted: new Set<string>(),
    data: null as null | PlayerData,
    mainLevel: 1,
    own: null as AudioContext | null,
    voices: new Map<string, Voice>(),
    webAudio: null as null | WebAudio,
};

const mode = (): Mode => {
    if (useSettingsStore.getState().playback.type !== PlayerType.WEB) return 'later';
    if (isIphoneBrowser()) return 'iphone';
    return engine.webAudio?.ducks && engine.webAudio.pans ? 'blend' : 'reload';
};

const playerData = () => engine.data ?? usePlayerStoreBase.getState().getPlayerData();
const currentSong = () => playerData().currentSong;
const mainSlot = (m: Mode) => (m === 'iphone' ? 1 : playerData().num);
const mainTime = (m: Mode) => {
    const el = playerElement(mainSlot(m));
    return el && Number.isFinite(el.currentTime)
        ? el.currentTime
        : useTimestampStoreBase.getState().timestamp;
};

// the version you hear right now (what Group Play shares and what counts as played)
export const heardVersion = () => {
    const uid = currentSong()?._uniqueId;
    const deck = useDeck.getState();
    return (deck.uid === uid && deck.hear) || loadedVersion(uid);
};

const ownContext = () => {
    if (!engine.own) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        engine.own = new Ctx({ latencyHint: 'playback' }) as AudioContext;
    }
    if (engine.own.state !== 'running') void engine.own.resume().catch(() => undefined);
    return engine.own;
};

const originalUrl = async (song: QueueSong) => {
    const saved = offlineUrl(song);
    if (saved) return saved;
    let transcode = useSettingsStore.getState().playback.transcode;
    if (isNativeApp()) transcode = phoneTranscode(transcode);
    return api.controller.getStreamUrl({
        apiClientProps: { serverId: song._serverId },
        query: {
            bitrate: transcode.bitrate,
            format: transcode.format,
            id: song.id,
            maxSampleRate: transcode.maxSampleRate,
            transcode: transcode.enabled ?? false,
        },
    });
};

const smooth = (param: AudioParam, value: number, ctx: BaseAudioContext) => {
    if (Math.abs(param.value - value) < 0.0005) return;
    try {
        param.setTargetAtTime(value, ctx.currentTime, 0.02);
    } catch {
        param.value = value;
    }
};

const addVoice = (version: string, side: number, song: QueueSong, m: Mode): Voice => {
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    const voice: Voice = {
        el,
        everReady: false,
        gain: null,
        level: 0,
        pan: null,
        side,
        src: null,
        uid: song._uniqueId,
        version,
        want: true,
    };
    const w = engine.webAudio;
    const ctx = m === 'blend' && w ? w.context : ownContext();
    // through the player's own sound (EQ, compressor, reverb) when there is one
    const out = m === 'blend' && w ? (w.dsp?.preampGain ?? w.context.destination) : ctx.destination;
    try {
        voice.src = ctx.createMediaElementSource(el);
        voice.gain = ctx.createGain();
        voice.gain.gain.value = 0;
        voice.pan = ctx.createStereoPanner();
        voice.src.connect(voice.gain).connect(voice.pan).connect(out);
    } catch {
        el.volume = 0;
    }
    engine.voices.set(`${song._uniqueId}|${version}`, voice);
    if (version === ORIGINAL)
        originalUrl(song)
            .then((url) => {
                if (url && engine.voices.get(`${song._uniqueId}|${version}`) === voice)
                    el.src = url;
            })
            .catch(() => undefined);
    else el.src = versionFileUrl(version);
    return voice;
};

const dropVoice = (key: string, voice: Voice) => {
    try {
        voice.el.pause();
        voice.el.removeAttribute('src');
        voice.el.load();
    } catch {
        // already gone
    }
    try {
        voice.src?.disconnect();
        voice.gain?.disconnect();
        voice.pan?.disconnect();
    } catch {
        // not connected
    }
    engine.voices.delete(key);
};

// keeps a voice at the same moment of the song as the player (or lets it play out when the song has changed)
const follow = (voice: Voice, target: number, playing: boolean, tight: boolean) => {
    const el = voice.el;
    const { muted, speed, volume } = usePlayerStoreBase.getState().player;
    const rate = speed > 0 ? speed : 1;
    const media = el as HTMLAudioElement & { webkitPreservesPitch?: boolean };
    const pitch = useSettingsStore.getState().playback.preservePitch;
    if (media.preservesPitch !== pitch) {
        media.preservesPitch = pitch;
        media.webkitPreservesPitch = pitch;
    }
    if (!isIphoneBrowser())
        el.volume = convertToLogVolume(Math.max(0, Math.min(100, volume)) / 100);
    el.muted = muted;
    if (!playing || target < 0 || (el.duration > 0 && target > el.duration - 0.05)) {
        if (!el.paused) el.pause();
        return;
    }
    if (el.readyState >= 1) {
        const drift = el.currentTime - target;
        if (Math.abs(drift) > (tight ? 0.12 : 0.25)) {
            el.currentTime = target; // far off (a seek, or just started): jump
            el.playbackRate = rate;
        } else {
            // a little off: catch up (or wait) by playing 3% faster or slower, no jump
            const near = tight ? 0.008 : 0.02;
            el.playbackRate = rate * (drift > near ? 0.97 : drift < -near ? 1.03 : 1);
            if (Math.abs(drift) < 0.05 && el.readyState >= 3 && !el.paused) voice.everReady = true;
        }
    }
    if (el.paused) el.play().catch(() => undefined);
};

const STEP_IN = 0.05; // per tick (50 ms): about a second from silent to full
const STEP_OUT = 0.1;
const approach = (now: number, goal: number, step: number) =>
    now < goal ? Math.min(goal, now + step) : Math.max(goal, now - step);

// the versions of the songs in the players, looked up once per list
let entryAt = -1;
const entries = new Map<string, null | VersionedSong>();
const entryOf = (song?: QueueSong) => {
    if (!song) return null;
    const at = useVersions.getState().at;
    if (at !== entryAt || entries.size > 50) {
        entries.clear();
        entryAt = at;
    }
    if (!entries.has(song._uniqueId)) entries.set(song._uniqueId, versionsOf(song));
    return entries.get(song._uniqueId) ?? null;
};

const restMain = () => {
    const w = engine.webAudio;
    if (w?.ducks && w.pans)
        for (let i = 0; i < 2; i++) {
            smooth(w.ducks[i].gain, 1, w.context);
            smooth(w.pans[i].pan, 0, w.context);
        }
    if (useMainMute.getState().on) useMainMute.setState({ on: false });
};

const tick = () => {
    const m = mode();
    const radio = !!(useRadioStore.getState() as { currentStreamUrl?: null | string })
        .currentStreamUrl;
    const data = playerData();
    const song = radio ? undefined : data.currentSong;
    const uid = song?._uniqueId ?? null;
    let deck = useDeck.getState();
    if (deck.uid !== uid) {
        useDeck.setState({ hear: null, hold: null, split: null, uid });
        deck = useDeck.getState();
    }
    const entry = entryOf(song);
    if (!song || (!entry && engine.voices.size === 0)) {
        engine.mainLevel = 1;
        if (radio || !song) restMain();
        else applyMain(data, null, 0, m, false);
        return;
    }
    const main = loadedVersion(uid ?? undefined);
    const hear = deck.hear ?? main;
    let sides: { pan: number; version: string }[] = [{ pan: 0, version: hear }];
    if (deck.split && entry)
        sides = [
            { pan: -1, version: deck.swap ? deck.split : hear },
            { pan: 1, version: deck.swap ? hear : deck.split },
        ];
    if (!entry || m === 'later' || m === 'reload') sides = [{ pan: 0, version: main }];
    // iPhones: split ears play both through their own sound (the player can't be turned down or panned)
    const ownEars = m === 'iphone' && sides.length === 2;
    const mainSide = ownEars ? undefined : sides.find((s) => s.version === main);
    const wanted = sides.filter((s) => s !== mainSide);

    for (const v of engine.voices.values()) v.want = false;
    for (const s of wanted) {
        const key = `${uid}|${s.version}`;
        const voice = engine.voices.get(key) ?? addVoice(s.version, s.pan, song, m);
        voice.want = true;
        voice.side = s.pan;
    }

    const slot = mainSlot(m);
    const el = playerElement(slot);
    const playing = data.status === PlayerStatus.PLAYING && !!el && !el.paused;
    const T = mainTime(m);
    const offMain = versionOffset(entry, main);
    const rg = m === 'blend' ? (engine.webAudio?.gains?.[slot - 1]?.gain.value ?? 1) : 1;
    let allReady = true;
    for (const [key, voice] of engine.voices) {
        if (voice.uid === uid) {
            follow(
                voice,
                T - offMain + versionOffset(entry, voice.version),
                playing,
                sides.length === 2,
            );
        } else if (voice.el.paused === false && !playing) voice.el.pause();
        if (voice.want && !voice.everReady) allReady = false;
        voice.level = approach(
            voice.level,
            voice.want && voice.everReady ? 1 : 0,
            voice.want ? STEP_IN : STEP_OUT,
        );
        const ctx = voice.gain?.context;
        if (voice.gain && ctx)
            smooth(voice.gain.gain, voice.level * versionGain(entry, voice.version) * rg, ctx);
        else voice.el.volume = 0;
        if (voice.pan && ctx) smooth(voice.pan.pan, voice.side, ctx);
        if (!voice.want && voice.level === 0) dropVoice(key, voice);
    }

    // the player itself: down once what replaces it is playing in step
    const goal = deck.hold ? 0 : mainSide ? 1 : allReady ? 0 : 1;
    engine.mainLevel = approach(engine.mainLevel, goal, STEP_IN);
    if (deck.hold && engine.mainLevel === 0 && uid) {
        const version = deck.hold;
        useDeck.setState({ hear: null, hold: null });
        reloadWith(uid, version, 0);
    }
    applyMain(data, entry, mainSide?.pan ?? 0, m, ownEars && allReady);

    // a play counts once the song is well under way (as the version you hear)
    if (entry && uid && !engine.counted.has(uid)) {
        const seconds = (song.duration || 0) / 1000;
        if (T >= Math.min(30, seconds > 0 ? seconds * 0.5 : 30)) {
            engine.counted.add(uid);
            if (engine.counted.size > 500)
                engine.counted = new Set([...engine.counted].slice(-200));
            countPlay(entry, hear);
        }
    }
};

const applyMain = (
    data: PlayerData,
    entry: null | VersionedSong,
    pan: number,
    m: Mode,
    muteIphone: boolean,
) => {
    const w = engine.webAudio;
    if (m === 'blend' && w?.ducks && w.pans) {
        ([1, 2] as const).forEach((slot) => {
            const s = slot === 1 ? data.player1 : data.player2;
            const e = entry && s?._uniqueId === data.currentSong?._uniqueId ? entry : entryOf(s);
            // a version the player plays by itself plays as loud as the original
            const g = versionGain(e, loadedVersion(s?._uniqueId));
            const current = slot === data.num;
            smooth(w.ducks![slot - 1].gain, (current ? engine.mainLevel : 1) * g, w.context);
            smooth(w.pans![slot - 1].pan, current ? pan : 0, w.context);
        });
    }
    if (useMainMute.getState().on !== muteIphone) useMainMute.setState({ on: muteIphone });
};

// ---- switching ----
export const switchVersion = (version: string, quiet = false) => {
    const song = currentSong();
    const entry = versionsOf(song);
    if (!song || !entry) return;
    const uid = song._uniqueId;
    const m = mode();
    const main = loadedVersion(uid);
    const deck = useDeck.getState();
    const hearNow = (deck.uid === uid && deck.hear) || main;
    setPick(uid, version); // playing this song again (back, repeat) plays it too
    if (version === hearNow && !deck.hold) return;
    const split = deck.uid === uid && deck.split !== version ? deck.split : null;
    if (version === main) {
        useDeck.setState({ hear: null, hold: null, split, uid });
        return;
    }
    const together = inStep(entry, version) && inStep(entry, main);
    if (m === 'blend' && together) {
        useDeck.setState({ hear: version, hold: null, split, uid });
        return;
    }
    if (m === 'later') {
        if (!quiet)
            toast.info({
                message: `${versionLabel(entry, version)} plays the next time this song starts (switching mid-song needs the built-in player: Settings > Playback)`,
            });
        return;
    }
    if (m === 'blend') {
        // doesn't line up: the song fades out and the version starts from the top
        useDeck.setState({ hear: null, hold: version, split: null, uid });
        return;
    }
    // iPhones (and no sound graph): the player reloads with it, at the same moment when they line up
    const at = together
        ? Math.max(0, mainTime(m) - versionOffset(entry, main) + versionOffset(entry, version))
        : 0;
    useDeck.setState({ hear: null, hold: null, split: null, uid });
    reloadWith(uid, version, at);
};

// two versions at once, one in each ear (null: back to one)
export const splitEars = (version: null | string) => {
    if (!version) {
        useDeck.setState({ split: null });
        return;
    }
    const song = currentSong();
    const entry = versionsOf(song);
    if (!song || !entry) return;
    const m = mode();
    if (m !== 'blend' && m !== 'iphone') {
        toast.info({ message: 'Split ears needs the built-in player (Settings > Playback)' });
        return;
    }
    const main = loadedVersion(song._uniqueId);
    const deck = useDeck.getState();
    const hear = (deck.uid === song._uniqueId && deck.hear) || main;
    if (version === hear) return;
    if (!(inStep(entry, version) && inStep(entry, hear) && inStep(entry, main))) {
        toast.info({ message: "Those two don't line up, so they can't play side by side" });
        return;
    }
    if (m === 'iphone') ownContext(); // iPhones only start sound inside a tap: this is one
    useDeck.setState({ split: version, uid: song._uniqueId });
};

export const swapEars = () => useDeck.setState((s) => ({ swap: !s.swap }));

// Group Play: members hear the host's version
export const followVersion = (version: string) => {
    const song = currentSong();
    const entry = versionsOf(song);
    if (!song || !entry) return;
    const known = version === ORIGINAL || entry.versions.some((v) => v.id === version);
    if (known && heardVersion() !== version) switchVersion(version, true);
};

// dev builds only: a look inside for local tests
if (import.meta.env.DEV)
    (window as any).__sourVersions = { engine, useDeck, useLoaded, useVersions };

// ---- the list, the engine ----
let timer = 0;
let unsubscribe: (() => void) | null = null;
const start = () => {
    if (!timer) timer = window.setInterval(tick, 50);
    if (!unsubscribe) {
        const refresh = () => {
            engine.data = usePlayerStoreBase.getState().getPlayerData();
        };
        refresh();
        unsubscribe = usePlayerStoreBase.subscribe(refresh);
    }
    return () => {
        window.clearInterval(timer);
        timer = 0;
        unsubscribe?.();
        unsubscribe = null;
        engine.data = null;
        for (const [key, voice] of [...engine.voices]) dropVoice(key, voice);
        restMain();
    };
};

export const VersionDeck = () => {
    const { webAudio } = useWebAudio();
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me?.id);
    useEffect(() => {
        engine.webAudio = webAudio ?? null;
    }, [webAudio]);
    useEffect(() => start(), []);
    // the list of versions: on start, every few minutes and when the window comes back
    useEffect(() => {
        if (!url) return undefined;
        const load = () => void loadVersions().catch(() => undefined);
        load();
        const t = window.setInterval(load, 3 * 60000);
        window.addEventListener('focus', load);
        return () => {
            window.clearInterval(t);
            window.removeEventListener('focus', load);
        };
    }, [url, me]);
    // iPhones stop their own sound in the background: split ears ends there (the player carries on)
    useEffect(() => {
        const hidden = () => {
            if (document.hidden && isIphoneBrowser() && useDeck.getState().split)
                useDeck.setState({ split: null });
        };
        document.addEventListener('visibilitychange', hidden);
        return () => document.removeEventListener('visibilitychange', hidden);
    }, []);
    return null;
};
