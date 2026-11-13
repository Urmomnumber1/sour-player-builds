import { useEffect } from 'react';
import { create } from 'zustand';

import rainHeavyUrl from '../../../../../assets/sounds/rain-heavy.aac?url';
import rainLightUrl from '../../../../../assets/sounds/rain-light.aac?url';
import thunder1Url from '../../../../../assets/sounds/thunder-1.aac?url';
import thunder2Url from '../../../../../assets/sounds/thunder-2.aac?url';
import thunder3Url from '../../../../../assets/sounds/thunder-3.aac?url';

import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { PlayerStatus } from '/@/shared/types/types';

// Rain under the music (the Sour Stage, next to Slowed and Nightcore). Real recordings (credits in
// assets/sounds/readme.txt): "Rainy day" is a garden in the rain, "Stormy night" is a downpour with thunder.
// The lightning flickers in the Stage first, as bright as the strike is close, and its thunder follows:
// right away and loud for a close one, seconds later, softer and duller for one far off. The sounds load
// the first time they're used. It follows the music: quiet while paused, as loud as the player allows.

export type Ambience = 'none' | 'rain' | 'storm';

export const AMBIENCES: { id: Ambience; label: string }[] = [
    { id: 'none', label: 'No rain' },
    { id: 'rain', label: 'Rainy day' },
    { id: 'storm', label: 'Stormy night' },
];

export const useAmbience = create<{ kind: Ambience }>(() => ({ kind: 'none' }));

// the Stage listens for this to flash its picture: detail { power 0-1, x 0-100 (where in the sky) }
export const LIGHTNING_EVENT = 'sour-lightning';

// the rain files hold one 20 s loop, recorded with a little extra so it can loop inside the steady part
const LOOP = 20;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let rain: AudioBufferSourceNode | null = null;
let rainGain: GainNode | null = null;
let thunderTimer = 0;
let rainKind: Ambience = 'none';
const buffers = new Map<string, Promise<null | { buffer: AudioBuffer; start: number }>>();

const audio = () => {
    if (!ctx) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        // big buffers: this never needs to be quick, it needs to never crackle
        ctx = new Ctx({ latencyHint: 'playback' });
        master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return { ctx, master: master! };
};

// a sound, decoded once; start = where it really begins (the files open with a moment of silence)
const load = (url: string) => {
    let p = buffers.get(url);
    if (!p) {
        p = fetch(url)
            .then((r) => r.arrayBuffer())
            .then((data) => audio().ctx.decodeAudioData(data))
            .then((buffer) => {
                const d = buffer.getChannelData(0);
                let i = 0;
                while (i < d.length && Math.abs(d[i]) < 0.003) i++;
                return { buffer, start: i / buffer.sampleRate };
            })
            .catch(() => null);
        buffers.set(url, p);
    }
    return p;
};

const startRain = async (kind: Ambience) => {
    rainKind = kind;
    const sound = await load(kind === 'storm' ? rainHeavyUrl : rainLightUrl);
    // switched again (or off) while it was loading
    if (!sound || rainKind !== kind) return;
    const { ctx: c, master: out } = audio();
    stopRain();
    const src = c.createBufferSource();
    src.buffer = sound.buffer;
    src.loop = true;
    src.loopStart = sound.start + 1;
    src.loopEnd = Math.min(sound.buffer.duration, sound.start + 1 + LOOP);
    const g = c.createGain();
    g.gain.value = kind === 'storm' ? 1 : 0.9;
    src.connect(g).connect(out);
    src.start(0, src.loopStart);
    rain = src;
    rainGain = g;
};

const stopRain = () => {
    try {
        rain?.stop();
    } catch {
        // already stopped
    }
    rain?.disconnect();
    rainGain?.disconnect();
    rain = null;
    rainGain = null;
};

const flashAt = (power: number, x: number) =>
    window.dispatchEvent(new CustomEvent(LIGHTNING_EVENT, { detail: { power, x } }));

// one strike: the flash now, the thunder after the time its sound takes to get here
const strike = async () => {
    if (!ctx || !master) return;
    // 0 = right overhead, 1 = far away
    const distance = Math.random() ** 0.8;
    const power = 1 - distance * 0.72;
    const x = 12 + Math.random() * 76;
    flashAt(power, x);
    // close strikes often flash twice
    if (distance < 0.35 && Math.random() < 0.5)
        window.setTimeout(() => flashAt(power * 0.8, x), 260 + Math.random() * 200);
    const url =
        distance < 0.3
            ? thunder1Url
            : distance < 0.65
              ? Math.random() < 0.5
                  ? thunder2Url
                  : thunder1Url
              : thunder3Url;
    const sound = await load(url);
    if (!sound || !ctx || !master) return;
    const c = ctx;
    const delay = 0.12 + distance * 3.4;
    const src = c.createBufferSource();
    src.buffer = sound.buffer;
    // far thunder loses its crack (the air takes the highs) and arrives quieter
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 9000 - distance * 8200;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.max(-0.8, Math.min(0.8, (x - 50) / 60));
    const g = c.createGain();
    g.gain.value = 1.15 - distance * 0.65;
    src.connect(low).connect(pan).connect(g).connect(master);
    src.start(c.currentTime + delay, sound.start);
    src.onended = () => src.disconnect();
};

const scheduleThunder = () => {
    window.clearTimeout(thunderTimer);
    thunderTimer = window.setTimeout(
        () => {
            const { status } = usePlayerStoreBase.getState().player;
            if (useAmbience.getState().kind === 'storm' && status === PlayerStatus.PLAYING)
                void strike();
            scheduleThunder();
        },
        9000 + Math.random() * 26000,
    );
};

// how loud: the player's volume (squared, like a volume knob feels), none while paused
const level = () => {
    const { status, volume } = usePlayerStoreBase.getState().player;
    if (status !== PlayerStatus.PLAYING) return 0;
    const v = Math.max(0, Math.min(100, volume)) / 100;
    return 0.38 * v * v + 0.06 * v;
};

const fadeTo = (value: number, seconds = 0.8) => {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(value, now + seconds);
};

// lives in Sour Player's root, so the rain keeps going when the Stage closes (like Slowed and Nightcore)
export const AmbiencePlayer = () => {
    const kind = useAmbience((s) => s.kind);
    useEffect(() => {
        if (kind === 'none') {
            rainKind = 'none';
            fadeTo(0, 0.6);
            const t = window.setTimeout(stopRain, 700);
            window.clearTimeout(thunderTimer);
            return () => window.clearTimeout(t);
        }
        void startRain(kind).then(() => fadeTo(level(), 1.5));
        let first = 0;
        if (kind === 'storm') {
            // the first strike comes soon, so you know the storm is there
            void load(thunder1Url);
            first = window.setTimeout(() => {
                if (useAmbience.getState().kind === 'storm' && level() > 0) void strike();
            }, 4000);
            scheduleThunder();
        }
        const unsubscribe = usePlayerStoreBase.subscribe(
            (s) => [s.player.status, s.player.volume] as const,
            () => fadeTo(level(), 0.5),
            { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] },
        );
        return () => {
            unsubscribe();
            window.clearTimeout(first);
            window.clearTimeout(thunderTimer);
        };
    }, [kind]);
    return null;
};
