import { useEffect, useRef } from 'react';

import { type SourLook } from '/@/renderer/features/sour/store/sour.store';

export const SCENES: { id: SourLook['stageScene']; label: string }[] = [
    { id: 'none', label: 'No scene' },
    { id: 'rain', label: 'Rain on the window' },
    { id: 'stars', label: 'Night sky' },
    { id: 'drive', label: 'Night drive' },
    { id: 'snow', label: 'Snowfall' },
    { id: 'concert', label: 'Concert' },
];

interface Dot {
    l: number;
    s: number;
    x: number;
    y: number;
    z: number;
}

// Slow animated backdrops for the Sour Stage
export const Scene = ({
    className,
    scene,
}: {
    className?: string;
    scene: SourLook['stageScene'];
}) => {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = ref.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || scene === 'none') return undefined;
        let W = 0;
        let H = 0;
        const fit = () => {
            const r = canvas.getBoundingClientRect();
            W = canvas.width = Math.max(1, Math.round(r.width));
            H = canvas.height = Math.max(1, Math.round(r.height));
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(canvas);
        const count =
            scene === 'rain' ? 220 : scene === 'stars' ? 180 : scene === 'snow' ? 140 : 60;
        const dots: Dot[] = Array.from({ length: count }, () => ({
            l: Math.random(),
            s: Math.random(),
            x: Math.random(),
            y: Math.random(),
            z: Math.random(),
        }));
        let shooting: null | { t: number; x: number; y: number } = null;
        let frame = 0;
        const draw = (now: number) => {
            frame = requestAnimationFrame(draw);
            if (document.hidden) return;
            ctx.clearRect(0, 0, W, H);
            if (scene === 'rain') {
                ctx.strokeStyle = 'rgb(200 220 255 / 35%)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (const d of dots) {
                    d.y += 0.012 + d.z * 0.02;
                    if (d.y > 1.05) {
                        d.y = -0.05;
                        d.x = Math.random();
                    }
                    const x = d.x * W;
                    const y = d.y * H;
                    const len = 10 + d.z * 18;
                    ctx.moveTo(x, y);
                    ctx.lineTo(x - len * 0.15, y + len);
                }
                ctx.stroke();
                // drops sliding down the glass
                for (const d of dots.slice(0, 18)) {
                    const y = ((now / (9000 + d.s * 9000) + d.l) % 1) * H;
                    ctx.fillStyle = 'rgb(220 235 255 / 25%)';
                    ctx.beginPath();
                    ctx.ellipse(d.x * W, y, 2 + d.z * 2, 3 + d.z * 3, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (scene === 'stars') {
                for (const d of dots) {
                    const twinkle =
                        0.4 + 0.6 * Math.abs(Math.sin(now / (900 + d.s * 2000) + d.l * 10));
                    ctx.fillStyle = `rgb(255 255 255 / ${twinkle * (0.3 + d.z * 0.6)})`;
                    ctx.fillRect(d.x * W, d.y * H * 0.85, 1 + d.z * 1.6, 1 + d.z * 1.6);
                }
                if (!shooting && Math.random() < 0.003)
                    shooting = { t: now, x: Math.random() * W * 0.7, y: Math.random() * H * 0.4 };
                if (shooting) {
                    const p = (now - shooting.t) / 900;
                    if (p > 1) shooting = null;
                    else {
                        const x = shooting.x + p * 260;
                        const y = shooting.y + p * 120;
                        const g = ctx.createLinearGradient(x - 80, y - 37, x, y);
                        g.addColorStop(0, 'transparent');
                        g.addColorStop(1, `rgb(255 255 255 / ${1 - p})`);
                        ctx.strokeStyle = g;
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(x - 80, y - 37);
                        ctx.lineTo(x, y);
                        ctx.stroke();
                    }
                }
            } else if (scene === 'snow') {
                ctx.fillStyle = 'rgb(255 255 255 / 70%)';
                for (const d of dots) {
                    d.y += 0.0008 + d.z * 0.0018;
                    d.x += Math.sin(now / 2000 + d.l * 6) * 0.0004;
                    if (d.y > 1.02) {
                        d.y = -0.02;
                        d.x = Math.random();
                    }
                    ctx.beginPath();
                    ctx.arc(d.x * W, d.y * H, 1 + d.z * 2.4, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (scene === 'drive') {
                // city lights on the horizon and road lines rushing past
                const horizon = H * 0.62;
                for (const d of dots) {
                    const hue = d.s > 0.5 ? 40 : 200;
                    ctx.fillStyle = `hsl(${hue} 90% 65% / ${0.25 + 0.4 * Math.abs(Math.sin(now / 1500 + d.l * 8))})`;
                    ctx.fillRect(d.x * W, horizon - 4 - d.z * H * 0.18, 2, 2);
                }
                ctx.strokeStyle = 'rgb(255 255 255 / 10%)';
                ctx.beginPath();
                ctx.moveTo(0, horizon);
                ctx.lineTo(W, horizon);
                ctx.stroke();
                const t = (now / 600) % 1;
                for (let i = 0; i < 10; i++) {
                    const p = (i / 10 + t) % 1;
                    const depth = p * p;
                    const y = horizon + depth * (H - horizon);
                    const w = 2 + depth * 14;
                    const h = 4 + depth * 40;
                    ctx.fillStyle = `rgb(255 214 120 / ${0.15 + depth * 0.5})`;
                    ctx.fillRect(W / 2 - w / 2, y, w, h);
                }
            } else if (scene === 'concert') {
                // concert mode: stage lights sweeping over a crowd with phone lights up
                ctx.globalCompositeOperation = 'lighter';
                for (let i = 0; i < 5; i++) {
                    const a = Math.sin(now / (1800 + i * 300) + i) * 0.5;
                    const x = ((i + 0.5) / 5) * W;
                    const g = ctx.createLinearGradient(x, 0, x + Math.sin(a) * H, H);
                    const hue = (i * 70 + now / 60) % 360;
                    g.addColorStop(0, `hsl(${hue} 90% 60% / 35%)`);
                    g.addColorStop(1, 'transparent');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.moveTo(x - 6, 0);
                    ctx.lineTo(x + 6, 0);
                    ctx.lineTo(x + Math.sin(a) * H + 90, H);
                    ctx.lineTo(x + Math.sin(a) * H - 90, H);
                    ctx.fill();
                }
                ctx.globalCompositeOperation = 'source-over';
                // the crowd: heads bobbing, a few phone lights
                ctx.fillStyle = 'rgb(0 0 0 / 85%)';
                for (const d of dots) {
                    const x = d.x * W;
                    const bob = Math.abs(Math.sin(now / 380 + d.l * 10)) * 6;
                    const y = H - 30 - d.z * 40 - bob;
                    ctx.beginPath();
                    ctx.arc(x, y, 12 + d.z * 8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillRect(x - 16 - d.z * 8, y + 8, 32 + d.z * 16, H - y);
                }
                for (const d of dots.slice(0, 12)) {
                    const sway = Math.sin(now / 900 + d.s * 6) * 14;
                    ctx.fillStyle = 'rgb(255 255 230 / 85%)';
                    ctx.fillRect(d.x * W + sway, H - 110 - d.z * 40, 4, 7);
                }
            }
        };
        frame = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [scene]);
    if (scene === 'none') return null;
    return <canvas aria-hidden className={className} ref={ref} />;
};
