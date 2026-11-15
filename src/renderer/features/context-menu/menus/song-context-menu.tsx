import { useMemo } from 'react';

import { AddToPlaylistAction } from '/@/renderer/features/context-menu/actions/add-to-playlist-action';
import { DownloadAction } from '/@/renderer/features/context-menu/actions/download-action';
import { EditMetadataAction } from '/@/renderer/features/context-menu/actions/edit-metadata-action';
import { GetInfoAction } from '/@/renderer/features/context-menu/actions/get-info-action';
import { GoToAction } from '/@/renderer/features/context-menu/actions/go-to-action';
import { PlayAction } from '/@/renderer/features/context-menu/actions/play-action';
import { PlayTrackRadioAction } from '/@/renderer/features/context-menu/actions/play-track-radio-action';
import { SetFavoriteAction } from '/@/renderer/features/context-menu/actions/set-favorite-action';
import { SetRatingAction } from '/@/renderer/features/context-menu/actions/set-rating-action';
import { ShareAction } from '/@/renderer/features/context-menu/actions/share-action';
import { ShowInFileExplorerAction } from '/@/renderer/features/context-menu/actions/show-in-file-explorer-action';
import { ContextMenuPreview } from '/@/renderer/features/context-menu/components/context-menu-preview';
import { AddToGroupAction } from '/@/renderer/features/group-play/components/add-to-group-action';
import { SongDnaAction } from '/@/renderer/features/sour/components/extras10';
import { PlayAfterAlbumAction } from '/@/renderer/features/sour/components/playback10';
import { SocialSongMenu } from '/@/renderer/features/sour/components/social-song-actions';
import {
    AddToProfileAction,
    BlockArtistAction,
    HideFromActivityAction,
    ShareSongAction,
    SongNoteAction,
    WhoElseLikesAction,
} from '/@/renderer/features/sour/components/song-actions';
import { RemoveSongAction, WrongSongAction } from '/@/renderer/features/sour/components/song-fix';
import { CopyToBotAction } from '/@/renderer/features/sour/discord-bot/bot-library';
import { useSimpleMode } from '/@/renderer/features/sour/store/sour.store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { LibraryItem, Song } from '/@/shared/types/domain-types';

interface SongContextMenuProps {
    items: Song[];
    type: LibraryItem.SONG;
}

export const SongContextMenu = ({ items, type }: SongContextMenuProps) => {
    const simple = useSimpleMode();
    const { ids } = useMemo(() => {
        const ids = items.map((item) => item.id);
        return { ids };
    }, [items]);

    return (
        <ContextMenu.Content
            bottomStickyContent={<ContextMenuPreview items={items} itemType={type} />}
        >
            <PlayAction ids={ids} itemType={LibraryItem.SONG} songs={items} />
            <PlayTrackRadioAction disabled={items.length > 1} song={items[0]} />
            <ContextMenu.Divider />
            <AddToPlaylistAction items={ids} itemType={LibraryItem.SONG} />
            {!simple && (
                <>
                    <AddToGroupAction songs={items} />
                    <SocialSongMenu songs={items} />
                </>
            )}
            <ContextMenu.Divider />
            <SetFavoriteAction ids={ids} itemType={LibraryItem.SONG} />
            {!simple && <SetRatingAction ids={ids} itemType={LibraryItem.SONG} />}
            <ContextMenu.Divider />
            <DownloadAction ids={ids} songs={items} />
            <GoToAction items={items} />
            {!simple && <WrongSongAction songs={items} />}
            <ContextMenu.Divider />
            {/* 0.14: the rest, one step in (the menu was two dozen items long) */}
            <ContextMenu.Submenu>
                <ContextMenu.SubmenuTarget>
                    <ContextMenu.Item leftIcon="ellipsisHorizontal" rightIcon="arrowRightS">
                        More
                    </ContextMenu.Item>
                </ContextMenu.SubmenuTarget>
                <ContextMenu.SubmenuContent>
                    {!simple && (
                        <>
                            <AddToProfileAction songs={items} />
                            <SongDnaAction songs={items} />
                            <PlayAfterAlbumAction songs={items} />
                            <ShareSongAction songs={items} />
                            <WhoElseLikesAction songs={items} />
                            <SongNoteAction songs={items} />
                            <HideFromActivityAction songs={items} />
                            <BlockArtistAction songs={items} />
                        </>
                    )}
                    <ShareAction ids={ids} itemType={LibraryItem.SONG} />
                    <ShowInFileExplorerAction items={items} />
                    {!simple && <EditMetadataAction songs={items} />}
                    {!simple && <CopyToBotAction songs={items} />}
                    {!simple && <RemoveSongAction songs={items} />}
                </ContextMenu.SubmenuContent>
            </ContextMenu.Submenu>
            <GetInfoAction disabled={items.length === 0} items={items} />
        </ContextMenu.Content>
    );
};
