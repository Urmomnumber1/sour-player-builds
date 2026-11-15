import type { Song } from '/@/shared/types/domain-types';

import {
    setAlbumOffline,
    setPlaylistOffline,
    setSongOffline,
} from '/@/renderer/features/sour/mobile/offline';
import { usePhoneStore } from '/@/renderer/features/sour/mobile/phone-store';
import { useCurrentServer } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';

export type OfflineKind = 'album' | 'playlist' | 'song';

// Phones: "Download" keeps a song, album or playlist in the app for listening offline (Library > Downloads),
// and takes it out again.
export const SaveOfflineAction = ({
    ids,
    kind,
    songs,
}: {
    ids: string[];
    kind: OfflineKind;
    songs?: Song[];
}) => {
    const serverId = useCurrentServer()?.id ?? '';
    const saved = usePhoneStore(
        (s) =>
            ids.length > 0 &&
            ids.every((id) =>
                kind === 'album'
                    ? !!s.offlineAlbums[id]
                    : kind === 'playlist'
                      ? !!s.offlinePlaylists[id]
                      : !!s.offlineSongs[id],
            ),
    );
    // a song that's already on the phone with its album, a playlist or the favourites
    const elsewhere = usePhoneStore(
        (s) => kind === 'song' && ids.length > 0 && ids.every((id) => !!s.offline[id]),
    );
    if (!serverId || !ids.length) return null;
    if (!saved && elsewhere)
        return (
            <ContextMenu.Item disabled leftIcon="check">
                Downloaded
            </ContextMenu.Item>
        );
    const onSelect = () => {
        if (kind === 'album') ids.forEach((id) => void setAlbumOffline(id, serverId, !saved));
        else if (kind === 'playlist')
            ids.forEach((id) => void setPlaylistOffline(id, serverId, !saved));
        else (songs ?? []).forEach((song) => void setSongOffline(song, !saved));
        toast.success({
            message: saved
                ? 'Removed from this phone'
                : 'Downloading. Find it in Library > Downloads (it plays without internet)',
        });
    };
    return (
        <ContextMenu.Item leftIcon={saved ? 'x' : 'download'} onSelect={onSelect}>
            {saved ? 'Remove download' : 'Download'}
        </ContextMenu.Item>
    );
};
