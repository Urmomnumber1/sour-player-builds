import { useEffect } from 'react';

import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { getSongById } from '/@/renderer/features/player/utils';
import { isPodcast } from '/@/renderer/features/sour/podcasts/podcast-id';
import { queryClient } from '/@/renderer/lib/react-query';
import { useAuthStore } from '/@/renderer/store';
import { LibraryItem } from '/@/shared/types/domain-types';

// Right-click a song anywhere (a friend's song, the song of the day, a feed post, a duel, a profile's
// favourites...) and get the same menu as in the song lists. Whatever shows a song carries data-song-id
// (SongCover does); right-clicking the name next to it works too.

const songAt = (target: Element | null): null | string => {
    if (!target) return null;
    const own = target.closest('[data-song-id]');
    if (own) return own.getAttribute('data-song-id');
    // a row with one song in it (its cover next to its name and artist)
    let el: Element | null = target;
    for (let i = 0; i < 4 && el && el !== document.body; i++, el = el.parentElement) {
        const found = el.querySelectorAll('[data-song-id]');
        if (found.length === 1) return found[0].getAttribute('data-song-id');
        if (found.length > 1) return null;
    }
    return null;
};

export const SongMenuAnywhere = () => {
    useEffect(() => {
        const onMenu = (e: MouseEvent) => {
            if (e.defaultPrevented) return; // a list or card with its own menu took it
            const target = e.target as Element | null;
            if (target?.closest?.('input, textarea, [contenteditable="true"]')) return;
            const id = songAt(target);
            if (!id || isPodcast({ id })) return;
            const serverId = useAuthStore.getState().currentServer?.id;
            if (!serverId) return;
            e.preventDefault();
            const at = { clientX: e.clientX, clientY: e.clientY, preventDefault: () => undefined };
            getSongById({ id, queryClient, serverId })
                .then((res) => {
                    if (!res.items.length) return;
                    ContextMenuController.call({
                        cmd: { items: res.items, type: LibraryItem.SONG },
                        event: at as unknown as React.MouseEvent<unknown>,
                    });
                })
                .catch(() => undefined);
        };
        document.addEventListener('contextmenu', onMenu);
        return () => document.removeEventListener('contextmenu', onMenu);
    }, []);
    return null;
};
