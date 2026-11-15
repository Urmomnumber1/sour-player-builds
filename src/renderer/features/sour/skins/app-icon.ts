import isElectron from 'is-electron';

import citrusIcon from '../../../../../assets/citrus/256x256.png';
import appIcon from '../../../../../assets/icons/256x256.png';

import { isAndroidApp, sourMedia } from '/@/renderer/features/sour/mobile/android';
import { CITRUS } from '/@/shared/citrus';

interface IconPack {
    // Citrus: the background colour (and the drawing's, for Negative)
    bg?: string;
    fg?: string;
    filter: string;
    id: string;
    label: string;
}

// Icon packs: the Sour Player icon recoloured (and a holiday emoji in the corner during holidays),
// drawn here and handed to the window as its taskbar/dock icon.
const SOUR_PACKS: IconPack[] = [
    { filter: 'none', id: 'classic', label: 'Classic' },
    { filter: 'hue-rotate(60deg) saturate(1.2)', id: 'lime', label: 'Lime' },
    { filter: 'hue-rotate(-45deg) saturate(1.3)', id: 'grapefruit', label: 'Grapefruit' },
    { filter: 'hue-rotate(170deg)', id: 'blueberry', label: 'Blueberry' },
    { filter: 'hue-rotate(250deg) saturate(1.2)', id: 'grape', label: 'Grape' },
    { filter: 'sepia(1) saturate(3) brightness(1.05)', id: 'gold', label: 'Gold' },
    { filter: 'grayscale(1) contrast(1.2)', id: 'mono', label: 'Mono' },
    { filter: 'invert(1) hue-rotate(180deg)', id: 'negative', label: 'Negative' },
    { filter: 'none', id: 'pixel', label: 'Pixel' },
];

// Citrus Player's packs: its pink in other fruit colours (the white segment stays white). Same ids as Sour
// Player's, so the phone's launcher entries and the setting carry over.
const CITRUS_PACKS: IconPack[] = [
    { filter: 'none', id: 'classic', label: 'Classic' },
    { bg: '#6fa33b', filter: 'none', id: 'lime', label: 'Lime' },
    { bg: '#e8664f', filter: 'none', id: 'grapefruit', label: 'Grapefruit' },
    { bg: '#4a64c8', filter: 'none', id: 'blueberry', label: 'Blueberry' },
    { bg: '#8452c7', filter: 'none', id: 'grape', label: 'Grape' },
    { bg: '#d4a017', filter: 'none', id: 'gold', label: 'Gold' },
    { bg: '#6b6b6b', filter: 'none', id: 'mono', label: 'Mono' },
    { bg: '#1e1a1c', fg: '#e8a0b0', filter: 'none', id: 'negative', label: 'Negative' },
    { filter: 'none', id: 'pixel', label: 'Pixel' },
];

export const ICON_PACKS = CITRUS ? CITRUS_PACKS : SOUR_PACKS;

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

// Citrus: the pink background becomes the pack's colour, the white drawing stays (or takes the pack's)
const recolour = (ctx: CanvasRenderingContext2D, size: number, bg: string, fg?: string) => {
    const d = ctx.getImageData(0, 0, size, size);
    const at = (Math.floor(size * 0.12) * size + Math.floor(size * 0.12)) * 4;
    const base = d.data[at + 3] ? lum(d.data[at], d.data[at + 1], d.data[at + 2]) : 140;
    const b = hex(bg);
    const f = fg ? hex(fg) : [255, 255, 255];
    for (let i = 0; i < d.data.length; i += 4) {
        const w = Math.max(
            0,
            Math.min(1, (lum(d.data[i], d.data[i + 1], d.data[i + 2]) - base) / (255 - base)),
        );
        for (let k = 0; k < 3; k++) d.data[i + k] = Math.round(b[k] * (1 - w) + f[k] * w);
    }
    ctx.putImageData(d, 0, 0);
};

const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('icon'));
        img.src = src;
    });

export const drawAppIcon = async (pack: string, emoji: null | string, pixel = false) => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const img = await load(CITRUS ? citrusIcon : appIcon);
    const filter = ICON_PACKS.find((p) => p.id === pack)?.filter ?? 'none';
    // rounded corners, like the app's own icon (the holiday emoji may stick out)
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.225);
    ctx.clip();
    if (pixel) {
        // pixel pack: draw tiny, then scale up without smoothing
        const small = document.createElement('canvas');
        small.width = 32;
        small.height = 32;
        small.getContext('2d')?.drawImage(img, 0, 0, 32, 32);
        ctx.imageSmoothingEnabled = false;
        ctx.filter = filter;
        ctx.drawImage(small, 0, 0, size, size);
    } else {
        ctx.filter = filter;
        ctx.drawImage(img, 0, 0, size, size);
    }
    ctx.filter = 'none';
    const chosen = ICON_PACKS.find((p) => p.id === pack);
    if (CITRUS && chosen?.bg) recolour(ctx, size, chosen.bg, chosen.fg);
    ctx.restore();
    if (emoji) {
        await document.fonts.load('96px "Sour Emoji"', emoji).catch(() => []);
        ctx.font = '104px "Sour Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, size - 62, size - 58);
    }
    return canvas.toDataURL('image/png');
};

let lastSent = '';
export const applyAppIcon = async (pack: string, emoji: null | string) => {
    // Android: the app ships every pack as a home screen icon and switches to the chosen one
    // (holiday emoji only show on computers)
    if (isAndroidApp()) {
        if (pack === lastSent) return;
        lastSent = pack;
        await sourMedia('setIcon', { pack }).catch(() => undefined);
        return;
    }
    if (!isElectron()) return;
    const id = `${pack}:${emoji ?? ''}`;
    // sent once on every start too, so going back to Classic also puts the shortcuts back
    if (id === lastSent) return;
    const data = await drawAppIcon(pack, emoji, pack === 'pixel').catch(() => null);
    if (!data) return;
    lastSent = id;
    window.api?.ipc?.send('sour-icon', data);
};
