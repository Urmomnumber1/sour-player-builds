import { openModal } from '@mantine/modals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import isElectron from 'is-electron';
import { useEffect, useState } from 'react';

import packageJson from '../../../../../package.json';
import styles from './test-log.module.css';

import { useUpdateRing } from '/@/renderer/features/hermes-update/components/hermes-update-button';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { isAndroidApp } from '/@/renderer/features/sour/mobile/android';
import { isIphone } from '/@/renderer/features/sour/mobile/ios-look';
import { useMyProfile, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { Button } from '/@/shared/components/button/button';
import { Dialog } from '/@/shared/components/dialog/dialog';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { Textarea } from '/@/shared/components/textarea/textarea';
import { toast } from '/@/shared/components/toast/toast';
import { isNewerVersion } from '/@/shared/update-rings';

// Sour Player 0.16: updates in rings, and the admins' test log.
// Admins (of the music server) get every update as soon as it's published; everyone else from the Saturday
// after. Each update comes with a list of things to check: admins see it here (Sour > Test log, and a
// little window after an early update), mark each thing as working or broken, and see each other's marks.
// Hermes Music keeps the list (from the release's notes) and the marks; a "broken" with a note also lands in
// the bug reports.

const VERSION = packageJson.version;

interface TestItem {
    area: string;
    id: string;
    // the kinds of device it's for (desktop, android, iphone); none: everywhere
    on: string[];
    text: string;
}
interface TestLog {
    early: boolean;
    items: TestItem[];
    marks: Record<string, TestMark[]>;
    opensAt: number;
    version: string;
}
interface TestMark {
    at: number;
    name: string;
    note: string;
    ok: boolean;
    on: string;
    profile: string;
}

// this device, as the lists say it and as the marks show it
const deviceKind = () => (isIphone() ? 'iphone' : isAndroidApp() ? 'android' : 'desktop');
const deviceName = () => {
    if (isIphone()) return 'iPhone';
    if (isAndroidApp()) return 'Android';
    const ua = navigator.userAgent;
    return /windows/i.test(ua)
        ? 'Windows'
        : /linux/i.test(ua)
          ? 'Linux'
          : /mac/i.test(ua)
            ? 'Mac'
            : 'web';
};

export const useIsAdmin = () => !!useMyProfile().data?.admin;

const call = async (url: string, body: Record<string, unknown>): Promise<TestLog> => {
    const res = await fetch(`${url}/api/testlog`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Hermes Music returned ${res.status}`);
    return json as TestLog;
};

// the list for the version this app is (admins only; nothing on a Hermes Music older than 3.17)
export const useTestLog = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const admin = useIsAdmin();
    return useQuery({
        enabled: !!url && !!me && admin,
        queryFn: () => call(url, { key: me!.key, profile: me!.id, version: VERSION }),
        queryKey: ['sour-testlog', url, me?.id, VERSION],
        refetchInterval: 2 * 60000,
        retry: false,
        staleTime: 30000,
    });
};

const day = (at: number) =>
    new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', weekday: 'long' });

// what's left for this person to check on this device
export const useTestLogLeft = () => {
    const me = useSourStore((s) => s.me);
    const log = useTestLog().data;
    if (!log || !me) return 0;
    const kind = deviceKind();
    return log.items.filter(
        (i) =>
            (!i.on.length || i.on.includes(kind)) &&
            !(log.marks[i.id] || []).some((m) => m.profile === me.id),
    ).length;
};

const TestLogWindow = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const qc = useQueryClient();
    const query = useTestLog();
    const log = query.data;
    const [noteFor, setNoteFor] = useState<null | string>(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState<null | string>(null);
    const [others, setOthers] = useState(false);
    if (!me) return <Text isMuted>Set up your profile first.</Text>;
    if (query.isError)
        return (
            <Text isMuted size="sm">
                The test log needs Hermes Music 3.17 or newer (and an admin profile).
            </Text>
        );
    if (!log) return <Text isMuted>Loading...</Text>;
    const kind = deviceKind();
    const mark = (item: TestItem, ok: boolean | null, text = '') => {
        setBusy(item.id);
        call(url, {
            item: item.id,
            key: me.key,
            note: text,
            ok,
            on: deviceName(),
            profile: me.id,
            version: VERSION,
        })
            .then((fresh) => {
                qc.setQueryData(['sour-testlog', url, me.id, VERSION], fresh);
                if (ok === false && text)
                    toast.success({ message: 'Noted, and sent to the bug reports' });
            })
            .catch((e: Error) => toast.error({ message: e.message }))
            .finally(() => {
                setBusy(null);
                setNoteFor(null);
                setNote('');
            });
    };
    const here = log.items.filter((i) => !i.on.length || i.on.includes(kind));
    const elsewhere = log.items.filter((i) => i.on.length && !i.on.includes(kind));
    const mine = (i: TestItem) => (log.marks[i.id] || []).find((m) => m.profile === me.id);
    const done = here.filter((i) => mine(i)).length;
    const row = (i: TestItem) => {
        const my = mine(i);
        const rest = (log.marks[i.id] || []).filter((m) => m.profile !== me.id);
        return (
            <div
                className={clsx(styles.item, my && (my.ok ? styles.works : styles.broken))}
                key={i.id}
            >
                <div className={styles.what}>
                    <Text size="sm">{i.text}</Text>
                    {!!i.on.length && (
                        <Text isMuted size="xs">
                            For: {i.on.join(', ')}
                        </Text>
                    )}
                    {my?.note && (
                        <Text isMuted size="xs">
                            You: {my.note}
                        </Text>
                    )}
                    {rest.map((m) => (
                        <Text isMuted key={m.profile} size="xs">
                            {m.name} ({m.on || '?'}): {m.ok ? 'works' : 'broken'}
                            {m.note ? ` - ${m.note}` : ''}
                        </Text>
                    ))}
                    {noteFor === i.id && (
                        <Stack gap={6} mt={6}>
                            <Textarea
                                autoFocus
                                minRows={2}
                                onChange={(e) => setNote(e.currentTarget.value)}
                                placeholder="What went wrong? (it goes to the bug reports too)"
                                value={note}
                            />
                            <Group gap={6}>
                                <Button
                                    disabled={busy === i.id}
                                    onClick={() => mark(i, false, note.trim())}
                                    size="compact-xs"
                                    variant="filled"
                                >
                                    Save
                                </Button>
                                <Button
                                    onClick={() => setNoteFor(null)}
                                    size="compact-xs"
                                    variant="subtle"
                                >
                                    Cancel
                                </Button>
                            </Group>
                        </Stack>
                    )}
                </div>
                <Group gap={4} wrap="nowrap">
                    <Button
                        disabled={busy === i.id}
                        onClick={() => mark(i, my?.ok === true ? null : true)}
                        size="compact-xs"
                        variant={my?.ok === true ? 'filled' : 'default'}
                    >
                        Works
                    </Button>
                    <Button
                        disabled={busy === i.id}
                        onClick={() => {
                            if (my?.ok === false) return mark(i, null);
                            setNote('');
                            return setNoteFor(i.id);
                        }}
                        size="compact-xs"
                        variant={my?.ok === false ? 'filled' : 'default'}
                    >
                        Broken
                    </Button>
                </Group>
            </div>
        );
    };
    const areas = (list: TestItem[]) => [...new Set(list.map((i) => i.area || 'General'))];
    const section = (list: TestItem[]) =>
        areas(list).map((area) => (
            <Stack gap={6} key={area}>
                <Text fw={700} size="sm">
                    {area}
                </Text>
                {list.filter((i) => (i.area || 'General') === area).map(row)}
            </Stack>
        ));
    return (
        <Stack gap="md">
            <Text isMuted size="sm">
                Sour Player {log.version}.{' '}
                {log.early
                    ? `You have it early: everyone else gets it on ${day(log.opensAt)}. Check these before then.`
                    : 'Everyone has this update now.'}{' '}
                Your marks are shared with the other admins.
            </Text>
            {!log.items.length && (
                <Text isMuted size="sm">
                    This update came without a list of things to check.
                </Text>
            )}
            {!!here.length && (
                <Text fw={600} size="sm">
                    {done} of {here.length} checked on this {deviceName()}
                </Text>
            )}
            {section(here)}
            {!!elsewhere.length && (
                <Button onClick={() => setOthers(!others)} size="compact-xs" variant="subtle">
                    {others ? 'Hide' : 'Show'} what is for other devices ({elsewhere.length})
                </Button>
            )}
            {others && section(elsewhere)}
        </Stack>
    );
};

export const openTestLog = () =>
    openModal({
        children: <TestLogWindow />,
        modalId: 'sour-test-log',
        size: 'lg',
        title: `Test log: Sour Player ${VERSION}`,
    });

// (for everyone who isn't an admin) a newer Sour Player that is out but hasn't opened for them yet. Computers
// and the Android app know from their own updaters; the web app and iPhones ask Hermes Music.
export const useWaitingUpdate = () => {
    const url = useHermesUrl();
    const waiting = useUpdateRing((s) => s.waiting);
    const admin = useIsAdmin();
    const web = !isElectron() && !isAndroidApp();
    // (the time the page was opened is near enough: this is about days)
    const [now] = useState(() => Date.now());
    const asked = useQuery({
        enabled: !!url && web && !admin,
        queryFn: async () => {
            const res = await fetch(`${url}/api/updates`);
            if (!res.ok) return null;
            const json = (await res.json()) as {
                newest: null | { opensAt: number; version: string };
            };
            return json.newest;
        },
        queryKey: ['sour-updates', url],
        refetchInterval: 30 * 60000,
        retry: false,
        staleTime: 10 * 60000,
    }).data;
    if (admin) return null;
    const next = web ? asked : waiting;
    if (!next || !isNewerVersion(next.version, VERSION) || next.opensAt <= now) return null;
    return { on: day(next.opensAt), version: next.version };
};

const SEEN = 'sour-testlog-seen';

// Mounted once (sour-root). It tells the updaters who this is (admins take updates at once), marks the web
// app's requests for Hermes Music (which keeps the early copy for admins), and offers the test log to an
// admin once per update, while it's early.
export const UpdateRings = () => {
    const mine = useMyProfile().data;
    const admin = mine ? !!mine.admin : null;
    const log = useTestLog().data;
    const left = useTestLogLeft();
    const [asked, setAsked] = useState(() => {
        try {
            return localStorage.getItem(SEEN) === VERSION;
        } catch {
            return true;
        }
    });

    useEffect(() => {
        if (admin === null) return;
        useUpdateRing.setState({ ring: admin ? 'admin' : 'everyone' });
        if (isElectron()) window.api?.ipc?.send('sour-update-ring', admin ? 'admin' : 'everyone');
        else if (!isAndroidApp()) {
            // the web app (and the iPhone app, which shows it): Hermes Music reads this
            try {
                document.cookie = admin
                    ? 'sour_early=1; path=/; max-age=31536000; samesite=lax'
                    : 'sour_early=; path=/; max-age=0; samesite=lax';
            } catch {
                // no cookies here: the regular copy then
            }
        }
    }, [admin]);

    const close = () => {
        setAsked(true);
        try {
            localStorage.setItem(SEEN, VERSION);
        } catch {
            // asked again next time
        }
    };

    if (!admin || asked || !log?.early || !log.items.length || !left) return null;
    return (
        <Dialog
            onClose={close}
            opened
            position={{ bottom: 100, right: 12 }}
            radius="md"
            size="lg"
            withCloseButton
        >
            <Stack gap="sm">
                <Text fw={700}>You have Sour Player {VERSION} early</Text>
                <Text isMuted size="sm">
                    Admins get updates first. Everyone else gets this one on {day(log.opensAt)}:{' '}
                    {left} {left === 1 ? 'thing' : 'things'} to check before then.
                </Text>
                <Group justify="flex-end">
                    <Button onClick={close} size="xs" variant="default">
                        Later
                    </Button>
                    <Button
                        onClick={() => {
                            close();
                            openTestLog();
                        }}
                        size="xs"
                        variant="filled"
                    >
                        Open the test log
                    </Button>
                </Group>
            </Stack>
        </Dialog>
    );
};
