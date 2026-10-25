import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { create } from 'zustand';

import { fontFamily, SOUR_FONTS } from '/@/renderer/features/sour/fonts';
import { type SourLook, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { idbGet, idbSet } from '/@/renderer/features/sour/utils/idb';
import { AppRoute } from '/@/renderer/router/routes';
import { Button } from '/@/shared/components/button/button';
import { ColorInput } from '/@/shared/components/color-input/color-input';
import { Group } from '/@/shared/components/group/group';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Select } from '/@/shared/components/select/select';
import { Stack } from '/@/shared/components/stack/stack';
import { Switch } from '/@/shared/components/switch/switch';
import { Text } from '/@/shared/components/text/text';
import { Textarea } from '/@/shared/components/textarea/textarea';
import { toast } from '/@/shared/components/toast/toast';

// Sour Player 0.10 customization: your own theme colours, cursor, click sounds, icon weight, the page
// it opens on, fonts for headings and lyrics, which side the sidebar sits on, density, your own Sour
// Stage background and sharing the whole setup as a code.
export interface Custom10 {
    // 0.10.4
    autostart: boolean;
    background: string;
    credits: boolean;
    cursor: 'big' | 'default' | 'lemon';
    density: 'compact' | 'normal';
    dock: boolean;
    gallery: boolean;
    headingFont: string;
    highContrast: boolean;
    icons: 'bold' | 'colour' | 'regular' | 'thin';
    lowPower: 'battery' | 'off' | 'on';
    lyricsFont: string;
    moodCrossfade: boolean;
    morph: boolean;
    parallax: boolean;
    poster: boolean;
    primary: string;
    quickRequest: boolean;
    sidebar: 'left' | 'right';
    sounds: 'none' | 'pop' | 'soft';
    stageLayout: 'cover' | 'lyrics' | 'split';
    startPage: 'favorites' | 'home' | 'hub' | 'library' | 'stage';
    surface: string;
    text: string;
    textScale: number;
    themeOn: boolean;
    timeOfDay: boolean;
    widget: boolean;
}

export const DEFAULT_CUSTOM: Custom10 = {
    autostart: false,
    background: '#101014',
    credits: true,
    cursor: 'default',
    density: 'normal',
    dock: false,
    gallery: false,
    headingFont: 'default',
    highContrast: false,
    icons: 'regular',
    lowPower: 'battery',
    lyricsFont: 'default',
    moodCrossfade: false,
    morph: true,
    parallax: true,
    poster: true,
    primary: '#f4d03f',
    quickRequest: true,
    sidebar: 'left',
    sounds: 'none',
    stageLayout: 'split',
    startPage: 'home',
    surface: '#1b1b22',
    text: '#f2f2f2',
    textScale: 1,
    themeOn: false,
    timeOfDay: true,
    widget: false,
};

const STAGE_BG = 'sour-stage-background';

export const useCustom = () => {
    const c = useSourStore((s) => s.look.custom10);
    return { ...DEFAULT_CUSTOM, ...c };
};

const setCustom = (changes: Partial<Custom10>) => {
    const { look, setLook } = useSourStore.getState();
    setLook({ custom10: { ...DEFAULT_CUSTOM, ...look.custom10, ...changes } });
};

// your Sour Stage picture: kept in IndexedDB (localStorage is small and holds every setting; a big
// picture there used to stop settings from saving), loaded once at start
const useStageBg = create<{ bg: null | string }>()(() => ({ bg: null }));
export const useStageBackground = () => useStageBg((s) => s.bg);
const setStageBackground = async (data: null | string) => {
    await idbSet(STAGE_BG, data);
    useStageBg.setState({ bg: data });
};
const loadStageBackground = async () => {
    let bg = (await idbGet<string>(STAGE_BG)) ?? null;
    try {
        const old = localStorage.getItem(STAGE_BG); // from 0.10.1: move it out of localStorage
        if (old) {
            if (!bg) {
                bg = old;
                await idbSet(STAGE_BG, old);
            }
            localStorage.removeItem(STAGE_BG);
        }
    } catch {
        // nothing to move
    }
    useStageBg.setState({ bg });
};

const LEMON_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="9" ry="7" transform="rotate(-35 12 12)" fill="#f4d03f" stroke="#7a5d00" stroke-width="1.2"/><circle cx="4" cy="4" r="1.6" fill="#7a5d00"/></svg>',
)}") 3 3, auto`;

// click sounds, made on the fly (no files)
let audio: AudioContext | null = null;
const blip = (kind: 'pop' | 'soft') => {
    try {
        audio = audio || new AudioContext();
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = kind === 'pop' ? 'triangle' : 'sine';
        o.frequency.value = kind === 'pop' ? 880 : 520;
        g.gain.setValueAtTime(kind === 'pop' ? 0.06 : 0.03, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.08);
        o.connect(g).connect(audio.destination);
        o.start();
        o.stop(audio.currentTime + 0.09);
    } catch {
        // no audio here: no click sounds
    }
};

// applies everything above (lives in SourRoot)
export const CustomizeApply = () => {
    const c = useCustom();
    const navigate = useNavigate();
    const started = useRef(false);
    useEffect(() => {
        loadStageBackground();
    }, []);
    useEffect(() => {
        const root = document.documentElement;
        const vars: Record<string, null | string> = c.themeOn
            ? {
                  '--theme-colors-background': c.background,
                  '--theme-colors-foreground': c.text,
                  '--theme-colors-primary': c.primary,
                  '--theme-colors-surface': c.surface,
              }
            : {
                  '--theme-colors-background': null,
                  '--theme-colors-foreground': null,
                  '--theme-colors-primary': null,
                  '--theme-colors-surface': null,
              };
        for (const [k, v] of Object.entries(vars)) {
            if (v) root.style.setProperty(k, v);
            else root.style.removeProperty(k);
        }
        root.style.cursor = c.cursor === 'lemon' ? LEMON_CURSOR : '';
        root.classList.toggle('sour-big-cursor', c.cursor === 'big');
        root.classList.toggle('sour-sidebar-right', c.sidebar === 'right');
        root.classList.toggle('sour-compact', c.density === 'compact');
        root.dataset.icons = c.icons;
        root.style.setProperty('--sour-heading-font', fontFamily(c.headingFont));
        root.style.setProperty('--sour-lyrics-font', fontFamily(c.lyricsFont));
    }, [c]);
    useEffect(() => {
        if (c.sounds === 'none') return undefined;
        const kind = c.sounds;
        const onClick = (e: MouseEvent) => {
            if ((e.target as HTMLElement)?.closest('button, a, [role="button"], [role="tab"]'))
                blip(kind);
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [c.sounds]);
    useEffect(() => {
        // the page Sour Player opens on (once per start)
        if (started.current) return;
        started.current = true;
        const to = {
            favorites: AppRoute.FAVORITES,
            home: null,
            hub: AppRoute.SOUR_HUB,
            library: AppRoute.SOUR_LIBRARY,
            stage: null,
        }[c.startPage];
        if (!['', '/'].includes(window.location.hash.replace(/^#/, ''))) return;
        if (to) navigate(to);
        if (c.startPage === 'stage') {
            import('/@/renderer/features/sour/stage/sour-stage').then((m) => m.toggleStage(true));
        }
    }, [c.startPage, navigate]);
    return null;
};

const fontData = SOUR_FONTS.filter((f) => !f.perk).map((f) => ({ label: f.label, value: f.id }));

export const Customize = () => {
    const c = useCustom();
    const look = useSourStore((s) => s.look);
    const [code, setCode] = useState('');
    const bg = useStageBackground();
    const file = useRef<HTMLInputElement>(null);
    return (
        <Stack gap="md">
            <Stack gap={6}>
                <Switch
                    checked={c.themeOn}
                    description="Pick your own colours. Turn it off to go back to the skin."
                    label="Theme builder"
                    onChange={(e) => setCustom({ themeOn: e.currentTarget.checked })}
                />
                {c.themeOn && (
                    <Group gap="xs" grow>
                        <ColorInput
                            label="Accent"
                            onChangeEnd={(v) => setCustom({ primary: v })}
                            value={c.primary}
                        />
                        <ColorInput
                            label="Background"
                            onChangeEnd={(v) => setCustom({ background: v })}
                            value={c.background}
                        />
                        <ColorInput
                            label="Panels"
                            onChangeEnd={(v) => setCustom({ surface: v })}
                            value={c.surface}
                        />
                        <ColorInput
                            label="Text"
                            onChangeEnd={(v) => setCustom({ text: v })}
                            value={c.text}
                        />
                    </Group>
                )}
            </Stack>
            <Group gap="md" grow>
                <Select
                    data={[
                        { label: 'Home', value: 'home' },
                        { label: 'Sour Hub', value: 'hub' },
                        { label: 'Sour Library', value: 'library' },
                        { label: 'Favorites', value: 'favorites' },
                        { label: 'Sour Stage', value: 'stage' },
                    ]}
                    label="Opens on"
                    onChange={(v) => v && setCustom({ startPage: v as Custom10['startPage'] })}
                    value={c.startPage}
                />
                <Select
                    data={fontData}
                    label="Heading font"
                    onChange={(v) => v && setCustom({ headingFont: v })}
                    value={c.headingFont}
                />
                <Select
                    data={fontData}
                    label="Lyrics font"
                    onChange={(v) => v && setCustom({ lyricsFont: v })}
                    value={c.lyricsFont}
                />
            </Group>
            <Group gap="lg">
                {(
                    [
                        ['dock', 'Dock'],
                        ['morph', 'Pages morph in'],
                        ['parallax', 'Parallax headers'],
                        ['poster', 'Poster album pages'],
                        ['gallery', 'Gallery library'],
                        ['timeOfDay', 'Light follows the time of day'],
                        ['moodCrossfade', 'Crossfade follows the mood'],
                        ['widget', 'Mini player as a desktop widget'],
                        ['autostart', 'Start with the computer'],
                        ['quickRequest', 'Ctrl+Alt+R requests a song from anywhere'],
                        ['credits', 'Credits at the end of songs in the Stage'],
                        ['highContrast', 'High contrast'],
                    ] as const
                ).map(([k, label]) => (
                    <Switch
                        checked={c[k]}
                        key={k}
                        label={label}
                        onChange={(e) => setCustom({ [k]: e.currentTarget.checked })}
                        size="xs"
                    />
                ))}
            </Group>
            <Text isMuted size="xs">
                Focus mode: Ctrl+Shift+F (Esc leaves) hides everything but the page and the player.
            </Text>
            <QuietHours />
            <Row label="Low-power mode">
                <SegmentedControl
                    data={[
                        { label: 'Off', value: 'off' },
                        { label: 'On battery', value: 'battery' },
                        { label: 'Always', value: 'on' },
                    ]}
                    onChange={(v) => setCustom({ lowPower: v as Custom10['lowPower'] })}
                    value={c.lowPower}
                />
            </Row>
            <Row label="Text size">
                <SegmentedControl
                    data={[
                        { label: 'Normal', value: '1' },
                        { label: 'Bigger', value: '1.1' },
                        { label: 'Biggest', value: '1.25' },
                    ]}
                    onChange={(v) => setCustom({ textScale: Number(v) })}
                    value={String(c.textScale || 1)}
                />
            </Row>
            <Row label="Sour Stage layout">
                <SegmentedControl
                    data={[
                        { label: 'Cover and lyrics', value: 'split' },
                        { label: 'Lyrics only', value: 'lyrics' },
                        { label: 'Cover only', value: 'cover' },
                    ]}
                    onChange={(v) => setCustom({ stageLayout: v as Custom10['stageLayout'] })}
                    value={c.stageLayout}
                />
            </Row>
            <Row label="Cursor">
                <SegmentedControl
                    data={[
                        { label: 'Normal', value: 'default' },
                        { label: 'Lemon', value: 'lemon' },
                        { label: 'Big', value: 'big' },
                    ]}
                    onChange={(v) => setCustom({ cursor: v as Custom10['cursor'] })}
                    value={c.cursor}
                />
            </Row>
            <Row label="Click sounds">
                <SegmentedControl
                    data={[
                        { label: 'Off', value: 'none' },
                        { label: 'Soft', value: 'soft' },
                        { label: 'Pop', value: 'pop' },
                    ]}
                    onChange={(v) => setCustom({ sounds: v as Custom10['sounds'] })}
                    value={c.sounds}
                />
            </Row>
            <Row label="Icons">
                <SegmentedControl
                    data={[
                        { label: 'Thin', value: 'thin' },
                        { label: 'Regular', value: 'regular' },
                        { label: 'Bold', value: 'bold' },
                        { label: 'Colour', value: 'colour' },
                    ]}
                    onChange={(v) => setCustom({ icons: v as Custom10['icons'] })}
                    value={c.icons}
                />
            </Row>
            <Row label="Sidebar">
                <SegmentedControl
                    data={[
                        { label: 'Left', value: 'left' },
                        { label: 'Right', value: 'right' },
                    ]}
                    onChange={(v) => setCustom({ sidebar: v as Custom10['sidebar'] })}
                    value={c.sidebar}
                />
            </Row>
            <Row label="Density">
                <SegmentedControl
                    data={[
                        { label: 'Comfortable', value: 'normal' },
                        { label: 'Compact', value: 'compact' },
                    ]}
                    onChange={(v) => setCustom({ density: v as Custom10['density'] })}
                    value={c.density}
                />
            </Row>
            <Stack gap={4}>
                <Text fw={600} size="sm">
                    Sour Stage background
                </Text>
                <Text isMuted size="xs">
                    Your own picture behind the Stage (a playlist&#39;s theme picture still wins).
                </Text>
                <Group gap="xs">
                    <Button onClick={() => file.current?.click()} size="xs" variant="default">
                        {bg ? 'Change picture' : 'Pick a picture'}
                    </Button>
                    {bg && (
                        <Button onClick={() => setStageBackground(null)} size="xs" variant="subtle">
                            Remove
                        </Button>
                    )}
                </Group>
                <input
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                        const f = e.currentTarget.files?.[0];
                        if (!f) return;
                        const img = new Image();
                        img.onload = () => {
                            // scaled down so it fits in the app's storage
                            const scale = Math.min(1, 1920 / img.width);
                            const cv = document.createElement('canvas');
                            cv.width = Math.round(img.width * scale);
                            cv.height = Math.round(img.height * scale);
                            cv.getContext('2d')?.drawImage(img, 0, 0, cv.width, cv.height);
                            const data = cv.toDataURL('image/jpeg', 0.82);
                            setStageBackground(data).catch(() =>
                                toast.error({ message: "Couldn't keep that picture" }),
                            );
                            URL.revokeObjectURL(img.src);
                        };
                        img.src = URL.createObjectURL(f);
                    }}
                    ref={file}
                    type="file"
                />
            </Stack>
            <Stack gap={4}>
                <Text fw={600} size="sm">
                    Share your setup
                </Text>
                <Text isMuted size="xs">
                    Copy the code to send your whole look to a friend, or paste theirs.
                </Text>
                <Group gap="xs">
                    <Button
                        onClick={() => {
                            const text = btoa(unescape(encodeURIComponent(JSON.stringify(look))));
                            navigator.clipboard
                                .writeText(text)
                                .then(() => toast.success({ message: 'Setup code copied' }))
                                .catch(() => setCode(text));
                        }}
                        size="xs"
                        variant="default"
                    >
                        Copy my setup
                    </Button>
                    <Button
                        disabled={!code.trim()}
                        onClick={() => {
                            try {
                                const next = JSON.parse(
                                    decodeURIComponent(escape(atob(code.trim()))),
                                ) as Partial<SourLook>;
                                if (typeof next !== 'object' || !next) throw new Error('bad');
                                useSourStore.getState().setLook(next);
                                toast.success({ message: 'Setup applied' });
                                setCode('');
                            } catch {
                                toast.error({ message: "That code doesn't look right" });
                            }
                        }}
                        size="xs"
                    >
                        Use this code
                    </Button>
                </Group>
                <Textarea
                    autosize
                    maxRows={4}
                    onChange={(e) => setCode(e.currentTarget.value)}
                    placeholder="Paste a setup code"
                    value={code}
                />
            </Stack>
        </Stack>
    );
};

const QuietHours = () => {
    const q = useSourStore((s) => s.quietHours) ?? { from: 23, on: false, to: 8 };
    const set = (c: Partial<typeof q>) =>
        useSourStore.getState().set({ quietHours: { ...q, ...c } });
    const hours = Array.from({ length: 24 }, (_, h) => ({ label: `${h}:00`, value: String(h) }));
    return (
        <Group gap="xs" wrap="nowrap">
            <Switch
                checked={q.on}
                label="Quiet hours (no pop-ups from friends)"
                onChange={(e) => set({ on: e.currentTarget.checked })}
                size="xs"
            />
            {q.on && (
                <>
                    <Select
                        data={hours}
                        onChange={(v) => v && set({ from: Number(v) })}
                        size="xs"
                        value={String(q.from)}
                        w={90}
                    />
                    <Text size="xs">to</Text>
                    <Select
                        data={hours}
                        onChange={(v) => v && set({ to: Number(v) })}
                        size="xs"
                        value={String(q.to)}
                        w={90}
                    />
                </>
            )}
        </Group>
    );
};

const Row = ({ children, label }: { children: React.ReactNode; label: string }) => (
    <Group gap="md" justify="space-between" wrap="nowrap">
        <Text fw={600} size="sm">
            {label}
        </Text>
        {children}
    </Group>
);
