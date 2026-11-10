import clsx from 'clsx';
import { useLocation, useNavigate } from 'react-router';

import styles from './mobile-nav.module.css';

import { useInbox } from '/@/renderer/features/sour/components/social10';
import { useSourProfiles, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { AppRoute } from '/@/renderer/router/routes';
import { Icon } from '/@/shared/components/icon/icon';

// the five places on a phone, and which pages belong to each (so the right tab lights up)
export const PHONE_TABS: {
    icon: Parameters<typeof Icon>[0]['icon'];
    label: string;
    match: (path: string) => boolean;
    to: string;
}[] = [
    // Search lives in the search bar at the top of Home and Library (0.11, after Substreamer)
    {
        icon: 'house',
        label: 'Home',
        match: (p) =>
            p === '/' || p === '' || p.startsWith(AppRoute.PHONE_SEARCH) || p.startsWith('/search'),
        to: AppRoute.HOME,
    },
    {
        icon: 'library',
        label: 'Library',
        match: (p) =>
            p.startsWith(AppRoute.PHONE_LIBRARY) ||
            p.startsWith('/library') ||
            p.startsWith('/playlists') ||
            p.startsWith('/favorites') ||
            p.startsWith('/radio') ||
            p.startsWith(AppRoute.SOUR_LIBRARY),
        to: AppRoute.PHONE_LIBRARY,
    },
    {
        icon: 'download',
        label: 'Offline',
        match: (p) => p.startsWith(AppRoute.PHONE_OFFLINE),
        to: AppRoute.PHONE_OFFLINE,
    },
    {
        icon: 'group',
        label: 'Friends',
        match: (p) => p.startsWith(AppRoute.SOUR_HUB),
        to: AppRoute.SOUR_HUB,
    },
    {
        icon: 'user',
        label: 'You',
        match: (p) => p.startsWith(AppRoute.PHONE_ME) || p.startsWith(AppRoute.SETTINGS),
        to: AppRoute.PHONE_ME,
    },
];

// the tab roots: pages with no back button
export const isTabRoot = (path: string) =>
    path === '/' || PHONE_TABS.some((t) => t.to !== '/' && path === t.to);

// Phones: the tab bar at the bottom, like any music app. Tapping the tab you're on takes its page
// back to the top.
export const MobileNav = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const unread = (useInbox().data ?? []).filter((m) => !m.read).length;
    const me = useSourStore((s) => s.me);
    const online = (useSourProfiles().data ?? []).filter((p) => p.online && p.id !== me?.id).length;
    return (
        <nav className={styles.nav}>
            {PHONE_TABS.map((tab) => {
                const active = tab.match(pathname);
                const badge = tab.label === 'You' ? unread : tab.label === 'Friends' ? online : 0;
                return (
                    <button
                        aria-current={active ? 'page' : undefined}
                        aria-label={tab.label}
                        className={clsx(styles.item, { [styles.active]: active })}
                        key={tab.label}
                        onClick={() => {
                            if (active && pathname === tab.to) {
                                document
                                    .querySelectorAll('#mobile-layout main, #mobile-layout main *')
                                    .forEach((el) => {
                                        if (el.scrollTop > 0)
                                            el.scrollTo({ behavior: 'smooth', top: 0 });
                                    });
                                return;
                            }
                            navigate(tab.to);
                        }}
                        type="button"
                    >
                        <span className={styles.iconWrap}>
                            <Icon icon={tab.icon} size="lg" />
                            {!!badge && (
                                <span className={tab.label === 'You' ? styles.badge : styles.dot}>
                                    {tab.label === 'You' ? (badge > 9 ? '9+' : badge) : ''}
                                </span>
                            )}
                        </span>
                        <span>{tab.label}</span>
                    </button>
                );
            })}
        </nav>
    );
};
