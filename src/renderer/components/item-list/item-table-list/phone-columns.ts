import { ItemTableListColumnConfig } from '/@/renderer/components/item-list/types';
import { LibraryItem } from '/@/shared/types/domain-types';
import { TableColumn } from '/@/shared/types/types';

// Sour Player on a phone: song lists look like a phone music app, one row per song with the cover,
// the title and the artist, and a ... button for the menu. No header, no columns to line up.

export const PHONE_ROW_HEIGHT = 64;

const col = (
    id: TableColumn,
    width: number,
    extra?: Partial<ItemTableListColumnConfig>,
): ItemTableListColumnConfig => ({
    align: 'start',
    autoSize: false,
    id,
    isEnabled: true,
    pinned: null,
    width,
    ...extra,
});

// the cover is drawn inside the title for these
const COMBINED = new Set<string>([
    LibraryItem.ALBUM,
    LibraryItem.FOLDER,
    LibraryItem.PLAYLIST_SONG,
    LibraryItem.QUEUE_SONG,
    LibraryItem.SONG,
]);

// a cover next to a plain title for these
const IMAGE_TITLE = new Set<string>([
    LibraryItem.ALBUM_ARTIST,
    LibraryItem.ARTIST,
    LibraryItem.PLAYLIST,
]);

export const phoneTableColumns = (
    columns: ItemTableListColumnConfig[],
    itemType: LibraryItem | string,
    variant?: 'album',
): ItemTableListColumnConfig[] | null => {
    const enabled = (id: TableColumn) => columns.some((c) => c.id === id && c.isEnabled);
    const actions = col(TableColumn.ACTIONS, 44, { align: 'center', pinned: 'right' });
    // a playlist being reordered keeps its drag handle
    const reorder = enabled(TableColumn.PLAYLIST_REORDER)
        ? [col(TableColumn.PLAYLIST_REORDER, 40, { align: 'center', pinned: 'left' })]
        : [];

    // an album's own page: every song has the same cover, so the track number instead
    if (variant === 'album' && COMBINED.has(itemType)) {
        return [
            col(TableColumn.TRACK_NUMBER, 40, { align: 'center' }),
            col(TableColumn.TITLE_ARTIST, 200, { autoSize: true }),
            actions,
        ];
    }
    if (COMBINED.has(itemType)) {
        return [...reorder, col(TableColumn.TITLE_COMBINED, 200, { autoSize: true }), actions];
    }
    if (IMAGE_TITLE.has(itemType)) {
        return [
            ...reorder,
            col(TableColumn.IMAGE, PHONE_ROW_HEIGHT, { align: 'center' }),
            col(TableColumn.TITLE, 200, { autoSize: true }),
            actions,
        ];
    }
    if (itemType === LibraryItem.GENRE) {
        return [col(TableColumn.TITLE, 200, { autoSize: true }), actions];
    }
    return null;
};

export const isPhoneUi = () =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('sour-phone');
