import { useEffect, useRef, useState } from 'react';

import styles from './v10.module.css';

import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { useFastAverageColor } from '/@/renderer/hooks';
import { usePlayerSong } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem } from '/@/shared/types/domain-types';

// ---------- the v0.10 look: the whole app takes on the colour of the song that's playing ----------
export const LiquidTint = () => {
    const ui = useSourStore((s) => s.look.ui ?? 'liquid');
    const song = usePlayerSong();
    const cover = useItemImageUrl({
        id: song?.imageId || undefined,
        itemType: LibraryItem.SONG,
        type: 'table',
    });
    const { background } = useFastAverageColor({
        algorithm: 'dominant',
        src: ui === 'liquid' ? cover || null : null,
        srcLoaded: true,
    });
    useEffect(() => {
        const root = document.documentElement;
        if (ui !== 'liquid' || !background) {
            root.style.removeProperty('--liquid-tint');
            return;
        }
        root.style.setProperty('--liquid-tint', background);
    }, [background, ui]);
    return null;
};

// ---------- v0.10, the 10th big update: confetti once, the first time it opens ----------
const COLORS = ['#f4d03f', '#ff7a59', '#9be15d', '#7aa2ff', '#d58cff', '#ff5c8a'];

export const TenthUpdate = () => {
    const seen = useSourStore((s) => s.celebrated ?? []);
    const [on, setOn] = useState(false);
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (seen.includes('0.10')) return undefined;
        const { look, set } = useSourStore.getState();
        // v0.8-0.9 users move to the new look once (v2 and Classic stay in Sour Studio > Layout)
        set({
            celebrated: [...seen, '0.10'],
            ...(look.ui === 'new' ? { look: { ...look, ui: 'liquid' as const } } : {}),
        });
        setOn(true);
        toast.success({
            autoClose: 9000,
            message: 'Sour Player 0.10 - the 10th big update. Thanks for listening with us!',
        });
        const t = window.setTimeout(() => setOn(false), 7000);
        return () => window.clearTimeout(t);
        // once, on the first start of 0.10
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        const c = canvas.current;
        if (!on || !c) return undefined;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
        const ctx = c.getContext('2d');
        if (!ctx) return undefined;
        c.width = window.innerWidth;
        c.height = window.innerHeight;
        const bits = Array.from({ length: 220 }, () => ({
            c: COLORS[Math.floor(Math.random() * COLORS.length)],
            r: Math.random() * Math.PI,
            s: 6 + Math.random() * 7,
            spin: (Math.random() - 0.5) * 0.3,
            vx: (Math.random() - 0.5) * 9,
            vy: -6 - Math.random() * 12,
            x: c.width / 2 + (Math.random() - 0.5) * c.width * 0.6,
            y: c.height + 20,
        }));
        let frame = 0;
        const draw = () => {
            ctx.clearRect(0, 0, c.width, c.height);
            for (const b of bits) {
                b.vy += 0.22;
                b.vx *= 0.99;
                b.x += b.vx;
                b.y += b.vy;
                b.r += b.spin;
                ctx.save();
                ctx.translate(b.x, b.y);
                ctx.rotate(b.r);
                ctx.fillStyle = b.c;
                ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
                ctx.restore();
            }
            frame = requestAnimationFrame(draw);
        };
        draw();
        return () => cancelAnimationFrame(frame);
    }, [on]);
    if (!on) return null;
    return <canvas aria-hidden className={styles.confetti} ref={canvas} />;
};

// ---------- avatar decorations: the party hat (accounts from before 0.10) ----------
export const AvatarDecoration = ({ kind, size }: { kind?: null | string; size: number }) => {
    if (kind !== 'party-hat') return null;
    const w = Math.max(12, size * 0.55);
    return (
        <svg
            aria-label="Party hat"
            className={styles.hat}
            height={w * 1.15}
            style={{ right: -w * 0.18, top: -w * 0.62 }}
            viewBox="0 0 40 46"
            width={w}
        >
            <title>Party hat (here before Sour Player 0.10)</title>
            <defs>
                <linearGradient id="hat-stripes" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0" stopColor="#ff5c8a" />
                    <stop offset="1" stopColor="#d58cff" />
                </linearGradient>
            </defs>
            <g transform="rotate(18 20 26)">
                <path d="M20 4 L34 40 Q20 45 6 40 Z" fill="url(#hat-stripes)" />
                <path d="M13 22 L27 22" stroke="#f4d03f" strokeWidth="3" />
                <path d="M10 31 L30 31" stroke="#9be15d" strokeWidth="3" />
                <ellipse cx="20" cy="40.5" fill="#f4d03f" rx="15" ry="3.2" />
                <circle cx="20" cy="4" fill="#f4d03f" r="4" />
            </g>
        </svg>
    );
};
