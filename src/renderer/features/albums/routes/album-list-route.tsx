import { lazy, Suspense, useMemo, useState } from 'react';
import { useParams } from 'react-router';

import { ListContext } from '/@/renderer/context/list-context';
import { AlbumListContent } from '/@/renderer/features/albums/components/album-list-content';
import { AlbumListHeader } from '/@/renderer/features/albums/components/album-list-header';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { ListWithSidebarContainer } from '/@/renderer/features/shared/components/list-with-sidebar-container';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { usePageSidebar } from '/@/renderer/store/app.store';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { AlbumListQuery } from '/@/shared/types/domain-types';
import { ItemListKey } from '/@/shared/types/types';

const SourLibrary = lazy(() => import('/@/renderer/features/sour/routes/sour-library-route'));

const AlbumTabs = ({
    onChange,
    value,
}: {
    onChange: (v: 'albums' | 'tools') => void;
    value: string;
}) => (
    <div style={{ padding: '10px 16px 0' }}>
        <SegmentedControl
            data={[
                { label: 'Albums', value: 'albums' },
                { label: 'Tools', value: 'tools' },
            ]}
            onChange={(v) => onChange(v as 'albums' | 'tools')}
            size="xs"
            value={value}
        />
    </div>
);

const getPageKey = (options: { albumArtistId?: string; genreId?: string }) => {
    if (options.albumArtistId) {
        return ItemListKey.ALBUM_ARTIST_ALBUM;
    }

    if (options.genreId) {
        return ItemListKey.GENRE_ALBUM;
    }

    return ItemListKey.ALBUM;
};

const AlbumListRoute = () => {
    const { albumArtistId, genreId } = useParams();
    const pageKey = getPageKey({ albumArtistId, genreId });

    const [itemCount, setItemCount] = useState<number | undefined>(undefined);
    const [isSidebarOpen, setIsSidebarOpen] = usePageSidebar(pageKey);
    // the v0.10 look: Sour Library's wall, timeline, folders and tools live in an Albums > Tools tab
    const ui = useSourStore((state) => state.look.ui ?? 'liquid');
    const canTools = ui === 'liquid' && pageKey === ItemListKey.ALBUM;
    const [tools, setTools] = useState<'albums' | 'tools'>(() =>
        window.location.hash.includes('tab=tools') ? 'tools' : 'albums',
    );
    const showTools = canTools && tools === 'tools';

    const customFilters: Partial<AlbumListQuery> = useMemo(() => {
        if (albumArtistId) {
            return {
                artistIds: [albumArtistId],
            };
        }

        if (genreId) {
            return {
                genreIds: [genreId],
            };
        }

        return {};
    }, [albumArtistId, genreId]);

    const providerValue = useMemo(() => {
        return {
            customFilters,
            id: albumArtistId ?? genreId,
            isSidebarOpen,
            itemCount,
            pageKey,
            setIsSidebarOpen,
            setItemCount,
        };
    }, [
        albumArtistId,
        customFilters,
        genreId,
        isSidebarOpen,
        itemCount,
        pageKey,
        setIsSidebarOpen,
    ]);

    if (showTools) {
        return (
            <AnimatedPage>
                <AlbumTabs onChange={setTools} value="tools" />
                <Suspense fallback={null}>
                    <SourLibrary />
                </Suspense>
            </AnimatedPage>
        );
    }

    return (
        <AnimatedPage>
            {canTools && <AlbumTabs onChange={setTools} value="albums" />}
            <ListContext.Provider value={providerValue}>
                <AlbumListHeader />
                <ListWithSidebarContainer>
                    <AlbumListContent />
                </ListWithSidebarContainer>
            </ListContext.Provider>
        </AnimatedPage>
    );
};

const AlbumListRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <AlbumListRoute />
        </PageErrorBoundary>
    );
};

export default AlbumListRouteWithBoundary;
