// A tiny key-value store in IndexedDB, for things too big for localStorage (which holds every setting
// and has only about 5 MB): your Sour Stage background, for one.
const DB = 'sour-player';
const STORE = 'kv';

const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

export const idbGet = async <T>(key: string): Promise<T | undefined> => {
    try {
        const db = await open();
        return await new Promise<T | undefined>((resolve) => {
            const req = db.transaction(STORE).objectStore(STORE).get(key);
            req.onsuccess = () => resolve(req.result as T | undefined);
            req.onerror = () => resolve(undefined);
        });
    } catch {
        return undefined;
    }
};

export const idbSet = async (key: string, value: unknown) => {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        if (value === undefined || value === null) tx.objectStore(STORE).delete(key);
        else tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};
