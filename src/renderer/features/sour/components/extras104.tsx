import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useEffect, useRef, useState } from 'react';

import styles from './extras104.module.css';

import { useItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { groupApi } from '/@/renderer/features/group-play/api/group-play-api';
import {
    type GroupState,
    useGroupPlayStore,
} from '/@/renderer/features/group-play/store/group-play.store';
import { openRequestWindow } from '/@/renderer/features/hermes-request/components/request-button';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { useCustom } from '/@/renderer/features/sour/components/customize';
import { Card } from '/@/renderer/features/sour/components/hub-panels';
import { useMyProfile, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { usePlayerSong, usePlayerStatus } from '/@/renderer/store';
import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem } from '/@/shared/types/domain-types';
import { PlayerStatus } from '/@/shared/types/types';

// Sour Player 0.10.4: desktop extras (start with the computer, taskbar buttons, Ctrl+Alt+R requests,
// low-power mode), the admins' announcement, the admin card, sidebar skins, karaoke sign-up, Stage
// credits, share cards, duets and recording your karaoke.

const ipc = () => (isElectron() ? window.api?.ipc : undefined);

export const DesktopBits = () => {
    const c = useCustom();
    const status = usePlayerStatus();
    const sidebarSkin = useMyProfile().data?.looks?.sidebar;
    useEffect(() => {
        ipc()?.send('sour-autostart', !!c.autostart);
    }, [c.autostart]);
    useEffect(() => {
        ipc()?.send('sour-quick-request', c.quickRequest !== false);
    }, [c.quickRequest]);
    useEffect(() => {
        ipc()?.send('sour-thumbar', status === PlayerStatus.PLAYING);
    }, [status]);
    useEffect(() => {
        const api = ipc();
        if (!api?.on) return undefined;
        const onClick = (_e: unknown, what: string) => {
            const p = usePlayerStoreBase.getState();
            if (what === 'prev') p.mediaPrevious(false);
            else if (what === 'next') p.mediaNext(false);
            else p.mediaTogglePlayPause();
        };
        const onRequest = () => openRequestWindow();
        api.on('sour-thumbar-click', onClick);
        api.on('sour-quick-request-open', onRequest);
        return () => {
            api.removeListener?.('sour-thumbar-click', onClick);
            api.removeListener?.('sour-quick-request-open', onRequest);
        };
    }, []);
    // low-power mode: no animations or visualizers (by hand, or on its own when the laptop is on battery)
    useEffect(() => {
        const root = document.documentElement;
        let battery: null | {
            addEventListener: (t: string, f: () => void) => void;
            charging: boolean;
            removeEventListener: (t: string, f: () => void) => void;
        } = null;
        const apply = () =>
            root.classList.toggle(
                'sour-lowpower',
                c.lowPower === 'on' || (c.lowPower === 'battery' && !!battery && !battery.charging),
            );
        apply();
        const nav = navigator as { getBattery?: () => Promise<typeof battery> };
        nav.getBattery?.().then((b) => {
            battery = b;
            apply();
            b?.addEventListener('chargingchange', apply);
        });
        return () => battery?.removeEventListener('chargingchange', apply);
    }, [c.lowPower]);
    // accessibility: high contrast and text size
    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('sour-contrast', !!c.highContrast);
        root.style.setProperty('--sour-text-scale', String(c.textScale || 1));
        root.style.fontSize = c.textScale && c.textScale !== 1 ? `${c.textScale * 100}%` : '';
    }, [c.highContrast, c.textScale]);
    // a sidebar skin from the shop
    useEffect(() => {
        if (sidebarSkin) document.documentElement.dataset.sidebarSkin = sidebarSkin;
        else delete document.documentElement.dataset.sidebarSkin;
    }, [sidebarSkin]);
    return null;
};

// ---------- the admins' announcement, once per change ----------
export const Announcement = () => {
    const url = useHermesUrl();
    const seen = useSourStore((s) => s.announcementSeen ?? 0);
    const data = useQuery({
        enabled: !!url,
        queryFn: async () =>
            (await (await fetch(`${url}/api/announcement`)).json()) as { at: number; text: string },
        queryKey: ['hermes-announcement', url],
        refetchInterval: 10 * 60000,
    }).data;
    if (!data?.text || data.at <= seen) return null;
    return (
        <div className={styles.announce}>
            <span>📣 {data.text}</span>
            <button
                onClick={() => useSourStore.getState().set({ announcementSeen: data.at })}
                type="button"
            >
                Got it
            </button>
        </div>
    );
};

// ---------- Sour Library > Tools: the admin card ----------
export const AdminCard = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const mine = useMyProfile().data;
    const file = useRef<HTMLInputElement>(null);
    const auth = me ? { key: me.key, profile: me.id } : null;
    const overview = useQuery({
        enabled: !!url && !!auth && !!mine?.admin,
        queryFn: async () => {
            const res = await fetch(`${url}/api/admin/overview`, {
                body: JSON.stringify(auth),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            });
            if (!res.ok) throw new Error('admins only');
            return (await res.json()) as {
                aiKaraoke: string;
                failedToday: number;
                groups: number;
                library: number;
                online: { listening: null | string; name: string }[];
                people: number;
                queue: number;
                workers: {
                    current: null | string;
                    label: string;
                    lastError: null | string;
                    state: string;
                }[];
            };
        },
        queryKey: ['hermes-admin', url],
        refetchInterval: 30000,
    }).data;
    if (!mine?.admin) return null;
    const backup = async () => {
        const res = await fetch(`${url}/api/admin/backup`, {
            body: JSON.stringify(auth),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        if (!res.ok) return toast.error({ message: 'Admins only' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(await res.blob());
        a.download = `hermes-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        return undefined;
    };
    return (
        <Card icon="🛡️" title="Admin">
            <Stack gap={6}>
                {overview && (
                    <>
                        <Text size="sm">
                            {overview.online.length} of {overview.people} people online -{' '}
                            {overview.library} songs - {overview.queue} requests waiting
                            {overview.failedToday ? `, ${overview.failedToday} failed today` : ''} -
                            AI karaoke: {overview.aiKaraoke}
                        </Text>
                        {overview.workers.map((w) => (
                            <Text isMuted key={w.label} size="xs">
                                {w.label}: {w.state}
                                {w.current ? ` - ${w.current}` : ''}
                                {w.lastError ? ` (last error: ${w.lastError})` : ''}
                            </Text>
                        ))}
                        {overview.online.map((o) => (
                            <Text isMuted key={o.name} size="xs">
                                {o.name}
                                {o.listening ? `: ${o.listening}` : ''}
                            </Text>
                        ))}
                    </>
                )}
                <Group gap="xs">
                    <Button onClick={backup} size="xs" variant="default">
                        Download a backup
                    </Button>
                    <Button onClick={() => file.current?.click()} size="xs" variant="subtle">
                        Restore a backup
                    </Button>
                    <Button
                        onClick={() =>
                            navigator.clipboard
                                .writeText(`${url}/invite`)
                                .then(() => toast.success({ message: 'Invite link copied' }))
                        }
                        size="xs"
                        variant="subtle"
                    >
                        Copy invite link
                    </Button>
                    <Button
                        onClick={() =>
                            me &&
                            navigator.clipboard.writeText(`${url}/overlay/${me.id}`).then(() =>
                                toast.success({
                                    message:
                                        'Overlay link copied - add it in OBS as a Browser source',
                                }),
                            )
                        }
                        size="xs"
                        variant="subtle"
                    >
                        Copy my OBS overlay
                    </Button>
                </Group>
                <input
                    accept="application/json"
                    hidden
                    onChange={async (e) => {
                        const f = e.currentTarget.files?.[0];
                        if (
                            !f ||
                            !window.confirm(
                                'Put this backup back? Hermes Music restarts and everything goes back to how it was then.',
                            )
                        )
                            return;
                        const backupData = JSON.parse(await f.text());
                        const res = await fetch(`${url}/api/admin/restore`, {
                            body: JSON.stringify({ ...auth, backup: backupData }),
                            headers: { 'content-type': 'application/json' },
                            method: 'POST',
                        });
                        const json = await res.json().catch(() => ({}));
                        if (res.ok)
                            toast.success({
                                message: `Restored ${json.restored} files - Hermes Music is restarting`,
                            });
                        else toast.error({ message: json.error || "Couldn't restore" });
                    }}
                    ref={file}
                    type="file"
                />
            </Stack>
        </Card>
    );
};

// ---------- Group Play: karaoke sign-up ----------
export const KaraokeSignup = ({ state }: { state: GroupState & { singers?: string[] } }) => {
    const url = useHermesUrl();
    const { code, hostKey, member, role } = useGroupPlayStore();
    const singers = state.singers ?? [];
    const who = role === 'host' ? { hostKey } : { member };
    const send = (body: Record<string, unknown>) =>
        code &&
        fetch(`${url}/api/group/${code}/sing`, {
            body: JSON.stringify({ ...who, ...body }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        }).catch(() => {});
    void groupApi;
    return (
        <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap">
                <Text fw={700} size="sm">
                    🎤 Karaoke queue
                </Text>
                <Group gap={4}>
                    <Button onClick={() => send({})} size="compact-xs" variant="light">
                        Sign up / drop out
                    </Button>
                    {role === 'host' && !!singers.length && (
                        <Button
                            onClick={() => send({ next: true })}
                            size="compact-xs"
                            variant="subtle"
                        >
                            Next singer
                        </Button>
                    )}
                </Group>
            </Group>
            {singers.length ? (
                <Text size="sm">
                    Now: <b>{singers[0]}</b>
                    {singers.length > 1 ? ` - then ${singers.slice(1).join(', ')}` : ''}
                </Text>
            ) : (
                <Text isMuted size="xs">
                    Nobody signed up yet.
                </Text>
            )}
        </Stack>
    );
};

// ---------- Stage: credits roll in the last seconds of a song ----------
export const StageCredits = () => {
    const song = usePlayerSong();
    const ts = useTimestampStoreBase((s) => s.timestamp);
    const show = useSourStore((s) => s.look.custom10?.credits !== false);
    const left = (song?.duration || 0) / 1000 - ts;
    if (!song || !show || left > 8 || left < 0.5) return null;
    return (
        <div className={styles.credits}>
            <div className={styles.creditsRoll}>
                <b>{song.name}</b>
                <span>{song.artistName}</span>
                <span>
                    {song.album}
                    {song.releaseYear ? ` (${song.releaseYear})` : ''}
                </span>
                {!!song.genres?.length && <span>{song.genres.map((g) => g.name).join(', ')}</span>}
            </div>
        </div>
    );
};

// ---------- Stage: a share card (cover, the line being sung, the song) as a picture ----------
export const ShareCardButton = () => {
    const song = usePlayerSong();
    const cover = useItemImageUrl({
        id: song?.imageId || undefined,
        itemType: LibraryItem.SONG,
        type: 'itemCard',
    });
    const make = async () => {
        if (!song) return;
        const line =
            document.querySelector('[class*="sour-stage-module-current"]')?.textContent?.trim() ||
            useSourStore.getState().savedLines?.[0]?.text ||
            '';
        const c = document.createElement('canvas');
        c.width = 1080;
        c.height = 1350;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const g = ctx.createLinearGradient(0, 0, 0, c.height);
        g.addColorStop(0, '#2a1f3d');
        g.addColorStop(1, '#0d0d12');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, c.width, c.height);
        if (cover) {
            await new Promise<void>((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,.5)';
                    ctx.shadowBlur = 60;
                    ctx.drawImage(img, 190, 140, 700, 700);
                    ctx.restore();
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = cover;
            });
        }
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = '700 46px system-ui, sans-serif';
        const words = (line ? `"${line}"` : '').split(' ');
        let row = '';
        let y = 940;
        for (const w of words) {
            if (ctx.measureText(`${row}${w} `).width > 900) {
                ctx.fillText(row.trim(), 540, y);
                row = '';
                y += 60;
            }
            row += `${w} `;
        }
        if (row.trim()) ctx.fillText(row.trim(), 540, y);
        ctx.font = '800 40px system-ui, sans-serif';
        ctx.fillText(song.name, 540, 1200);
        ctx.font = '400 32px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.fillText(song.artistName, 540, 1250);
        ctx.font = '400 24px system-ui, sans-serif';
        ctx.fillText('🍋 Sour Player', 540, 1310);
        try {
            const a = document.createElement('a');
            a.href = c.toDataURL('image/png');
            a.download = `${song.name} - share.png`;
            a.click();
        } catch {
            toast.error({ message: "The cover couldn't be used in the picture" });
        }
    };
    return (
        <button
            className={styles.tool}
            onClick={make}
            title="Save a picture of this moment to share"
            type="button"
        >
            📸 Share card
        </button>
    );
};

// ---------- Stage: save the line being sung ----------
export const SaveLineButton = () => {
    const song = usePlayerSong();
    return (
        <button
            className={styles.tool}
            onClick={() => {
                const text = document
                    .querySelector('[class*="sour-stage-module-current"]')
                    ?.textContent?.trim();
                if (!text || !song)
                    return toast.info({ message: 'No line is being sung right now' });
                const { savedLines = [], set } = useSourStore.getState();
                set({
                    savedLines: [
                        { artist: song.artistName, at: Date.now(), song: song.name, text },
                        ...savedLines,
                    ].slice(0, 200),
                });
                return toast.success({ message: 'Saved to your lyrics wall' });
            }}
            title="Save this line to your lyrics wall"
            type="button"
        >
            ❝ Save line
        </button>
    );
};

export const LyricsWall = () => {
    const lines = useSourStore((s) => s.savedLines ?? []);
    if (!lines.length) return null;
    return (
        <Card icon="❝" title="Your lyrics wall">
            <Stack gap={6}>
                {lines.slice(0, 30).map((l) => (
                    <div key={l.at}>
                        <Text size="sm" style={{ fontStyle: 'italic' }}>
                            “{l.text}”
                        </Text>
                        <Text isMuted size="xs">
                            {l.song} - {l.artist}
                        </Text>
                    </div>
                ))}
            </Stack>
        </Card>
    );
};

// ---------- Stage: duets and recording your karaoke ----------
export const DuetButton = () => {
    const on = useSourStore((s) => !!s.duet);
    useEffect(() => {
        document.documentElement.classList.toggle('sour-duet', on);
    }, [on]);
    return (
        <button
            className={styles.tool}
            onClick={() => useSourStore.getState().set({ duet: !on })}
            title="Two singers: lines alternate colours"
            type="button"
        >
            {on ? '👥 Duet on' : '👥 Duet'}
        </button>
    );
};

export const RecordButton = () => {
    const [rec, setRec] = useState<MediaRecorder | null>(null);
    const start = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const r = new MediaRecorder(stream);
            const parts: Blob[] = [];
            r.ondataavailable = (e) => parts.push(e.data);
            r.onstop = () => {
                stream.getTracks().forEach((t) => t.stop());
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob(parts, { type: r.mimeType || 'audio/webm' }));
                a.download = `karaoke-${new Date().toISOString().slice(0, 16).replace(':', '-')}.webm`;
                a.click();
                toast.success({ message: 'Your take is saved' });
            };
            r.start();
            setRec(r);
        } catch {
            toast.error({ message: "Couldn't use the microphone" });
        }
    };
    return (
        <button
            className={styles.tool}
            onClick={() => {
                if (rec) {
                    rec.stop();
                    setRec(null);
                } else start();
            }}
            title="Record yourself singing (your voice, saved as a file)"
            type="button"
        >
            {rec ? '⏺ Stop recording' : '🎙 Record'}
        </button>
    );
};
