import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

import { store } from './features/core/settings';
import log from './logger';

import { CITRUS_BUILD } from '/@/shared/citrus';
import {
    isNewerVersion,
    isOpenFor,
    opensForEveryone,
    pickRelease,
    releaseOpensAt,
    type RingRelease,
    sameLine,
    type UpdateRing,
} from '/@/shared/update-rings';

// Hermes Music edition (Windows, Linux AppImage/deb): updates download in the background and
// the app shows an Update button; clicking it restarts into the new version. Otherwise the update
// installs when Sour Player closes. Checks again every 30 minutes while it is open.
//
// (0.16) Updates in rings (see shared/update-rings): admins take the newest release at once, everyone else
// the newest one that has opened for everyone (from the Saturday after it was published). The releases are
// read from GitHub's list and the updater is pointed at the one to take. If that way of updating fails three
// times in a row (counted across restarts), the updater goes back to its own check of the newest release,
// held to the same rule by that release's date - so a problem here can never leave anyone without updates.
interface HermesUpdate {
    percent?: number;
    state: 'downloading' | 'ready';
    version: string;
}

interface Release extends RingRelease {
    assets: { name: string }[];
    prerelease?: boolean;
}

const REPO = 'Urmomnumber1/feishin';
const RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const CHANNEL = CITRUS_BUILD ? 'citrus' : 'latest';
const FAILURES = 'sour_update_failures';
// the file each system's updater reads (latest.yml, latest-linux.yml, citrus.yml...)
const feedFile = () =>
    process.platform === 'linux'
        ? `${CHANNEL}-linux.yml`
        : process.platform === 'darwin'
          ? `${CHANNEL}-mac.yml`
          : `${CHANNEL}.yml`;

let hermesUpdate: HermesUpdate | null = null;
// a newer release that hasn't opened for this person yet (the app can say when it comes)
let waiting: null | { opensAt: number; version: string } = null;

const ring = (): UpdateRing => (store.get('sour_update_ring') === 'admin' ? 'admin' : 'everyone');
const failures = () => Number(store.get(FAILURES, 0)) || 0;

export function startHermesUpdater(options: {
    beforeInstall: () => void;
    getWindow: () => BrowserWindow | null | undefined;
}) {
    const send = (update: HermesUpdate | null) => {
        hermesUpdate = update;
        options.getWindow()?.webContents.send('hermes-update', update);
    };

    let checking = false;
    let again = 0;

    autoUpdater.autoDownload = true;
    autoUpdater.on('update-available', (info) =>
        send({ percent: 0, state: 'downloading', version: info.version }),
    );
    autoUpdater.on('download-progress', (progress) => {
        const percent = Math.floor(progress.percent);
        if (hermesUpdate?.state === 'downloading' && percent !== hermesUpdate.percent) {
            send({ ...hermesUpdate, percent });
        }
    });
    autoUpdater.on('update-downloaded', (info) => {
        store.set(FAILURES, 0);
        send({ state: 'ready', version: info.version });
    });
    // a download that broke off: not "downloading" forever. Counted, and tried again in a few minutes
    autoUpdater.on('error', (err) => {
        log.warn('Updater error', err);
        if (hermesUpdate?.state !== 'downloading') return;
        store.set(FAILURES, failures() + 1);
        send(null);
        clearTimeout(again);
        again = setTimeout(() => void check(), 3 * 60 * 1000) as unknown as number;
    });
    ipcMain.handle('hermes-update-state', () => hermesUpdate);
    ipcMain.handle('hermes-update-waiting', () => waiting);
    ipcMain.on('hermes-update-install', () => {
        if (hermesUpdate?.state !== 'ready') return;
        log.info('Installing update', { version: hermesUpdate.version });
        options.beforeInstall();
        autoUpdater.quitAndInstall(true, true);
    });

    // the updater's own check of the newest release (the way before 0.16), held to the rule by its date
    const plainCheck = async () => {
        autoUpdater.setFeedURL({
            channel: CHANNEL,
            owner: REPO.split('/')[0],
            provider: 'github',
            repo: REPO.split('/')[1],
        });
        autoUpdater.autoDownload = false;
        const result = await autoUpdater.checkForUpdates();
        const info = result?.updateInfo;
        if (!result?.isUpdateAvailable || !info) return;
        // (0.16.1) a small update of the version this already is needs no test week
        if (isOpenFor(ring(), info.releaseDate) || sameLine(info.version, app.getVersion())) {
            waiting = null;
            await autoUpdater.downloadUpdate();
        } else {
            waiting = { opensAt: opensForEveryone(info.releaseDate), version: info.version };
        }
    };

    // GitHub's list of releases: the newest one this person may take
    const ringCheck = async () => {
        const res = await fetch(RELEASES, { headers: { accept: 'application/vnd.github+json' } });
        if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
        const all = (await res.json()) as Release[];
        if (!Array.isArray(all)) throw new Error('GitHub sent no list');
        const file = feedFile();
        // this app's releases (v0.16.1...; the phone apps' and the iPhone app's have their own tags)
        const mine = all.filter(
            (r) =>
                /^v\d/.test(r.tag_name) && !r.prerelease && r.assets?.some((a) => a.name === file),
        );
        const current = app.getVersion();
        const target = pickRelease(mine, ring(), Date.now(), current);
        const newest = pickRelease(mine, 'admin');
        waiting =
            newest && newest !== target && isNewerVersion(newest.tag_name, current)
                ? {
                      opensAt: releaseOpensAt(newest, mine, current),
                      version: newest.tag_name.replace(/^v/, ''),
                  }
                : null;
        if (!target || !isNewerVersion(target.tag_name, current)) return;
        log.info('Update to take', { ring: ring(), version: target.tag_name });
        autoUpdater.setFeedURL({
            channel: CHANNEL,
            provider: 'generic',
            url: `https://github.com/${REPO}/releases/download/${target.tag_name}/`,
        });
        autoUpdater.autoDownload = true;
        await autoUpdater.checkForUpdates();
    };

    const check = async () => {
        if (checking || hermesUpdate) return;
        checking = true;
        try {
            if (failures() >= 3) await plainCheck();
            else await ringCheck();
            // (a download that started counts as fine here; its own trouble comes through "error")
            if (!hermesUpdate) store.set(FAILURES, 0);
        } catch (err) {
            store.set(FAILURES, failures() + 1);
            log.warn('Check for updates failed', err);
        } finally {
            checking = false;
        }
    };

    // the page says who this is once the profile is known (kept for the next start)
    ipcMain.on('sour-update-ring', (_event, value: string) => {
        const next: UpdateRing = value === 'admin' ? 'admin' : 'everyone';
        if (store.get('sour_update_ring') === next) return;
        store.set('sour_update_ring', next);
        log.info('Update ring', { ring: next });
        if (next === 'admin') void check();
    });

    void check();
    setInterval(
        () => {
            if (!hermesUpdate) void check();
        },
        30 * 60 * 1000,
    );
}
