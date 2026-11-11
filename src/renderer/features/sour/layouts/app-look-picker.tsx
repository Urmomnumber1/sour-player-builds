import { closeAllModals, openModal } from '@mantine/modals';
import clsx from 'clsx';
import { useEffect } from 'react';

import styles from './app-look-picker.module.css';

import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { isNewLayout } from '/@/renderer/features/sour/layouts/layout-kind';
import { type SourLook, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { Button } from '/@/shared/components/button/button';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Text } from '/@/shared/components/text/text';

interface LookCard {
    colors: [string, string, string];
    id: SourLook['ui'];
    name: string;
    note: string;
}

const LAYOUTS: LookCard[] = [
    {
        colors: ['#f1ece1', '#141310', '#d7f245'],
        id: 'mag',
        name: 'Magazine',
        note: 'Paper and ink, big headlines, the menu across the top',
    },
    {
        colors: ['#16181b', '#0a1208', '#baf53c'],
        id: 'hifi',
        name: 'Hi-Fi',
        note: 'A deck with a display, keys with lamps and a volume knob',
    },
    {
        colors: ['#5b3fe0', '#fff7e6', '#c6f53a'],
        id: 'pop',
        name: 'Pop',
        note: 'Candy colours and stickers, friends on the side',
    },
];

const OLDER: LookCard[] = [
    {
        colors: ['#101018', '#3b4bd8', '#7a8cff'],
        id: 'liquid',
        name: 'v0.10',
        note: "Glass panels in the playing song's colour",
    },
    {
        colors: ['#121212', '#1d1d1d', '#3574fc'],
        id: 'new',
        name: 'v2 (v0.9)',
        note: 'Rounded panels',
    },
    {
        colors: ['#0c0c0c', '#141414', '#3574fc'],
        id: 'classic',
        name: 'Classic (v0.7)',
        note: 'The original look',
    },
];

// Sour Studio > Layout > App look (and the setup guide): the three 0.12 layouts and the older looks
export const AppLookPicker = ({ compact, studio }: { compact?: boolean; studio?: boolean }) => {
    const ui = useSourStore((s) => s.look.ui ?? 'liquid');
    const tone = useSourStore((s) => s.look.tone);
    const setLook = useSourStore((s) => s.setLook);
    const card = (c: LookCard) => (
        <button
            aria-pressed={ui === c.id}
            className={clsx(styles.card, ui === c.id && styles.on)}
            key={c.id}
            onClick={() => setLook({ ui: c.id })}
            type="button"
        >
            <span className={styles.swatch}>
                {c.colors.map((color) => (
                    <i key={color} style={{ background: color }} />
                ))}
            </span>
            <span className={styles.name}>{c.name}</span>
            {!compact && <span className={styles.note}>{c.note}</span>}
        </button>
    );
    return (
        <div className={styles.picker}>
            <Text className={styles.group}>Layouts</Text>
            <div className={styles.grid}>{LAYOUTS.map(card)}</div>
            {(ui === 'mag' || ui === 'pop') && (
                <SegmentedControl
                    data={
                        ui === 'mag'
                            ? [
                                  { label: 'Paper', value: 'light' },
                                  { label: 'Night', value: 'dark' },
                              ]
                            : [
                                  { label: 'Grape', value: 'light' },
                                  { label: 'Midnight', value: 'dark' },
                              ]
                    }
                    onChange={(v) => setLook({ tone: v as 'dark' | 'light' })}
                    size="xs"
                    value={tone === 'dark' ? 'dark' : 'light'}
                />
            )}
            <Text className={styles.group}>Older looks</Text>
            <div className={styles.grid}>{OLDER.map(card)}</div>
            {isNewLayout(ui) && studio && (
                <Text isMuted size="xs">
                    The player bar, corner and sidebar options below are for the older looks.
                </Text>
            )}
        </div>
    );
};

const IntroBody = () => (
    <div className={styles.picker}>
        <Text size="sm">
            Sour Player 0.12 has three new layouts. Pick one, or keep the look you have now. You can
            switch any time in Sour Studio &gt; Layout.
        </Text>
        <AppLookPicker />
        <Button onClick={() => closeAllModals()}>Done</Button>
    </div>
);

// Once, the first time 0.12 starts on a device that was already set up: the three new layouts to pick
// from (new installs choose a look in the setup guide instead)
export const LayoutsIntro = () => {
    const url = useHermesUrl();
    useEffect(() => {
        const { celebrated, set, setupDone } = useSourStore.getState();
        if ((celebrated ?? []).includes('0.12-layouts')) return;
        set({ celebrated: [...(celebrated ?? []), '0.12-layouts'] });
        if (!setupDone && !url) return;
        openModal({ children: <IntroBody />, size: 'lg', title: 'Pick a layout' });
    }, [url]);
    return null;
};
