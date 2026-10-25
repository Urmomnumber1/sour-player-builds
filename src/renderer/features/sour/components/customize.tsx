import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { fontFamily, SOUR_FONTS } from '/@/renderer/features/sour/fonts';
import { type SourLook, useSourStore } from '/@/renderer/features/sour/store/sour.store';
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
    background: string;
    cursor: 'big' | 'default' | 'lemon';
    density: 'compact' | 'normal';
    headingFont: string;
    icons: 'bold' | 'regular' | 'thin';
    lyricsFont: string;
    primary: string;
    sidebar: 'left' | 'right';
    sounds: 'none' | 'pop' | 'soft';
    startPage: 'favorites' | 'home' | 'hub' | 'library' | 'stage';
    surface: string;
    text: string;
    themeOn: boolean;
}

export const DEFAULT_CUSTOM: Custom10 = {
    background: '#101014',
    cursor: 'default',
    density: 'normal',
    headingFont: 'default',
    icons: 'regular',
    lyricsFont: 'default',
    primary: '#f4d03f',
    sidebar: 'left',
    sounds: 'none',
    startPage: 'home',
    surface: '#1b1b22',
    text: '#f2f2f2',
    themeOn: false,
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

export const stageBackground = () => {
    try {
        return localStorage.getItem(STAGE_BG);
    } catch {
        return null;
    }
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
    const [bg, setBg] = useState(stageBackground());
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
                        <Button
                            onClick={() => {
                                try {
                                    localStorage.removeItem(STAGE_BG);
                                } catch {
                                    // nothing saved
                                }
                                setBg(null);
                            }}
                            size="xs"
                            variant="subtle"
                        >
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
                            try {
                                localStorage.setItem(STAGE_BG, data);
                                setBg(data);
                            } catch {
                                toast.error({ message: 'That picture is too big to keep' });
                            }
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

const Row = ({ children, label }: { children: React.ReactNode; label: string }) => (
    <Group gap="md" justify="space-between" wrap="nowrap">
        <Text fw={600} size="sm">
            {label}
        </Text>
        {children}
    </Group>
);
