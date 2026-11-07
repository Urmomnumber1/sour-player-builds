import { useEffect, useState } from 'react';

import styles from './ios-welcome.module.css';

import { sourMedia } from '/@/renderer/features/sour/mobile/android';

interface Saved {
    failed: string;
    known: string[];
    url: string;
}

const shown = (url: string) => url.replace(/^https?:\/\//, '');

// 100.64.0.0/10 or *.ts.net
const isTailscale = (url: string) => {
    const host = shown(url).split(/[:/]/)[0];
    const p = host.split('.').map(Number);
    return (
        host.endsWith('.ts.net') || (p.length === 4 && p[0] === 100 && p[1] >= 64 && p[1] <= 127)
    );
};

// The iPhone app's first screen: where your Hermes Music is. The app then runs Sour Player from
// there (see setServer in SourMedia.swift), so your music server works and updates come with Hermes.
// When the saved Hermes Music can't be reached (Tailscale off, away from home, Hermes restarting),
// the app comes back here: it says so and keeps trying, and opens Sour Player once it answers.
export const IosWelcome = () => {
    const [address, setAddress] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [errorCode, setErrorCode] = useState('');
    const [saved, setSaved] = useState<null | Saved>(null);
    const [changing, setChanging] = useState(false);

    useEffect(() => {
        sourMedia('savedServer')
            .then((s: Saved) => s?.url && setSaved(s))
            .catch(() => undefined);
    }, []);

    // keep trying the saved one quietly, and right away when the app comes back to the front
    useEffect(() => {
        if (!saved?.url || changing) return undefined;
        const retry = () => {
            sourMedia('setServer', { url: saved.url }).catch(() => undefined);
        };
        const timer = window.setInterval(retry, 6000);
        const onVisible = () => document.visibilityState === 'visible' && retry();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [saved, changing]);

    const connect = async (url: string) => {
        if (!url.trim()) return;
        setBusy(true);
        setError('');
        setErrorCode('');
        try {
            await sourMedia('setServer', { url: url.trim() });
        } catch (e) {
            setError((e as Error).message);
            setErrorCode(String((e as { code?: string }).code || ''));
            setBusy(false);
        }
    };

    const settingsButton = errorCode === 'local' && (
        <button
            className={styles.secondary}
            onClick={() => sourMedia('openSettings').catch(() => undefined)}
            type="button"
        >
            Open Settings
        </button>
    );

    if (saved?.url && !changing) {
        const others = saved.known.filter((k) => k !== saved.url);
        return (
            <div className={styles.screen}>
                <div className={styles.card}>
                    <img alt="" className={styles.icon} src="./assets/512x512.png" />
                    <h1 className={styles.titleSmall}>Can&#39;t reach Hermes Music</h1>
                    <p className={styles.lead}>
                        {shown(saved.url)}
                        <br />
                        {isTailscale(saved.url)
                            ? "Is Tailscale on? SideStore's VPN switches it off."
                            : 'Is the phone on your home Wi-Fi?'}
                    </p>
                    <p className={styles.hint}>
                        Sour Player keeps trying and opens by itself as soon as Hermes Music
                        answers.
                        {saved.failed ? ` (${saved.failed})` : ''}
                    </p>
                    {error && <p className={styles.error}>{error}</p>}
                    <button
                        className={styles.button}
                        disabled={busy}
                        onClick={() => connect(saved.url)}
                        type="button"
                    >
                        {busy ? 'Connecting...' : 'Try again'}
                    </button>
                    {settingsButton}
                    {others.map((k) => (
                        <button
                            className={styles.secondary}
                            disabled={busy}
                            key={k}
                            onClick={() => connect(k)}
                            type="button"
                        >
                            Use {shown(k)}
                        </button>
                    ))}
                    <button
                        className={styles.secondary}
                        onClick={() => {
                            setChanging(true);
                            setError('');
                            setErrorCode('');
                        }}
                        type="button"
                    >
                        Use a different address
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.screen}>
            <div className={styles.card}>
                <img alt="" className={styles.icon} src="./assets/512x512.png" />
                <h1 className={styles.title}>Sour Player</h1>
                <p className={styles.lead}>Your music, from Hermes Music.</p>
                <label className={styles.label} htmlFor="sour-hermes">
                    Hermes Music address
                </label>
                <input
                    autoCapitalize="off"
                    autoComplete="url"
                    autoCorrect="off"
                    className={styles.input}
                    id="sour-hermes"
                    inputMode="url"
                    onChange={(e) => setAddress(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === 'Enter' && connect(address)}
                    placeholder="umbrel.local:3340"
                    value={address}
                />
                <p className={styles.hint}>
                    The address of your Hermes Music page: umbrel.local:3340 or the Umbrel&#39;s IP
                    with :3340 at home. Your Umbrel&#39;s Tailscale address (100.x.x.x:3340) works
                    at home and away while Tailscale is on.
                </p>
                {error && <p className={styles.error}>{error}</p>}
                <button
                    className={styles.button}
                    disabled={busy || !address.trim()}
                    onClick={() => connect(address)}
                    type="button"
                >
                    {busy ? 'Connecting...' : 'Connect'}
                </button>
                {settingsButton}
                {saved?.url && (
                    <button
                        className={styles.secondary}
                        onClick={() => {
                            setChanging(false);
                            setError('');
                            setErrorCode('');
                        }}
                        type="button"
                    >
                        Back to {shown(saved.url)}
                    </button>
                )}
            </div>
        </div>
    );
};
