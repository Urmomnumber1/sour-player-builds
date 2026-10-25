import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import styles from './ui10.module.css';

import { openRequestWindow } from '/@/renderer/features/hermes-request/components/request-button';
import { useCustom } from '/@/renderer/features/sour/components/customize';
import { openSourStudio } from '/@/renderer/features/sour/components/sour-studio';
import { toggleStage, useStage } from '/@/renderer/features/sour/stage/sour-stage';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { AppRoute } from '/@/renderer/router/routes';
import { Icon } from '/@/shared/components/icon/icon';

// The rest of the v0.10 look: the dock, pages that morph in, parallax headers, poster album pages,
// light that follows the time of day, focus mode and the gallery library.

export const toggleFocus = (on?: boolean) => {
    const { focusMode, set } = useSourStore.getState();
    set({ focusMode: on ?? !focusMode });
};

const daypart = () => {
    const h = new Date().getHours();
    return h < 6 ? 'night' : h < 10 ? 'dawn' : h < 17 ? 'day' : h < 21 ? 'dusk' : 'night';
};

export const UiTen = () => {
    const c = useCustom();
    const ui = useSourStore((s) => s.look.ui ?? 'liquid');
    const focus = useSourStore((s) => !!s.focusMode);
    const location = useLocation();
    const first = useRef(true);
    useEffect(() => toggleFocus(false), []); // focus mode never sticks across restarts

    // which page this is (poster album pages, gallery) and a short morph each time it changes
    useEffect(() => {
        const root = document.documentElement;
        const p = location.pathname;
        root.dataset.route = /^\/library\/albums\/[^/]+$/.test(p)
            ? 'album'
            : /^\/library\/(album-)?artists\/[^/]+$/.test(p)
              ? 'artist'
              : p === '/library/albums'
                ? 'albums'
                : 'other';
        document.documentElement.style.setProperty('--sour-scroll', '0'); // a new page starts at the top
        if (first.current) {
            first.current = false;
            return undefined;
        }
        if (!c.morph || ui !== 'liquid') return undefined;
        root.classList.remove('sour-morph');
        void root.offsetWidth; // restart the animation
        root.classList.add('sour-morph');
        const t = setTimeout(() => root.classList.remove('sour-morph'), 450);
        return () => clearTimeout(t);
    }, [c.morph, location.pathname, ui]);

    // parallax: headers drift slower than the page
    useEffect(() => {
        if (!c.parallax) {
            document.documentElement.style.removeProperty('--sour-scroll');
            return undefined;
        }
        let raf = 0;
        const onScroll = (e: Event) => {
            const el = e.target as HTMLElement;
            if (!el?.closest?.('#main-content')) return;
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() =>
                document.documentElement.style.setProperty(
                    '--sour-scroll',
                    String(Math.min(600, el.scrollTop || 0)),
                ),
            );
        };
        document.addEventListener('scroll', onScroll, true);
        return () => document.removeEventListener('scroll', onScroll, true);
    }, [c.parallax]);

    // the classes the CSS keys off
    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('sour-poster', c.poster && ui === 'liquid');
        root.classList.toggle('sour-parallax', c.parallax);
        root.classList.toggle('sour-gallery', c.gallery);
        root.classList.toggle('sour-focus', focus);
        root.classList.toggle('sour-daylight', c.timeOfDay);
        const tick = () => {
            root.dataset.daypart = daypart();
        };
        tick();
        const t = setInterval(tick, 5 * 60000);
        return () => clearInterval(t);
    }, [c.gallery, c.parallax, c.poster, c.timeOfDay, focus, ui]);

    // Ctrl+Shift+F: focus mode; Esc leaves it
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                toggleFocus();
            } else if (
                e.key === 'Escape' &&
                useSourStore.getState().focusMode &&
                // Esc closes a window or the Stage first; only then does it leave focus mode
                !document.querySelector('.mantine-Modal-root, [role="dialog"]') &&
                !useStage.getState().open
            ) {
                toggleFocus(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <>
            {c.dock && !focus && ui === 'liquid' && <Dock />}
            {focus && (
                <button
                    className={styles.leaveFocus}
                    onClick={() => toggleFocus(false)}
                    type="button"
                >
                    Leave focus mode (Esc)
                </button>
            )}
        </>
    );
};

// a floating dock of the places you go most; icons grow as the pointer passes over them
const Dock = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const stageOpen = useStage((s) => s.open);
    const ref = useRef<HTMLDivElement>(null);
    const items: { active?: boolean; icon: string; label: string; run: () => void }[] = [
        {
            active: location.pathname === '/',
            icon: 'home',
            label: 'Home',
            run: () => navigate(AppRoute.HOME),
        },
        {
            active: location.pathname === AppRoute.SOUR_HUB,
            icon: 'citrus',
            label: 'Sour Hub',
            run: () => navigate(AppRoute.SOUR_HUB),
        },
        {
            active: location.pathname.startsWith('/library/albums'),
            icon: 'album',
            label: 'Albums',
            run: () => navigate(AppRoute.LIBRARY_ALBUMS),
        },
        {
            active: location.pathname === AppRoute.FAVORITES,
            icon: 'favorite',
            label: 'Favorites',
            run: () => navigate(AppRoute.FAVORITES),
        },
        { active: stageOpen, icon: 'audioLines', label: 'Sour Stage', run: () => toggleStage() },
        { icon: 'download', label: 'Request music', run: openRequestWindow },
        { icon: 'palette', label: 'Sour Studio', run: openSourStudio },
        { icon: 'expand', label: 'Focus mode', run: () => toggleFocus(true) },
    ];
    const onMove = (e: React.MouseEvent) => {
        for (const el of ref.current?.querySelectorAll<HTMLElement>('button') ?? []) {
            const r = el.getBoundingClientRect();
            const d = Math.abs(e.clientX - (r.left + r.width / 2));
            el.style.setProperty('--grow', String(Math.max(1, 1.55 - d / 140)));
        }
    };
    const onLeave = () => {
        for (const el of ref.current?.querySelectorAll<HTMLElement>('button') ?? [])
            el.style.setProperty('--grow', '1');
    };
    return (
        <div className={styles.dock} onMouseLeave={onLeave} onMouseMove={onMove} ref={ref}>
            {items.map((it) => (
                <button
                    aria-label={it.label}
                    className={clsx(styles.dockItem, { [styles.dockActive]: it.active })}
                    key={it.label}
                    onClick={it.run}
                    title={it.label}
                    type="button"
                >
                    <Icon icon={it.icon as 'home'} size="lg" />
                </button>
            ))}
        </div>
    );
};
