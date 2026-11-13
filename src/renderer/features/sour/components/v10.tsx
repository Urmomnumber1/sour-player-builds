import { useEffect, useId } from 'react';

import styles from './v10.module.css';

import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { ShopDecoration } from '/@/renderer/features/sour/components/shop-looks';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { useFastAverageColor } from '/@/renderer/hooks';
import { usePlayerSong } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem } from '/@/shared/types/domain-types';

// ---------- the v0.10 look: the whole app takes on the colour of the song that's playing ----------
export const LiquidTint = () => {
    const ui = useSourStore((s) => s.look.ui ?? 'bubble');
    const tinted = ui === 'liquid' || ui === 'bubble';
    const song = usePlayerSong();
    const cover = useItemImageUrl({
        id: song?.imageId || undefined,
        itemType: LibraryItem.SONG,
        type: 'table',
    });
    const { background } = useFastAverageColor({
        algorithm: 'dominant',
        src: tinted ? cover || null : null,
        srcLoaded: true,
    });
    useEffect(() => {
        const root = document.documentElement;
        if (!tinted || !background) {
            root.style.removeProperty('--liquid-tint');
            return;
        }
        root.style.setProperty('--liquid-tint', background);
    }, [background, tinted]);
    return null;
};

// ---------- 0.13: everyone on v2, v0.10 or a 0.12 layout moves to Bubble once (Classic stays) ----------
export const TenthUpdate = () => {
    useEffect(() => {
        const { celebrated = [], look, set } = useSourStore.getState();
        if (celebrated.includes('0.13')) return;
        const ui = look.ui as string;
        const move = ui !== 'classic' && ui !== 'bubble';
        set({
            celebrated: [...new Set(['0.10', '0.13', ...celebrated])],
            ...(move ? { look: { ...look, ui: 'bubble' as const } } : {}),
        });
        if (move && celebrated.length)
            toast.info({
                autoClose: 9000,
                message:
                    'Sour Player 0.13 has a new look, Bubble. The older looks are in Sour Studio > Layout.',
            });
    }, []);
    return null;
};

// ---------- avatar decorations: the party hat (accounts from before 0.10) ----------
export const AvatarDecoration = ({ kind, size }: { kind?: null | string; size: number }) => {
    const gid = `hat-${useId().replace(/:/g, '')}`;
    if (kind !== 'party-hat') return <ShopDecoration kind={kind} size={size} />;
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
                <linearGradient id={gid} x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0" stopColor="#ff5c8a" />
                    <stop offset="1" stopColor="#d58cff" />
                </linearGradient>
            </defs>
            <g transform="rotate(18 20 26)">
                <path d="M20 4 L34 40 Q20 45 6 40 Z" fill={`url(#${gid})`} />
                <path d="M13 22 L27 22" stroke="#f4d03f" strokeWidth="3" />
                <path d="M10 31 L30 31" stroke="#9be15d" strokeWidth="3" />
                <ellipse cx="20" cy="40.5" fill="#f4d03f" rx="15" ry="3.2" />
                <circle cx="20" cy="4" fill="#f4d03f" r="4" />
            </g>
        </svg>
    );
};
