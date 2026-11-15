import { closeModal, openModal } from '@mantine/modals';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

import styles from './version-picker.module.css';

import { api } from '/@/renderer/api';
import { type GroupSong } from '/@/renderer/features/group-play/store/group-play.store';
import { SongPicker } from '/@/renderer/features/sour/components/song-picker';
import { useMyProfile, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import {
    splitEars,
    swapEars,
    switchVersion,
    useDeck,
} from '/@/renderer/features/sour/versions/version-deck';
import {
    findVersion,
    inStep,
    loadVersions,
    myPlays,
    ORIGINAL,
    type SongVersion,
    startWithVersion,
    useLoaded,
    useSongVersions,
    type VersionedSong,
    versionLabel,
    versionsApi,
    versionsOf,
} from '/@/renderer/features/sour/versions/versions';
import { queryClient } from '/@/renderer/lib/react-query';
import { usePlayerSong } from '/@/renderer/store';
import { setAskBeforePlaying, usePlayerStoreBase } from '/@/renderer/store/player.store';
import { useSettingsStore } from '/@/renderer/store/settings.store';
import { Button } from '/@/shared/components/button/button';
import { DropdownMenu } from '/@/shared/components/dropdown-menu/dropdown-menu';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { type QueueSong, type Song } from '/@/shared/types/domain-types';
import { PlayerType } from '/@/shared/types/types';

// Sour Player 0.15: "Which version?" (starting a song that has versions), the versions of the song that's playing
// (switch, split ears), and the admins' tools for them.

const time = (s: number) =>
    s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '';

const VERSION_PICKER = 'sour-version-picker';

// the version you hear of the song that's playing
const useHeard = (song?: null | QueueSong) => {
    const uid = song?._uniqueId;
    const deck = useDeck();
    const loaded = useLoaded((s) => (uid ? s.v[uid] : undefined)) ?? ORIGINAL;
    return {
        hear: (deck.uid === uid && deck.hear) || loaded,
        hold: deck.uid === uid ? deck.hold : null,
        loaded,
        split: deck.uid === uid ? deck.split : null,
        swap: deck.swap,
    };
};

const askText = (
    title: string,
    label: string,
    initial: string,
    save: (text: string) => Promise<unknown>,
) => {
    const id = `sour-ask-${Date.now()}`;
    const Form = () => {
        const [text, setText] = useState(initial);
        const [busy, setBusy] = useState(false);
        const go = async () => {
            setBusy(true);
            try {
                await save(text.trim());
                closeModal(id);
            } catch (e) {
                toast.error({ message: (e as Error).message });
            } finally {
                setBusy(false);
            }
        };
        return (
            <Stack gap="sm">
                <TextInput
                    autoFocus
                    label={label}
                    onChange={(e) => setText(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === 'Enter' && go()}
                    value={text}
                />
                <Group justify="flex-end">
                    <Button loading={busy} onClick={go} variant="filled">
                        Save
                    </Button>
                </Group>
            </Stack>
        );
    };
    openModal({ children: <Form />, modalId: id, title });
};

const refresh = () => void loadVersions().catch(() => undefined);

const VersionTools = ({ entry, v }: { entry: VersionedSong; v: SongVersion }) => {
    const me = useSourStore((s) => s.me);
    const admin = !!useMyProfile().data?.admin;
    const mine = !!me && v.profile === me.id;
    const run = (work: () => Promise<unknown>, done: string) =>
        work()
            .then(() => {
                toast.success({ message: done });
                refresh();
            })
            .catch((e: Error) => toast.error({ message: e.message }));
    return (
        <DropdownMenu position="bottom-end">
            <DropdownMenu.Target>
                <Button aria-label="More" p="0" size="compact-sm" variant="subtle" w={30}>
                    <Icon icon="ellipsisHorizontal" />
                </Button>
            </DropdownMenu.Target>
            <DropdownMenu.Dropdown>
                {v.link && (
                    <DropdownMenu.Item
                        leftSection={<Icon icon="externalLink" />}
                        onClick={() => window.open(v.link ?? '', '_blank', 'noopener')}
                    >
                        Where it came from
                    </DropdownMenu.Item>
                )}
                <DropdownMenu.Item
                    leftSection={<Icon icon="musicVideo" />}
                    onClick={() =>
                        askText(
                            `A music video for ${v.label}`,
                            'YouTube link (empty: no video of its own)',
                            v.video ? `https://youtu.be/${v.video.videoId}` : '',
                            (link) =>
                                versionsApi.video(v.id, link).then(() => {
                                    toast.success({
                                        message: link
                                            ? 'Video set - Hermes Music lines it up in the background'
                                            : 'Video removed',
                                    });
                                    refresh();
                                }),
                        )
                    }
                >
                    {v.video ? 'Another video' : 'Add a video'}
                </DropdownMenu.Item>
                {(admin || mine) && (
                    <DropdownMenu.Item
                        leftSection={<Icon icon="edit" />}
                        onClick={() =>
                            askText('Rename the version', 'Name', v.label, (label) =>
                                versionsApi.rename(v.id, label).then(refresh),
                            )
                        }
                    >
                        Rename
                    </DropdownMenu.Item>
                )}
                {admin && (
                    <DropdownMenu.Item
                        leftSection={<Icon icon="arrowUpToLine" />}
                        onClick={() =>
                            run(
                                () => versionsApi.unlink(v.id),
                                `${v.label} is its own song again (it shows up after the next scan)`,
                            )
                        }
                    >
                        Make it its own song
                    </DropdownMenu.Item>
                )}
                {(admin || mine) && (
                    <DropdownMenu.Item
                        isDanger
                        leftSection={<Icon icon="delete" />}
                        onClick={() =>
                            run(
                                () => versionsApi.remove(v.id),
                                `Removed ${v.label} from ${entry.title}`,
                            )
                        }
                    >
                        Remove
                    </DropdownMenu.Item>
                )}
            </DropdownMenu.Dropdown>
        </DropdownMenu>
    );
};

// the list: "start" plays the song in the version clicked; "switch" changes what the song that's playing sounds like
export const VersionList = ({
    mode,
    onPicked,
    song,
}: {
    mode: 'start' | 'switch';
    onPicked?: (version: string) => void;
    song: QueueSong | Song;
}) => {
    const entry = useSongVersions(song);
    const playing = usePlayerSong();
    const current = mode === 'switch' && !!playing && playing.id === song.id;
    const heard = useHeard(current ? playing : null);
    const builtIn = useSettingsStore((s) => s.playback.type) === PlayerType.WEB;
    if (!entry) return <Text isMuted>{`${song.name} has no other versions yet.`}</Text>;
    const plays = myPlays(entry);
    const rows: { id: string; label: string; lineUp: boolean; seconds: number; v?: SongVersion }[] =
        [
            { id: ORIGINAL, label: 'Original', lineUp: true, seconds: (song.duration || 0) / 1000 },
            ...entry.versions.map((v) => ({
                id: v.id,
                label: v.label,
                lineUp: v.lineUp,
                seconds: v.seconds,
                v,
            })),
        ];
    const pick = (id: string) => {
        if (current) switchVersion(id);
        onPicked?.(id);
    };
    return (
        <div className={styles.list}>
            {rows.map((r) => {
                const on = current && heard.hear === r.id;
                const inSplit = current && heard.split === r.id;
                const together =
                    current &&
                    inStep(entry, r.id) &&
                    inStep(entry, heard.hear) &&
                    inStep(entry, heard.loaded);
                const sub = [
                    time(r.seconds),
                    // (it, or what's playing, doesn't line up: no switching in step)
                    current && !on && !(inStep(entry, r.id) && inStep(entry, heard.loaded))
                        ? 'starts from the top'
                        : '',
                    plays[r.id] ? `you played it ${plays[r.id]}x` : '',
                    r.v?.by ? `from ${r.v.by}` : '',
                    r.v?.video ? 'has its own video' : '',
                ]
                    .filter(Boolean)
                    .join(' · ');
                return (
                    <div className={clsx(styles.row, { [styles.on]: on || inSplit })} key={r.id}>
                        <button className={styles.main} onClick={() => pick(r.id)} type="button">
                            <span className={styles.play}>
                                <Icon icon={on ? 'audioLines' : 'mediaPlay'} />
                            </span>
                            <span className={styles.text}>
                                <span className={styles.label}>
                                    {r.label}
                                    {on && (
                                        <span className={styles.chip}>
                                            {heard.split
                                                ? heard.swap
                                                    ? 'right ear'
                                                    : 'left ear'
                                                : 'playing'}
                                        </span>
                                    )}
                                    {inSplit && (
                                        <span className={styles.chip}>
                                            {heard.swap ? 'left ear' : 'right ear'}
                                        </span>
                                    )}
                                    {current && heard.hold === r.id && (
                                        <span className={styles.chip}>starting...</span>
                                    )}
                                </span>
                                {sub && <span className={styles.sub}>{sub}</span>}
                            </span>
                        </button>
                        {current && builtIn && !on && (inSplit || together) && (
                            <Button
                                onClick={() => splitEars(inSplit ? null : r.id)}
                                size="compact-xs"
                                title={
                                    inSplit
                                        ? 'Back to one version'
                                        : `Hear ${heard.hear === ORIGINAL ? 'the original' : versionLabel(entry, heard.hear)} in one ear and ${r.label} in the other`
                                }
                                variant={inSplit ? 'filled' : 'default'}
                            >
                                {inSplit ? 'One at a time' : 'Both ears'}
                            </Button>
                        )}
                        {r.v && <VersionTools entry={entry} v={r.v} />}
                    </div>
                );
            })}
            {current && heard.split && (
                <Button onClick={swapEars} size="compact-xs" variant="subtle" w="fit-content">
                    <Icon icon="arrowLeftRight" /> Swap ears
                </Button>
            )}
        </div>
    );
};

const PickerBody = ({
    mode,
    onPicked,
    song,
}: {
    mode: 'start' | 'switch';
    onPicked?: (v: string) => void;
    song: QueueSong | Song;
}) => (
    <Stack gap="sm">
        <VersionList mode={mode} onPicked={onPicked} song={song} />
        <Group gap="xs" justify="space-between">
            <Text isMuted size="xs">
                {mode === 'start'
                    ? 'Albums, playlists and shuffle play the one you play most.'
                    : 'Versions that line up switch in step, mid-song.'}
            </Text>
            <Button
                onClick={() => {
                    closeModal(VERSION_PICKER);
                    void import('/@/renderer/features/hermes-request/components/request-button').then(
                        (m) => m.openRequestWindow({ versionOf: song as Song }),
                    );
                }}
                size="compact-xs"
                variant="subtle"
            >
                <Icon icon="plus" /> Request a version
            </Button>
        </Group>
    </Stack>
);

export const openVersionPicker = (
    song: QueueSong | Song,
    mode: 'start' | 'switch',
    onPicked?: (version: string) => void,
    onClose?: () => void,
) =>
    openModal({
        children: (
            <PickerBody
                mode={mode}
                onPicked={(v) => {
                    if (mode === 'start') closeModal(VERSION_PICKER);
                    onPicked?.(v);
                }}
                song={song}
            />
        ),
        modalId: VERSION_PICKER,
        onClose,
        size: 'md',
        title: mode === 'start' ? `Which version of ${song.name}?` : `${song.name}: versions`,
    });

// starting a song with versions asks which one first (cancelling plays nothing)
export const askVersionThen = (song: Song | undefined, go: () => void, cancel?: () => void) => {
    if (!song || !versionsOf(song)) {
        go();
        return;
    }
    let picked = false;
    openVersionPicker(
        song,
        'start',
        (version) => {
            picked = true;
            startWithVersion(song.id, version);
            go();
        },
        () => {
            if (!picked) cancel?.();
        },
    );
};
export const hasVersions = (song?: Song) => !!versionsOf(song);

// the same for songs started from Sour Player's own pages (store-level addToQueueByData); set up once Sour
// Player's root is on screen (VersionPrompt), not while the modules are still loading
export const VersionPrompt = () => {
    useEffect(() => {
        setAskBeforePlaying((song, go, cancel) => {
            if (!hasVersions(song)) return false;
            askVersionThen(song, go, cancel);
            return true;
        });
        return () => setAskBeforePlaying(null);
    }, []);
    return null;
};

// ---- the player bar: the tab in front of the song's name ----
export const VersionPill = ({ className }: { className?: string }) => {
    const song = usePlayerSong();
    const entry = useSongVersions(song);
    const heard = useHeard(song);
    // a version this list doesn't have yet (just added): fetch the list again
    const unknown = !!entry && heard.hear !== ORIGINAL && !findVersion(entry, heard.hear);
    useEffect(() => {
        if (unknown) refresh();
    }, [unknown]);
    if (!song || !entry) return null;
    const label = heard.split
        ? `${versionLabel(entry, heard.swap ? heard.split : heard.hear)} + ${versionLabel(entry, heard.swap ? heard.hear : heard.split)}`
        : versionLabel(entry, heard.hold ?? heard.hear);
    const click = (e: React.MouseEvent) => {
        e.stopPropagation();
        // one other version: straight over to it (and back); more: which one?
        if (entry.versions.length === 1 && !heard.split) {
            switchVersion(heard.hear === ORIGINAL ? entry.versions[0].id : ORIGINAL);
            return;
        }
        openVersionPicker(song, 'switch');
    };
    return (
        <button
            className={clsx(styles.pill, className)}
            onClick={click}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openVersionPicker(song, 'switch');
            }}
            title={
                entry.versions.length === 1
                    ? `Switch to ${heard.hear === ORIGINAL ? entry.versions[0].label : 'the original'} (right-click: all versions)`
                    : 'Versions of this song'
            }
            type="button"
        >
            <Icon icon="audioLines" size="xs" />
            <span>{label}</span>
        </button>
    );
};

// ---- admins: put a song under another ----
const PutUnder = ({ song }: { song: Song }) => {
    const [under, setUnder] = useState<GroupSong | null>(null);
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const go = async () => {
        if (!under) return;
        setBusy(true);
        try {
            const r = await versionsApi.link(
                song,
                { artist: under.artist, title: under.title },
                label.trim() || undefined,
            );
            closeModal('sour-put-under');
            toast.success({
                message: `${song.name} is now the "${r.label}" version of ${r.under.title} (it leaves the library after the next scan)`,
            });
            // out of the queue (its file moved), and out of the lists once the music server has looked
            const player = usePlayerStoreBase.getState();
            const inQueue = player.getQueue().items.filter((x) => x.id === song.id);
            if (inQueue.length) player.clearSelected(inQueue);
            api.controller
                .refreshItems({ apiClientProps: { serverId: song._serverId }, query: {} } as any)
                .catch(() => undefined);
            for (const ms of [4000, 15000])
                window.setTimeout(
                    () => void queryClient.invalidateQueries({ queryKey: [song._serverId] }),
                    ms,
                );
            refresh();
        } catch (e) {
            toast.error({ message: (e as Error).message });
        } finally {
            setBusy(false);
        }
    };
    return (
        <Stack gap="sm">
            <Text isMuted size="sm">
                {`${song.name} leaves the library and becomes a version of the song you pick: it plays from that song's versions instead.`}
            </Text>
            <SongPicker onPick={setUnder} picked={under} />
            <TextInput
                description="Empty: Hermes Music names it (from the title, e.g. Kasane Teto)"
                label="Name of the version"
                onChange={(e) => setLabel(e.currentTarget.value)}
                value={label}
            />
            <Group justify="flex-end">
                <Button
                    disabled={!under || under.id === song.id}
                    loading={busy}
                    onClick={go}
                    variant="filled"
                >
                    Put it under {under?.title ?? '...'}
                </Button>
            </Group>
        </Stack>
    );
};

export const openPutUnder = (song: Song) =>
    openModal({
        children: <PutUnder song={song} />,
        modalId: 'sour-put-under',
        size: 'lg',
        title: `Put ${song.name} under another song`,
    });
