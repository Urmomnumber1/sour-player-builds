import clsx from 'clsx';
import { AnimatePresence } from 'motion/react';
import { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router';

import styles from './mobile-layout.module.css';

import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { FullScreenVisualizer } from '/@/renderer/features/player/components/full-screen-visualizer';
import { SourRoot } from '/@/renderer/features/sour/components/sour-root';
import { isIosApp } from '/@/renderer/features/sour/mobile/android';
import { MobileNav } from '/@/renderer/features/sour/mobile/mobile-nav';
import { isWebApp } from '/@/renderer/features/sour/mobile/offline';
import { PhoneShell, PhoneTopBar } from '/@/renderer/features/sour/mobile/phone-shell';
import { WebOffline } from '/@/renderer/features/sour/mobile/web-offline';
import { toggleStage } from '/@/renderer/features/sour/stage/sour-stage';
import { PlayerBar } from '/@/renderer/layouts/default-layout/player-bar';
import { WindowBar } from '/@/renderer/layouts/window-bar';
import {
    useFullScreenPlayerOverlayState,
    useFullScreenPlayerStore,
    useWindowBarStyle,
} from '/@/renderer/store';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Platform } from '/@/shared/types/types';

interface MobileLayoutProps {
    shell?: boolean;
}

// Phones: the page, the mini player and the tab bar (Home, Search, Library, Friends, You). Inner
// pages get a back bar; Now Playing is the Sour Stage.
export const MobileLayout = ({ shell }: MobileLayoutProps) => {
    const {
        expanded: isFullScreenPlayerExpanded,
        visualizerExpanded: isFullScreenVisualizerExpanded,
    } = useFullScreenPlayerOverlayState();
    const windowBarStyle = useWindowBarStyle();
    // the full screen player on phones is the Sour Stage
    useEffect(() => {
        if (!isFullScreenPlayerExpanded) return;
        useFullScreenPlayerStore.getState().actions.setStore({ expanded: false });
        toggleStage(true);
    }, [isFullScreenPlayerExpanded]);

    return (
        <>
            <PhoneShell />
            <div
                className={clsx(styles.layout, {
                    [styles.macos]: windowBarStyle === Platform.MACOS,
                    [styles.windows]: windowBarStyle === Platform.WINDOWS,
                })}
                id="mobile-layout"
            >
                {!shell && <WindowBar />}
                {!shell && <PhoneTopBar />}
                <main className={styles.mainContent}>
                    <Suspense fallback={<Spinner container />}>
                        <Outlet />
                    </Suspense>
                </main>
                <PlayerBar />
                {!shell && <MobileNav />}
            </div>
            {/* the Sour Stage, holiday skins, social pop-ups... (same as on computers) */}
            <SourRoot />
            {(isWebApp() || isIosApp()) && <WebOffline />}
            <AnimatePresence initial={false}>
                {isFullScreenVisualizerExpanded && (
                    <div className={styles.fullScreenPlayerOverlay}>
                        <FullScreenVisualizer />
                    </div>
                )}
            </AnimatePresence>
            <ContextMenuController.Root />
        </>
    );
};
