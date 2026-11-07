import { useEffect } from 'react';
import { create } from 'zustand';

import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { PlayerStatus } from '/@/shared/types/types';

// Rain under the music (the Sour Stage, next to Slowed and Nightcore): "Rainy day" is steady rain, "Stormy
// night" is heavier rain with thunder far away and a faint flash of lightning in the Stage. All of it is made
// right here with Web Audio (noise shaped into rain, low rumbles for thunder): no sound files, nothing to
// download. It follows the music: quiet while paused, as loud as the player's volume allows.

export type Ambience = 'none' | 'rain' | 'storm';

export const AMBIENCES: { id: Ambience; label: string }[] = [
    { id: 'none', label: 'No rain' },
    { id: 'rain', label: 'Rainy day' },
    { id: 'storm', label: 'Stormy night' },
];

export const useAmbience = create<{ kind: Ambience }>(() => ({ kind: 'none' }));

// the Stage listens for this to flash its picture
export const LIGHTNING_EVENT = 'sour-lightning';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let rain: AudioBufferSourceNode | null = null;
let rainGain: GainNode | null = null;
let thunderTimer = 0;

const audio = () => {
    if (!ctx) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        ctx = new Ctx();
        master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return { ctx, master: master! };
};

// a few seconds of stereo rain: soft noise (the hiss of rain) with drops scattered through it, made once and looped
const rainBuffer = (c: AudioContext, heavy: boolean) => {
    const seconds = 6;
    const rate = c.sampleRate;
    const buf = c.createBuffer(2, seconds * rate, rate);
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        // pink-ish noise (Paul Kellet's filter)
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        for (let i = 0; i < d.length; i++) {
            const w = Math.random() * 2 - 1;
            b0 = 0.99765 * b0 + w * 0.099046;
            b1 = 0.963 * b1 + w * 0.2965164;
            b2 = 0.57 * b2 + w * 1.0526913;
            d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
        }
        // drops: short bright ticks that fade fast
        const drops = (heavy ? 900 : 520) * seconds;
        for (let k = 0; k < drops; k++) {
            const at = Math.floor(Math.random() * (d.length - 400));
            const size = 0.05 + Math.random() * (heavy ? 0.3 : 0.2);
            const len = 60 + Math.floor(Math.random() * 300);
            for (let i = 0; i < len; i++)
                d[at + i] += (Math.random() * 2 - 1) * size * Math.exp(-i / (len / 5));
        }
        // the loop's ends meet without a click
        const fade = Math.floor(rate * 0.05);
        for (let i = 0; i < fade; i++) {
            const g = i / fade;
            d[i] *= g;
            d[d.length - 1 - i] *= g;
        }
    }
    return buf;
};

const startRain = (heavy: boolean) => {
    const { ctx: c, master: out } = audio();
    stopRain();
    const src = c.createBufferSource();
    src.buffer = rainBuffer(c, heavy);
    src.loop = true;
    // rain is mostly hiss: no deep rumble, a soft top
    const high = c.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = heavy ? 250 : 400;
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = heavy ? 6500 : 8000;
    const g = c.createGain();
    g.gain.value = heavy ? 0.9 : 0.7;
    src.connect(high).connect(low).connect(g).connect(out);
    src.start();
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

// thunder far away: a low rumble that swells, crackles a little and rolls off (different every time)
const thunder = () => {
    if (!ctx || !master) return;
    const c = ctx;
    const seconds = 4 + Math.random() * 4;
    const rate = c.sampleRate;
    const buf = c.createBuffer(2, Math.floor(seconds * rate), rate);
    const swell = 0.25 + Math.random() * 0.9;
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let brown = 0;
        for (let i = 0; i < d.length; i++) {
            const t = i / rate;
            brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
            const env = t < swell ? t / swell : Math.exp(-(t - swell) / (seconds / 3.2));
            // a few rolls inside the rumble
            const roll = 0.7 + 0.3 * Math.sin(t * (2 + ch) + Math.sin(t * 0.7) * 3);
            d[i] = brown * 3.2 * env * roll;
        }
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 140 + Math.random() * 160;
    const g = c.createGain();
    g.gain.value = 0.55 + Math.random() * 0.35;
    src.connect(low).connect(g).connect(master);
    src.start();
    src.onended = () => src.disconnect();
    // the flash comes first (light is faster than sound)
    window.dispatchEvent(new CustomEvent(LIGHTNING_EVENT));
};

const scheduleThunder = () => {
    window.clearTimeout(thunderTimer);
    thunderTimer = window.setTimeout(
        () => {
            const { status } = usePlayerStoreBase.getState().player;
            if (useAmbience.getState().kind === 'storm' && status === PlayerStatus.PLAYING) {
                window.setTimeout(thunder, 600 + Math.random() * 1800);
            }
            scheduleThunder();
        },
        14000 + Math.random() * 30000,
    );
};

// how loud: the player's volume (squared, like a volume knob feels), none while paused
const level = () => {
    const { status, volume } = usePlayerStoreBase.getState().player;
    if (status !== PlayerStatus.PLAYING) return 0;
    const v = Math.max(0, Math.min(100, volume)) / 100;
    return 0.22 * v * v + 0.04 * v;
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
            fadeTo(0, 0.6);
            const t = window.setTimeout(stopRain, 700);
            window.clearTimeout(thunderTimer);
            return () => window.clearTimeout(t);
        }
        startRain(kind === 'storm');
        fadeTo(level(), 1.5);
        if (kind === 'storm') scheduleThunder();
        const unsubscribe = usePlayerStoreBase.subscribe(
            (s) => [s.player.status, s.player.volume] as const,
            () => fadeTo(level(), 0.5),
            { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] },
        );
        return () => {
            unsubscribe();
            window.clearTimeout(thunderTimer);
        };
    }, [kind]);
    return null;
};
