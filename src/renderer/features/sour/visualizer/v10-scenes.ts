import { BINS, type Levels } from '/@/renderer/features/sour/visualizer/levels';

// The v0.10 visualizers. Each draws one frame from the shared levels; state that lives between
// frames (falling lemons, ink drops, stars...) sits in V10State, made once per canvas.
export type V10Style =
    | 'aurora'
    | 'constellations'
    | 'grove'
    | 'ink'
    | 'neon'
    | 'portrait'
    | 'scope'
    | 'storm'
    | 'tunnel'
    | 'vinyl'
    | 'weather';

export const V10_STYLES: { id: V10Style; label: string }[] = [
    { id: 'grove', label: 'Lemon grove' },
    { id: 'neon', label: 'Neon city' },
    { id: 'ink', label: 'Ink' },
    { id: 'vinyl', label: 'Vinyl grooves' },
    { id: 'aurora', label: 'Aurora' },
    { id: 'portrait', label: 'Particle portrait' },
    { id: 'tunnel', label: 'Spectrum tunnel' },
    { id: 'storm', label: 'Lyric storm' },
    { id: 'scope', label: 'Oscilloscope' },
    { id: 'weather', label: 'Your sky' },
    { id: 'constellations', label: 'Constellations' },
];

export const isV10 = (s: string): s is V10Style => V10_STYLES.some((v) => v.id === s);

export interface V10State {
    bits: Bit[];
    city: number[];
    dots: { c: string; x: number; y: number }[];
    dotsFor: string;
    stars: { x: number; y: number; z: number }[];
    t: number;
}

interface Bit {
    a: number;
    l: number;
    s: number;
    t?: string;
    vx: number;
    vy: number;
    x: number;
    y: number;
}

export const makeV10 = (): V10State => ({
    bits: [],
    city: Array.from({ length: 40 }, () => 0.2 + Math.random() * 0.8),
    dots: [],
    dotsFor: '',
    stars: Array.from({ length: 140 }, () => ({
        x: Math.random(),
        y: Math.random(),
        z: Math.random(),
    })),
    t: 0,
});

const bass = (b: Float32Array) => (b[0] + b[1] + b[2] + b[3] + b[4] + b[5]) / 6;
const mid = (b: Float32Array) => {
    let s = 0;
    for (let i = 12; i < 30; i++) s += b[i];
    return s / 18;
};

// the cover, sampled into a grid of coloured dots (for the particle portrait)
const sampleCover = (st: V10State, cover: HTMLImageElement, src: string) => {
    if (st.dotsFor === src || !cover.complete || !cover.naturalWidth) return;
    const n = 48;
    const c = document.createElement('canvas');
    c.width = n;
    c.height = n;
    const g = c.getContext('2d');
    if (!g) return;
    try {
        g.drawImage(cover, 0, 0, n, n);
        const px = g.getImageData(0, 0, n, n).data;
        st.dots = [];
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const i = (y * n + x) * 4;
                st.dots.push({ c: `rgb(${px[i]},${px[i + 1]},${px[i + 2]})`, x: x / n, y: y / n });
            }
        }
        st.dotsFor = src;
    } catch {
        st.dotsFor = src; // a cover from another site we can't read: no portrait
    }
};

export const drawV10 = (
    look: V10Style,
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    levels: Levels,
    st: V10State,
    o: {
        cover: HTMLImageElement | null;
        coverSrc: string;
        dpr: number;
        dt: number;
        now: number;
        palette: string[];
        playing: boolean;
        words: string[];
    },
) => {
    const { bins, kick } = levels;
    const { dpr, dt, now, palette } = o;
    const low = bass(bins);
    if (o.playing) st.t += dt * (0.6 + levels.energy);
    const m = Math.min(W, H);

    if (look === 'grove') {
        // lemon trees sway with the bass; lemons drop on the beat
        ctx.fillStyle = '#16301a';
        ctx.fillRect(0, H * 0.82, W, H * 0.18);
        const trees = 5;
        for (let i = 0; i < trees; i++) {
            const x = ((i + 0.5) / trees) * W;
            const sway = Math.sin(now / 900 + i) * (4 + low * 22) * dpr;
            ctx.strokeStyle = '#6b4a2b';
            ctx.lineWidth = m * 0.03;
            ctx.beginPath();
            ctx.moveTo(x, H * 0.84);
            ctx.quadraticCurveTo(x, H * 0.6, x + sway, H * 0.5);
            ctx.stroke();
            ctx.fillStyle = `hsl(${110 + bins[i * 8] * 30}, 45%, ${26 + bins[i * 8] * 20}%)`;
            ctx.beginPath();
            ctx.arc(x + sway, H * 0.42, m * (0.12 + bins[i * 8] * 0.04), 0, Math.PI * 2);
            ctx.fill();
            if (levels.beat && Math.random() < 0.6) {
                st.bits.push({ a: 0, l: 1, s: m * 0.025, vx: 0, vy: 0, x: x + sway, y: H * 0.42 });
            }
        }
        st.bits = st.bits.filter((b) => b.l > 0).slice(-80);
        for (const b of st.bits) {
            b.vy += 0.35 * dt * dpr;
            b.y = Math.min(H * 0.84, b.y + b.vy);
            if (b.y >= H * 0.84) b.l -= 0.01 * dt;
            ctx.globalAlpha = Math.max(0, b.l);
            ctx.fillStyle = '#f4d03f';
            ctx.beginPath();
            ctx.ellipse(b.x, b.y, b.s, b.s * 0.75, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    } else if (look === 'neon') {
        // a skyline whose windows light up with the frequencies, a sun pulsing with the kick
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#120428');
        g.addColorStop(1, '#3a0b4a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = `rgba(255, 92, 138, ${0.6 + kick * 0.4})`;
        ctx.beginPath();
        ctx.arc(W / 2, H * 0.62, m * (0.22 + kick * 0.04), Math.PI, 0);
        ctx.fill();
        const n = st.city.length;
        const bw = W / n;
        for (let i = 0; i < n; i++) {
            const v = bins[Math.floor((i / n) * BINS)];
            const h = (st.city[i] * 0.45 + v * 0.25) * H;
            ctx.fillStyle = '#0b0218';
            ctx.fillRect(i * bw, H - h, bw - dpr, h);
            ctx.fillStyle = `hsla(${180 + v * 120}, 90%, 60%, ${0.2 + v * 0.8})`;
            for (let y = H - h + 4 * dpr; y < H - 4 * dpr; y += 8 * dpr) {
                if ((i * 31 + Math.floor(y)) % 3)
                    ctx.fillRect(i * bw + 2 * dpr, y, bw - 5 * dpr, 3 * dpr);
            }
        }
    } else if (look === 'ink') {
        // drops of ink bloom on the beat and slowly spread in water
        ctx.fillStyle = 'rgba(245, 240, 230, 0.06)';
        ctx.fillRect(0, 0, W, H);
        if (levels.beat || (o.playing && Math.random() < levels.energy * 0.08)) {
            st.bits.push({
                a: Math.random() * palette.length,
                l: 1,
                s: m * (0.04 + kick * 0.08),
                vx: 0,
                vy: 0,
                x: Math.random() * W,
                y: Math.random() * H,
            });
        }
        st.bits = st.bits.filter((b) => (b.l -= 0.004 * dt) > 0).slice(-40);
        for (const b of st.bits) {
            b.s += 0.6 * dt * dpr;
            ctx.globalAlpha = b.l * 0.35;
            ctx.fillStyle = palette[Math.floor(b.a) % palette.length];
            ctx.beginPath();
            for (let k = 0; k <= 24; k++) {
                const a = (k / 24) * Math.PI * 2;
                const r = b.s * (1 + Math.sin(a * 5 + b.a + now / 1500) * 0.12);
                const x = b.x + Math.cos(a) * r;
                const y = b.y + Math.sin(a) * r;
                if (k) ctx.lineTo(x, y);
                else ctx.moveTo(x, y);
            }
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    } else if (look === 'vinyl') {
        // a record spinning, its grooves shaking with the music, the cover as the label
        const cx = W / 2;
        const cy = H / 2;
        const R = m * 0.44;
        ctx.fillStyle = '#0d0d0d';
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();
        for (let r = R * 0.4; r < R; r += 3 * dpr) {
            const v = bins[Math.floor(((r - R * 0.4) / (R * 0.6)) * (BINS - 1))];
            ctx.strokeStyle = `rgba(255,255,255,${0.04 + v * 0.18})`;
            ctx.lineWidth = dpr;
            ctx.beginPath();
            ctx.arc(cx, cy, r + v * 2 * dpr, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(st.t / 20);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.36, 0, Math.PI * 2);
        ctx.clip();
        if (o.cover?.complete && o.cover.naturalWidth) {
            ctx.drawImage(o.cover, -R * 0.36, -R * 0.36, R * 0.72, R * 0.72);
        } else {
            ctx.fillStyle = '#f4d03f';
            ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, -0.9 + st.t / 60, -0.6 + st.t / 60);
        ctx.fill();
    } else if (look === 'aurora') {
        // curtains of light rippling across a night sky
        ctx.fillStyle = '#030914';
        ctx.fillRect(0, 0, W, H);
        for (const s of st.stars.slice(0, 60)) {
            ctx.fillStyle = `rgba(255,255,255,${0.2 + s.z * 0.5})`;
            ctx.fillRect(s.x * W, s.y * H * 0.6, dpr, dpr);
        }
        ctx.globalCompositeOperation = 'lighter';
        for (let j = 0; j < 3; j++) {
            const hue = [140, 170, 280][j];
            for (let x = 0; x < W; x += 3 * dpr) {
                const i = Math.floor((x / W) * (BINS - 1));
                const top =
                    H * (0.25 + j * 0.08) +
                    Math.sin(x / (W * 0.15) + now / (1800 + j * 400) + j) * H * 0.08;
                const h = H * (0.15 + bins[i] * 0.45 + low * 0.1);
                const g = ctx.createLinearGradient(0, top, 0, top + h);
                g.addColorStop(0, 'transparent');
                g.addColorStop(0.3, `hsla(${hue}, 90%, 60%, ${0.06 + bins[i] * 0.12})`);
                g.addColorStop(1, 'transparent');
                ctx.fillStyle = g;
                ctx.fillRect(x, top, 3 * dpr, h);
            }
        }
        ctx.globalCompositeOperation = 'source-over';
    } else if (look === 'portrait') {
        // the album cover made of dots that scatter with the beat and drift back home
        if (o.cover) sampleCover(st, o.cover, o.coverSrc);
        const size = m * 0.8;
        const ox = (W - size) / 2;
        const oy = (H - size) / 2;
        const n = Math.sqrt(st.dots.length) || 1;
        const r = (size / n) * 0.42;
        st.dots.forEach((d, i) => {
            const v = bins[i % BINS];
            const push = kick * 18 * dpr * (0.5 + v);
            const a = i * 2.39996;
            ctx.fillStyle = d.c;
            ctx.beginPath();
            ctx.arc(
                ox + d.x * size + Math.cos(a) * push,
                oy + d.y * size + Math.sin(a) * push,
                r * (0.7 + v * 0.6),
                0,
                Math.PI * 2,
            );
            ctx.fill();
        });
        if (!st.dots.length) {
            ctx.fillStyle = '#f4d03f';
            ctx.beginPath();
            ctx.arc(W / 2, H / 2, m * 0.2 * (1 + kick * 0.2), 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (look === 'tunnel') {
        // rings of the spectrum rushing towards you
        const cx = W / 2;
        const cy = H / 2;
        const rings = 18;
        for (let k = rings; k > 0; k--) {
            const z = (k - ((st.t / 30) % 1)) / rings;
            const R = (m * 0.06) / Math.max(0.05, z);
            ctx.strokeStyle = `hsla(${(k * 20 + now / 30) % 360}, 85%, 60%, ${1 - z})`;
            ctx.lineWidth = Math.max(1, 3 * dpr * (1 - z));
            ctx.beginPath();
            for (let i = 0; i <= BINS; i++) {
                const a = (i / BINS) * Math.PI * 2;
                const rr = R * (1 + bins[i % BINS] * 0.25);
                const x = cx + Math.cos(a) * rr;
                const y = cy + Math.sin(a) * rr;
                if (i) ctx.lineTo(x, y);
                else ctx.moveTo(x, y);
            }
            ctx.stroke();
        }
    } else if (look === 'storm') {
        // the song's words blown around the screen, bigger on the beat
        const words = o.words.length ? o.words : ['sour'];
        if (levels.beat || (o.playing && Math.random() < 0.05)) {
            st.bits.push({
                a: (Math.random() - 0.5) * 0.6,
                l: 1,
                s: m * (0.05 + kick * 0.08),
                t: words[Math.floor(Math.random() * words.length)],
                vx: (Math.random() - 0.3) * 3 * dpr,
                vy: (Math.random() - 0.5) * 1.5 * dpr,
                x: Math.random() * W * 0.6,
                y: Math.random() * H,
            });
        }
        st.bits = st.bits.filter((b) => (b.l -= 0.006 * dt) > 0).slice(-40);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const b of st.bits) {
            b.x += b.vx * dt * (1 + low * 2);
            b.y += b.vy * dt;
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.a);
            ctx.globalAlpha = b.l;
            ctx.fillStyle = palette[(b.t?.length ?? 0) % palette.length];
            ctx.font = `800 ${Math.round(b.s)}px sans-serif`;
            ctx.fillText(b.t ?? '', 0, 0);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    } else if (look === 'scope') {
        // an old green oscilloscope trace with afterglow
        ctx.fillStyle = 'rgba(0, 12, 4, 0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(80, 255, 140, 0.15)';
        ctx.lineWidth = dpr;
        for (let x = 0; x < W; x += W / 10) ctx.strokeRect(x, 0, W / 10, H);
        ctx.strokeStyle = '#5dff9a';
        ctx.shadowColor = '#5dff9a';
        ctx.shadowBlur = 8 * dpr;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 2 * dpr) {
            const p = x / W;
            let y = 0;
            for (let k = 0; k < 6; k++)
                y += Math.sin(p * Math.PI * (2 + k * 3) + now / (200 + k * 90)) * bins[k * 7];
            y = H / 2 + (y / 3) * H * 0.4;
            if (x) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
    } else if (look === 'weather') {
        // the sky outside right now (by the time of day), with rain that falls harder when it's loud
        const hr = new Date().getHours() + new Date().getMinutes() / 60;
        const day = hr > 6.5 && hr < 19.5;
        const dusk = (hr > 17.5 && hr < 20) || (hr > 5.5 && hr < 7.5);
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, day ? (dusk ? '#f28c5b' : '#5b9ae8') : '#070b1f');
        g.addColorStop(1, day ? (dusk ? '#4a2a5e' : '#bfe0ff') : '#1a1f3d');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        const sx = W * (0.15 + (((hr + 18) % 24) / 24) * 0.7);
        ctx.fillStyle = day ? '#ffe27a' : '#e8eefc';
        ctx.beginPath();
        ctx.arc(sx, H * 0.25, m * (0.08 + kick * 0.02), 0, Math.PI * 2);
        ctx.fill();
        const drops = Math.floor(levels.energy * 18);
        for (let i = 0; i < drops; i++) {
            st.bits.push({
                a: 0,
                l: 1,
                s: 0,
                vx: -1 * dpr,
                vy: (8 + Math.random() * 6) * dpr,
                x: Math.random() * W * 1.1,
                y: -10,
            });
        }
        st.bits = st.bits.filter((b) => b.y < H).slice(-500);
        ctx.strokeStyle = 'rgba(200, 220, 255, 0.5)';
        ctx.lineWidth = dpr;
        ctx.beginPath();
        for (const b of st.bits) {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x + b.vx * 2, b.y + b.vy * 1.5);
        }
        ctx.stroke();
    } else if (look === 'constellations') {
        // stars that brighten with their frequency, joined into shapes while the music is loud
        ctx.fillStyle = '#050816';
        ctx.fillRect(0, 0, W, H);
        const pts = st.stars.map((s, i) => {
            const v = bins[i % BINS];
            return {
                v,
                x: s.x * W + Math.sin(now / 4000 + i) * 6 * dpr,
                y: s.y * H + Math.cos(now / 5000 + i) * 6 * dpr,
            };
        });
        const reach = m * (0.08 + mid(bins) * 0.18);
        ctx.lineWidth = dpr;
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const dx = pts[i].x - pts[j].x;
                const dy = pts[i].y - pts[j].y;
                const d = Math.hypot(dx, dy);
                if (d < reach) {
                    ctx.strokeStyle = `rgba(160, 190, 255, ${(1 - d / reach) * (pts[i].v + pts[j].v) * 0.4})`;
                    ctx.beginPath();
                    ctx.moveTo(pts[i].x, pts[i].y);
                    ctx.lineTo(pts[j].x, pts[j].y);
                    ctx.stroke();
                }
            }
        }
        for (const p of pts) {
            ctx.fillStyle = `rgba(255,255,255,${0.3 + p.v * 0.7})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, (1 + p.v * 2.5) * dpr, 0, Math.PI * 2);
            ctx.fill();
        }
    }
};
