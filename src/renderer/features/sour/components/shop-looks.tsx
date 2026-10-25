import clsx from 'clsx';
import { type CSSProperties, useEffect, useRef } from 'react';

import styles from './shop-looks.module.css';

import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';

// How the Sour Shop's items look. Hermes Music keeps who owns and wears what; this draws them.

// ---------- avatar decorations ----------
const EMOJI: Record<
    string,
    { at: 'around' | 'face' | 'top' | 'top-right'; glyph: string; spin?: boolean }
> = {
    crown: { at: 'top', glyph: '👑' },
    flame: { at: 'around', glyph: '🔥' },
    headphones: { at: 'top', glyph: '🎧' },
    heart: { at: 'top-right', glyph: '💖' },
    lemon: { at: 'top-right', glyph: '🍋' },
    notes: { at: 'around', glyph: '🎵' },
    pumpkin: { at: 'top', glyph: '🎃' },
    raincloud: { at: 'top', glyph: '🌧️' },
    'snow-globe': { at: 'top-right', glyph: '❄️' },
    sparkles: { at: 'around', glyph: '✨' },
    sunflower: { at: 'top-right', glyph: '🌻' },
    sunglasses: { at: 'face', glyph: '🕶️' },
    'tiny-cat': { at: 'top', glyph: '🐈' },
};

export const ShopDecoration = ({ kind, size }: { kind?: null | string; size: number }) => {
    const url = useHermesUrl();
    if (!kind) return null;
    const s = Math.max(12, size * 0.5);
    if (kind.startsWith('c-')) {
        return (
            <img
                alt=""
                className={styles.deco}
                height={s}
                src={`${url}/api/shop/items/${kind}/image`}
                style={{ right: -s * 0.2, top: -s * 0.55 }}
                width={s}
            />
        );
    }
    if (kind === 'halo') {
        return (
            <span
                aria-hidden
                className={clsx(styles.deco, styles.halo)}
                style={{ height: s * 0.35, left: size * 0.15, top: -s * 0.3, width: size * 0.7 }}
            />
        );
    }
    if (kind === 'vinyl-halo') {
        return (
            <span
                aria-hidden
                className={clsx(styles.deco, styles.vinyl)}
                style={{ inset: -size * 0.12 }}
            />
        );
    }
    if (kind === 'cat-ears') {
        return (
            <svg
                aria-hidden
                className={styles.deco}
                style={{ left: 0, top: -size * 0.28 }}
                viewBox="0 0 40 16"
                width={size}
            >
                <path
                    d="M4 16 L9 1 L16 14 Z M24 14 L31 1 L36 16 Z"
                    fill="currentColor"
                    opacity="0.9"
                />
                <path d="M7 14 L9.5 5 L13 13 Z M27 13 L30.5 5 L33 14 Z" fill="#f7a8c4" />
            </svg>
        );
    }
    if (kind === 'witch-hat' || kind === 'santa-hat') {
        const santa = kind === 'santa-hat';
        return (
            <svg
                aria-hidden
                className={styles.deco}
                style={{ right: -s * 0.15, top: -s * 0.75 }}
                viewBox="0 0 40 40"
                width={s}
            >
                <g transform="rotate(14 20 26)">
                    <path
                        d="M8 34 Q20 2 30 6 Q24 18 32 34 Z"
                        fill={santa ? '#d62d2d' : '#3b2457'}
                    />
                    <rect
                        fill={santa ? '#fff' : '#9b6bd6'}
                        height="5"
                        rx="2.5"
                        width="30"
                        x="5"
                        y="32"
                    />
                    {santa && <circle cx="30" cy="6" fill="#fff" r="4" />}
                </g>
            </svg>
        );
    }
    const e = EMOJI[kind];
    if (!e) return null;
    if (e.at === 'around') {
        return (
            <span
                aria-hidden
                className={clsx(styles.deco, styles.orbit)}
                style={{ inset: -size * 0.15 }}
            >
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        style={{ ['--i' as string]: i, fontSize: s * 0.45 } as CSSProperties}
                    >
                        {e.glyph}
                    </span>
                ))}
            </span>
        );
    }
    if (e.at === 'face') {
        return (
            <span
                aria-hidden
                className={clsx(styles.deco, styles.emoji)}
                style={{
                    fontSize: size * 0.55,
                    left: '50%',
                    top: size * 0.18,
                    transform: 'translateX(-50%)',
                }}
            >
                {e.glyph}
            </span>
        );
    }
    return (
        <span
            aria-hidden
            className={clsx(styles.deco, styles.emoji)}
            style={{
                fontSize: s * (e.at === 'top' ? 0.9 : 0.7),
                ...(e.at === 'top'
                    ? { left: '50%', top: -s * 0.7, transform: 'translateX(-50%)' }
                    : { right: -s * 0.25, top: -s * 0.45 }),
            }}
        >
            {e.glyph}
        </span>
    );
};

// ---------- frames (a class on the avatar) ----------
export const frameClass = (frame?: string) =>
    frame
        ? {
              'ember-ring': styles.frameEmber,
              'gold-ring': styles.frameGold,
              'ice-ring': styles.frameIce,
              'neon-ring': styles.frameNeon,
              'pulse-ring': styles.framePulse,
              'rainbow-drip': styles.frameRainbow,
              'vinyl-ring': styles.frameVinyl,
          }[frame]
        : undefined;

// ---------- name styles ----------
export const nameClass = (style?: string) =>
    style
        ? {
              'name-glitch': styles.nameGlitch,
              'name-glow': styles.nameGlow,
              'name-gradient': styles.nameGradient,
              'name-shimmer': styles.nameShimmer,
              'name-typewriter': styles.nameTypewriter,
              'name-wave': styles.nameWave,
          }[style]
        : undefined;

// ---------- banners ----------
export const bannerStyle = (banner?: string): CSSProperties | undefined =>
    banner
        ? ({
              'banner-aurora': {
                  background: 'linear-gradient(120deg,#0b3d3a,#1f7a5c,#5b3fa8,#0b3d3a)',
                  backgroundSize: '300% 300%',
              },
              'banner-lemons': {
                  background:
                      'radial-gradient(circle at 20% 30%,#f4d03f 0 10px,transparent 11px),radial-gradient(circle at 70% 60%,#f4d03f 0 8px,transparent 9px),#2c4a1e',
                  backgroundSize: '80px 80px',
              },
              'banner-neon-grid': {
                  background:
                      'linear-gradient(transparent 95%,#ff5c8a 96%),linear-gradient(90deg,transparent 95%,#7aa2ff 96%),#120428',
                  backgroundSize: '28px 28px',
              },
              'banner-spooky': {
                  background: 'linear-gradient(180deg,#120a1f,#3b1f4a 70%,#ff7a18)',
              },
              'banner-stars': {
                  background:
                      'radial-gradient(1px 1px at 20% 30%,#fff,transparent),radial-gradient(1px 1px at 60% 70%,#fff,transparent),radial-gradient(2px 2px at 80% 20%,#fff,transparent),#050816',
                  backgroundSize: '120px 120px',
              },
              'banner-sunset': {
                  background: 'linear-gradient(180deg,#ff7a59,#d58cff 60%,#2c1a4a)',
              },
          }[banner] ?? undefined)
        : undefined;
export const bannerClass = (banner?: string) => (banner ? styles.bannerMoving : undefined);

// ---------- profile entrance (plays once when someone opens the profile) ----------
const FX: Record<string, string[]> = {
    'fx-bats': ['🦇', '🦇', '🎃'],
    'fx-confetti': [],
    'fx-leaves': ['🍂', '🍁', '🍃'],
    'fx-notes': ['🎵', '🎶', '🎼'],
    'fx-snow': ['❄️', '❅', '❆'],
};
export const ProfileEntrance = ({ effect }: { effect?: string }) => {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const c = ref.current;
        if (!effect || !c || !(effect in FX)) return undefined;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
        const ctx = c.getContext('2d');
        if (!ctx) return undefined;
        const r = c.getBoundingClientRect();
        c.width = r.width;
        c.height = r.height;
        const glyphs = FX[effect];
        const bits = Array.from({ length: 50 }, () => ({
            g: glyphs[Math.floor(Math.random() * glyphs.length)],
            h: Math.random() * 360,
            r: Math.random() * 6,
            vx: (Math.random() - 0.5) * 1.5,
            vy: 1 + Math.random() * 2.5,
            x: Math.random() * c.width,
            y: -20 - Math.random() * c.height * 0.6,
        }));
        let frame = 0;
        const start = performance.now();
        const draw = (now: number) => {
            ctx.clearRect(0, 0, c.width, c.height);
            const fade = Math.max(0, 1 - (now - start) / 4500);
            ctx.globalAlpha = fade;
            for (const b of bits) {
                b.x += b.vx;
                b.y += b.vy;
                b.r += 0.05;
                if (b.g) {
                    ctx.font = '18px "Sour Emoji", sans-serif';
                    ctx.fillText(b.g, b.x, b.y);
                } else {
                    ctx.save();
                    ctx.translate(b.x, b.y);
                    ctx.rotate(b.r);
                    ctx.fillStyle = `hsl(${b.h} 85% 60%)`;
                    ctx.fillRect(-4, -2, 8, 4);
                    ctx.restore();
                }
            }
            if (fade > 0) frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(frame);
    }, [effect]);
    if (!effect) return null;
    return <canvas aria-hidden className={styles.entrance} ref={ref} />;
};

// ---------- chat bubbles ----------
export const bubbleClass = (bubble?: string) =>
    bubble
        ? {
              'bubble-lemon': styles.bubbleLemon,
              'bubble-neon': styles.bubbleNeon,
              'bubble-pixel': styles.bubblePixel,
          }[bubble]
        : undefined;

const SIDEBAR_ICON: Record<string, string> = {
    'sidebar-glass': '🪟',
    'sidebar-neon': '🌃',
    'sidebar-pixel': '👾',
    'sidebar-wood': '🪵',
};

// a small preview of any item (shop cards, inventory)
export const ItemPreview = ({ id, name, slot }: { id: string; name: string; slot: string }) => {
    const avatar = (extra?: string, deco?: string) => (
        <span className={clsx(styles.previewAvatar, extra)}>
            🍋
            {deco && <ShopDecoration kind={deco} size={46} />}
        </span>
    );
    if (slot === 'decoration') return avatar(undefined, id);
    if (slot === 'frame') return avatar(frameClass(id));
    if (slot === 'nameStyle')
        return <span className={clsx(styles.previewName, nameClass(id))}>{name}</span>;
    if (slot === 'banner')
        return (
            <span className={clsx(styles.previewBanner, bannerClass(id))} style={bannerStyle(id)} />
        );
    if (slot === 'sidebar')
        return <span className={styles.previewFx}>{SIDEBAR_ICON[id] ?? '📚'}</span>;
    if (slot === 'bubble')
        return <span className={clsx(styles.previewBubble, bubbleClass(id))}>hey!</span>;
    return <span className={styles.previewFx}>{FX[id]?.[0] ?? '🎉'}</span>;
};
