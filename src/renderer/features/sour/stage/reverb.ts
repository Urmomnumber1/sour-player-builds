import { createJSONStorage, persist } from 'zustand/middleware';
import { createWithEqualityFn } from 'zustand/traditional';

// Reverb on the music (the Sour Stage next to Slowed and Nightcore, so "slowed + reverb" is one tap away).
// It sits at the very end of the built-in player's sound chain (after the EQ and compressor): the music
// goes straight through ("dry") and also through a convolver that makes the room ("wet"). The rooms are
// made here (noise that dies away, darker as it fades), nothing to download. Off = the convolver is
// disconnected, so it costs nothing.

export type ReverbKind = 'dream' | 'hall' | 'off' | 'room';

export const REVERBS: { id: ReverbKind; label: string }[] = [
    { id: 'off', label: 'No reverb' },
    { id: 'room', label: 'Room' },
    { id: 'hall', label: 'Hall' },
    { id: 'dream', label: 'Dreamy' },
];

export const useReverb = createWithEqualityFn<{ kind: ReverbKind }>()(
    persist(() => ({ kind: 'off' as ReverbKind }), {
        name: 'sour-reverb',
        storage: createJSONStorage(() => localStorage),
    }),
);

const ROOMS: Record<
    Exclude<ReverbKind, 'off'>,
    { damp: number; decay: number; dry: number; pre: number; seconds: number; wet: number }
> = {
    dream: { damp: 0.55, decay: 2.2, dry: 0.74, pre: 0.045, seconds: 5.2, wet: 0.62 },
    hall: { damp: 0.35, decay: 3, dry: 0.86, pre: 0.028, seconds: 2.9, wet: 0.42 },
    room: { damp: 0.18, decay: 2.6, dry: 0.93, pre: 0.012, seconds: 1.2, wet: 0.3 },
};

// a stereo impulse response: noise that dies away, losing its highs as it goes
const impulse = (c: BaseAudioContext, room: (typeof ROOMS)['hall']) => {
    const rate = c.sampleRate;
    const length = Math.floor(rate * room.seconds);
    const pre = Math.floor(rate * room.pre);
    const buf = c.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let smooth = 0;
        for (let i = pre; i < length; i++) {
            const t = (i - pre) / (length - pre);
            // the later the reflection, the duller it sounds
            const k = 1 - room.damp * t - 0.15 * t * t;
            smooth += Math.max(0.05, k) * (Math.random() * 2 - 1 - smooth);
            d[i] = smooth * Math.pow(1 - t, room.decay);
        }
    }
    return buf;
};

export interface ReverbChain {
    dispose: () => void;
    input: GainNode;
    output: GainNode;
}

// input -> dry -> output, and input -> convolver -> wet -> output (only while a room is picked)
export const createReverb = (c: AudioContext): ReverbChain => {
    const input = c.createGain();
    const output = c.createGain();
    const dry = c.createGain();
    const wet = c.createGain();
    const convolver = c.createConvolver();
    convolver.normalize = true;
    input.connect(dry).connect(output);
    convolver.connect(wet).connect(output);
    wet.gain.value = 0;
    const made = new Map<string, AudioBuffer>();
    let connected = false;
    const set = (kind: ReverbKind) => {
        const now = c.currentTime;
        if (kind === 'off') {
            dry.gain.setTargetAtTime(1, now, 0.08);
            wet.gain.setTargetAtTime(0, now, 0.08);
            if (connected) {
                // let the tail fade, then stop feeding the convolver
                window.setTimeout(() => {
                    if (useReverb.getState().kind !== 'off' || !connected) return;
                    input.disconnect(convolver);
                    connected = false;
                }, 600);
            }
            return;
        }
        const room = ROOMS[kind];
        if (!made.has(kind)) made.set(kind, impulse(c, room));
        convolver.buffer = made.get(kind)!;
        if (!connected) {
            input.connect(convolver);
            connected = true;
        }
        dry.gain.setTargetAtTime(room.dry, now, 0.08);
        wet.gain.setTargetAtTime(room.wet, now, 0.08);
    };
    set(useReverb.getState().kind);
    const unsubscribe = useReverb.subscribe((s) => set(s.kind));
    return {
        dispose: () => {
            unsubscribe();
            input.disconnect();
            convolver.disconnect();
            output.disconnect();
        },
        input,
        output,
    };
};
