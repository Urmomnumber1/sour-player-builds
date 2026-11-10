import {
    PersistedClient,
    Persister,
    PersistQueryClientProvider,
} from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import isElectron from 'is-electron';
import { createRoot } from 'react-dom/client';

import { App } from '/@/renderer/app';
import { queryClient } from '/@/renderer/lib/react-query';

function createIDBPersister(idbValidKey: IDBValidKey = 'reactQuery') {
    return {
        persistClient: async (client: PersistedClient) => {
            set(idbValidKey, client);
        },
        removeClient: async () => {
            await del(idbValidKey);
        },
        restoreClient: async () => {
            return await get<PersistedClient>(idbValidKey);
        },
    } as Persister;
}

const indexedDbPersister = createIDBPersister('feishin');

// The iPhone app and the browser version run from Hermes Music, which swaps in each new web build.
// A page that was open across that asks for parts of the old build that are gone: load the new one
// (at most once a minute, so a part that's really missing can't loop).
window.addEventListener('vite:preloadError', (event) => {
    try {
        const last = Number(sessionStorage.getItem('sour-reloaded') || 0);
        if (Date.now() - last < 60000) return;
        sessionStorage.setItem('sour-reloaded', String(Date.now()));
    } catch {
        // no sessionStorage: reload anyway
    }
    event.preventDefault();
    window.location.reload();
});

// The desktop app behaves like an app, not a web page: the interface isn't selectable text, buttons keep the
// arrow pointer, pictures can't be dragged out (sour-desktop.css)
if (isElectron()) document.documentElement.classList.add('sour-desktop-app');

createRoot(document.getElementById('root')!).render(
    <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
            buster: 'feishin',
            dehydrateOptions: {
                shouldDehydrateQuery: (query) => {
                    const isSuccess = query.state.status === 'success';
                    const isLyricsQueryKey =
                        query.queryKey.includes('song') &&
                        query.queryKey.includes('lyrics') &&
                        query.queryKey.includes('select');

                    // only lyrics from the last 30 days: the whole set is written again on every change, and
                    // after months of listening that was megabytes each time
                    const recent = query.state.dataUpdatedAt > Date.now() - 30 * 86400000;
                    return isSuccess && isLyricsQueryKey && recent;
                },
            },
            hydrateOptions: {
                defaultOptions: {
                    queries: {
                        gcTime: Infinity,
                    },
                },
            },
            maxAge: Infinity,
            persister: indexedDbPersister,
        }}
    >
        <App />
    </PersistQueryClientProvider>,
);
