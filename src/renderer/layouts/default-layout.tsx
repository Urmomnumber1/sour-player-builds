import clsx from 'clsx';
import isElectron from 'is-electron';
import { lazy, Suspense } from 'react';

import styles from './default-layout.module.css';

import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { SourRoot } from '/@/renderer/features/sour/components/sour-root';
import { isNewLayout } from '/@/renderer/features/sour/layouts/layout-kind';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { MainContent } from '/@/renderer/layouts/default-layout/main-content';
import { PlayerBar } from '/@/renderer/layouts/default-layout/player-bar';
import { WindowBar } from '/@/renderer/layouts/window-bar';
import { useSettingsStore, useWindowBarStyle } from '/@/renderer/store/settings.store';
import { Platform, PlayerType } from '/@/shared/types/types';

if (!isElectron()) {
    useSettingsStore.getState().actions.setSettings({
        playback: {
            type: PlayerType.WEB,
        },
    });
}

// 0.12: Magazine, Hi-Fi and Pop have their own frame (menus, player and side panels around the
// same pages). It's downloaded only when one of them is picked.
const LayoutShell = lazy(() => import('/@/renderer/features/sour/layouts/layout-shell'));

interface DefaultLayoutProps {
    shell?: boolean;
}

export const DefaultLayout = ({ shell }: DefaultLayoutProps) => {
    const windowBarStyle = useWindowBarStyle();
    const ui = useSourStore((s) => s.look.ui);
    const layout = !shell && isNewLayout(ui) ? ui : null;
    return (
        <>
            {layout ? (
                <Suspense fallback={null}>
                    <LayoutShell kind={layout} />
                </Suspense>
            ) : (
                <div
                    className={clsx(styles.layout, {
                        [styles.macos]: windowBarStyle === Platform.MACOS,
                        [styles.windows]: windowBarStyle === Platform.WINDOWS,
                    })}
                    id="default-layout"
                >
                    <WindowBar />
                    <MainContent shell={shell} />
                    <PlayerBar />
                </div>
            )}
            <ContextMenuController.Root />
            <SourRoot />
        </>
    );
};
