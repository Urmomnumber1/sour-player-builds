import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import styles from './phone-shell.module.css';

import { useGroupPlayStore } from '/@/renderer/features/group-play/store/group-play.store';
import { isIphone } from '/@/renderer/features/sour/mobile/ios-look';
import { isTabRoot, PHONE_TABS } from '/@/renderer/features/sour/mobile/mobile-nav';
import { useDriving } from '/@/renderer/features/sour/mobile/phone-features';
import { toggleStage, useStage } from '/@/renderer/features/sour/stage/sour-stage';
import { Icon } from '/@/shared/components/icon/icon';

// The phone shell's helpers: the .sour-phone class (sour-phone.css), the back bar on inner pages,
// long-press menus and swipe-back on iPhone, and what Android's Back button closes first.

const somethingOpen = () =>
    document.querySelector(
        '.mantine-Modal-root, .mantine-Drawer-root, [class*="context-menu-module-content"], .mantine-Popover-dropdown, .mantine-Menu-dropdown',
    );

// Back (Android's button, or swiping in from the left edge on iPhone): closes the thing on top first
// (a menu, a sheet, the Now Playing screen, driving mode, the Group Play panel). True when it did.
export const phoneBack = (): boolean => {
    if (somethingOpen()) {
        // one Escape, from an element (it bubbles up to whoever listens; Mantine reads the target's
        // attributes, so it can't come from window itself)
        const target = (document.activeElement as HTMLElement | null) ?? document.body;
        target.dispatchEvent(
            new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                code: 'Escape',
                key: 'Escape',
            }),
        );
        return true;
    }
    if (useDriving.getState().open) {
        useDriving.setState({ open: false });
        return true;
    }
    if (useStage.getState().open) {
        toggleStage(false);
        return true;
    }
    if (useGroupPlayStore.getState().panelOpen) {
        useGroupPlayStore.setState({ panelOpen: false });
        return true;
    }
    return false;
};

export const PhoneShell = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const root = useRef(isTabRoot(pathname));
    root.current = isTabRoot(pathname);
    const path = useRef(pathname);
    path.current = pathname;
    const nav = useRef(navigate);
    nav.current = navigate;

    // the phone look is on while this layout shows
    useEffect(() => {
        document.documentElement.classList.add('sour-phone');
        (window as any).sourBack = phoneBack;
        // Android's Back button asks this first: 'done' (it closed something or went to Home),
        // 'history' (go back a page) or 'exit' (on Home: the app goes to the background, music keeps going)
        (window as any).sourBackKey = (): 'done' | 'exit' | 'history' => {
            if (phoneBack()) return 'done';
            if (!root.current) return 'history';
            if (path.current !== '/') {
                nav.current('/');
                return 'done';
            }
            return 'exit';
        };
        return () => {
            document.documentElement.classList.remove('sour-phone');
            delete (window as any).sourBack;
            delete (window as any).sourBackKey;
        };
    }, []);

    // iPhone: long-pressing opens the same menus a right-click does (Safari has no long-press menu
    // event), and swiping in from the left edge goes back
    useEffect(() => {
        if (!isIphone()) return undefined;
        let timer = 0;
        let start: null | { t: number; x: number; y: number } = null;
        let target: EventTarget | null = null;
        let pressed = false;
        const cancel = () => {
            window.clearTimeout(timer);
            timer = 0;
        };
        const down = (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            start = { t: Date.now(), x: t.clientX, y: t.clientY };
            target = e.target;
            pressed = false;
            const el = e.target as HTMLElement;
            if (el.closest('input, textarea, [contenteditable="true"]')) return;
            cancel();
            timer = window.setTimeout(() => {
                timer = 0;
                pressed = true;
                navigator.vibrate?.(10);
                (target as HTMLElement | null)?.dispatchEvent(
                    new MouseEvent('contextmenu', {
                        bubbles: true,
                        cancelable: true,
                        clientX: t.clientX,
                        clientY: t.clientY,
                    }),
                );
            }, 520);
        };
        const move = (e: TouchEvent) => {
            if (!start) return;
            const t = e.touches[0];
            if (Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10) cancel();
        };
        const up = (e: TouchEvent) => {
            cancel();
            if (pressed) {
                // the tap that ended the long-press doesn't also click
                e.preventDefault();
                pressed = false;
            }
            const t = e.changedTouches[0];
            if (start && t && start.x < 24 && Date.now() - start.t < 600) {
                const dx = t.clientX - start.x;
                const dy = Math.abs(t.clientY - start.y);
                if (dx > 70 && dy < 50 && !phoneBack() && !root.current) navigate(-1);
            }
            start = null;
        };
        document.addEventListener('touchstart', down, { passive: true });
        document.addEventListener('touchmove', move, { passive: true });
        document.addEventListener('touchend', up, { passive: false });
        document.addEventListener('touchcancel', cancel, { passive: true });
        return () => {
            cancel();
            document.removeEventListener('touchstart', down);
            document.removeEventListener('touchmove', move);
            document.removeEventListener('touchend', up);
            document.removeEventListener('touchcancel', cancel);
        };
    }, [navigate]);

    return null;
};

// the bar with a back button on pages inside a tab (an album, a playlist, settings...)
export const PhoneTopBar = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    if (isTabRoot(pathname)) return null;
    const tab = PHONE_TABS.find((t) => t.match(pathname));
    return (
        <div className={styles.topBar}>
            <button
                aria-label="Back"
                className={styles.back}
                onClick={() => {
                    // opened from a link straight to this page: back goes to its tab
                    if (window.history.length > 1) navigate(-1);
                    else navigate(tab?.to ?? '/');
                }}
                type="button"
            >
                <Icon icon="arrowLeftS" size="xl" />
                <span>{tab?.label ?? 'Back'}</span>
            </button>
        </div>
    );
};
