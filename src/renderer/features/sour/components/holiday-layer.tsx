import { useEffect, useRef, useState } from 'react';

import styles from './holiday-layer.module.css';

import { isBirthday } from '/@/renderer/features/sour/components/profile-bits';
import { currentHoliday, type Particles } from '/@/renderer/features/sour/skins/holidays';
import { useMyProfile, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { useCurrentServer } from '/@/renderer/store';

interface Bit {
    a: number;
    glyph: string;
    hue: number;
    size: number;
    spin: number;
    vx: number;
    vy: number;
    x: number;
    y: number;
}

const GLYPHS: Record<Exclude<Particles, 'confetti' | 'fireworks' | 'snow'>, string[]> = {
    bats: ['\u{1F987}', '\u{1F987}', '\u{1F383}', '\u{1F47B}'],
    clovers: ['☘️', '\u{1F340}'],
    eggs: ['\u{1F95A}', '\u{1F423}', '\u{1F337}'],
    hearts: ['\u{1F496}', '❤️', '\u{1F495}'],
    lanterns: ['\u{1F3EE}', '\u{1F9E7}', '✨'],
    leaves: ['\u{1F342}', '\u{1F341}', '\u{1F343}'],
    suns: ['☀️', '\u{1F334}', '\u{1F30A}'],
};

const COUNT: Record<Particles, number> = {
    bats: 10,
    clovers: 14,
    confetti: 46,
    eggs: 12,
    fireworks: 0,
    hearts: 16,
    lanterns: 10,
    leaves: 16,
    snow: 70,
    suns: 9,
};

const spawn = (kind: Particles, w: number, h: number, anywhere: boolean): Bit => {
    const glyphs = kind in GLYPHS ? GLYPHS[kind as keyof typeof GLYPHS] : [''];
    const up = kind === 'lanterns';
    return {
        a: Math.random() * Math.PI * 2,
        glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
        hue: Math.floor(Math.random() * 360),
        size:
            kind === 'snow'
                ? 1.5 + Math.random() * 3
                : kind === 'confetti'
                  ? 6 + Math.random() * 6
                  : 16 + Math.random() * 14,
        spin: (Math.random() - 0.5) * 0.05,
        vx: kind === 'bats' ? 0.6 + Math.random() * 1.2 : (Math.random() - 0.5) * 0.4,
        vy: up
            ? -(0.25 + Math.random() * 0.35)
            : kind === 'bats'
              ? (Math.random() - 0.5) * 0.3
              : 0.35 + Math.random() * (kind === 'confetti' ? 1.4 : 0.7),
        x: kind === 'bats' && !anywhere ? -40 : Math.random() * w,
        y: anywhere
            ? Math.random() * h
            : up
              ? h + 30
              : kind === 'bats'
                ? Math.random() * h * 0.6
                : -30,
    };
};

// Emoji are slow to draw, so each one is drawn once per size into a little canvas and reused.
const sprites = new Map<string, HTMLCanvasElement>();
const sprite = (glyph: string, size: number) => {
    const key = `${glyph}:${size}`;
    let img = sprites.get(key);
    if (!img) {
        img = document.createElement('canvas');
        img.width = img.height = Math.ceil(size * 1.5);
        const g = img.getContext('2d');
        if (g) {
            g.font = `${size}px "Sour Emoji", sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(glyph, img.width / 2, img.height / 2);
        }
        sprites.set(key, img);
    }
    return img;
};
// the emoji font may arrive after the first sprites were drawn
document.fonts.addEventListener('loadingdone', () => sprites.clear());

// Falling (or floating) holiday bits over the app: snow in December, bats in October, hearts around
// Valentine's... and confetti on your birthday. Behind the player bar, never in the way of clicks.
const ParticleCanvas = ({ kind }: { kind: Particles }) => {
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const c = canvas.current;
        const ctx = c?.getContext('2d');
        if (!c || !ctx) return undefined;
        let w = 0;
        let h = 0;
        const fit = () => {
            w = c.width = window.innerWidth;
            h = c.height = window.innerHeight;
        };
        fit();
        window.addEventListener('resize', fit);
        let bits = Array.from({ length: COUNT[kind] }, () => spawn(kind, w, h, true));
        let sparks: { hue: number; life: number; vx: number; vy: number; x: number; y: number }[] =
            [];
        let nextBurst = 0;
        let frame = 0;
        let last = performance.now();
        // the app's panels: holiday bits keep to the empty space around them
        let zones: DOMRect[] = [];
        let zonesAt = 0;
        const blocked = (x: number, y: number) =>
            zones.some(
                (r) => x > r.left - 12 && x < r.right + 12 && y > r.top - 12 && y < r.bottom + 12,
            );
        const draw = (now: number) => {
            frame = requestAnimationFrame(draw);
            // about 30 frames a second is plenty for drifting decorations
            if (document.hidden || now - last < 31) return;
            const dt = Math.min(3, (now - last) / 16.7);
            last = now;
            ctx.clearRect(0, 0, w, h);
            if (kind === 'fireworks') {
                if (now > nextBurst) {
                    nextBurst = now + 1400 + Math.random() * 2200;
                    const x = w * (0.15 + Math.random() * 0.7);
                    const y = h * (0.1 + Math.random() * 0.35);
                    const hue = Math.floor(Math.random() * 360);
                    for (let i = 0; i < 60; i++) {
                        const a = (i / 60) * Math.PI * 2;
                        const sp = 1.5 + Math.random() * 2.5;
                        sparks.push({
                            hue: hue + Math.random() * 40,
                            life: 1,
                            vx: Math.cos(a) * sp,
                            vy: Math.sin(a) * sp,
                            x,
                            y,
                        });
                    }
                }
                sparks = sparks.filter((s) => (s.life -= 0.012 * dt) > 0);
                for (const s of sparks) {
                    s.x += s.vx * dt;
                    s.y += s.vy * dt;
                    s.vy += 0.03 * dt;
                    s.vx *= 0.985;
                    ctx.fillStyle = `hsla(${s.hue}, 90%, 62%, ${s.life})`;
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
                    ctx.fill();
                }
                return;
            }
            bits = bits.map((b) => {
                b.a += b.spin * dt;
                b.x += (b.vx + Math.sin(now / 1400 + b.hue) * 0.25) * dt;
                b.y += b.vy * dt;
                const gone = b.y > h + 40 || b.y < -60 || b.x > w + 60 || b.x < -80;
                return gone ? spawn(kind, w, h, false) : b;
            });
            if (now - zonesAt > 1000) {
                zonesAt = now;
                zones = ['#sidebar', '#player-bar', '#sidebar-queue']
                    .map((sel) => document.querySelector(sel)?.getBoundingClientRect())
                    .filter((r): r is DOMRect => !!r && r.width > 0);
            }
            for (const b of bits) {
                if (kind === 'snow') {
                    ctx.fillStyle = 'rgb(255 255 255 / 75%)';
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
                    ctx.fill();
                } else if (kind === 'confetti') {
                    ctx.save();
                    ctx.translate(b.x, b.y);
                    ctx.rotate(b.a);
                    ctx.fillStyle = `hsl(${b.hue}, 85%, 60%)`;
                    ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
                    ctx.restore();
                } else {
                    if (blocked(b.x, b.y)) continue; // never over the sidebar, the player bar or the queue
                    const img = sprite(b.glyph, Math.round(b.size / 2) * 2);
                    ctx.save();
                    ctx.globalAlpha = 0.8;
                    ctx.translate(b.x, b.y);
                    ctx.rotate(kind === 'bats' ? Math.sin(now / 200 + b.hue) * 0.2 : b.a);
                    ctx.drawImage(img, -img.width / 2, -img.height / 2);
                    ctx.restore();
                }
            }
        };
        frame = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', fit);
        };
    }, [kind]);
    return <canvas aria-hidden className={styles.canvas} ref={canvas} />;
};

const today = () => new Date().toISOString().slice(0, 10);

export const HolidayLayer = () => {
    const holidays = useSourStore((s) => s.look.holidays);
    const reduced = useSourStore((s) => s.look.reducedMotion || !!s.look.simple);
    const greeted = useSourStore((s) => s.greeted);
    const setLook = useSourStore((s) => s.setLook);
    const set = useSourStore((s) => s.set);
    const mine = useMyProfile().data;
    // not over the sign-in page (it covered the button there)
    const signedIn = !!useCurrentServer();
    const [, tick] = useState(0);
    useEffect(() => {
        // the date changes while the app stays open
        const timer = setInterval(() => tick((n) => n + 1), 30 * 60000);
        return () => clearInterval(timer);
    }, []);

    const birthday = !!mine && isBirthday(mine);
    const holiday = holidays ? currentHoliday() : null;
    const kind: null | Particles = birthday ? 'confetti' : (holiday?.particles ?? null);
    const greetingId = birthday ? `birthday:${today()}` : holiday ? `${holiday.id}:${today()}` : '';
    const showGreeting = signedIn && !reduced && !!greetingId && greeted !== greetingId;

    return (
        <>
            {kind && !reduced && <ParticleCanvas kind={kind} />}
            {showGreeting && (
                <div className={styles.greeting} role="status">
                    <span className={styles.emoji}>{birthday ? '\u{1F382}' : holiday?.emoji}</span>
                    <span>
                        {birthday
                            ? `Happy birthday, ${mine?.name}! Everyone can see it on your profile today.`
                            : `${holiday?.greeting}! The ${holiday?.name} skin is on.`}
                    </span>
                    {!birthday && (
                        <button
                            className={styles.button}
                            onClick={() => {
                                setLook({ holidays: false });
                                set({ greeted: greetingId });
                            }}
                            type="button"
                        >
                            Turn off
                        </button>
                    )}
                    <button
                        aria-label="Close"
                        className={styles.button}
                        onClick={() => set({ greeted: greetingId })}
                        type="button"
                    >
                        &times;
                    </button>
                </div>
            )}
        </>
    );
};
