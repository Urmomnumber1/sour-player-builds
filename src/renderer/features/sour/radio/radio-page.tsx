import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { type CSSProperties, type MouseEvent, type ReactNode, useState } from 'react';

import styles from './radio-page.module.css';

import { getItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { NativeScrollArea } from '/@/renderer/components/native-scroll-area/native-scroll-area';
import { radioQueries } from '/@/renderer/features/radio/api/radio-api';
import { openCreateRadioStationModal } from '/@/renderer/features/radio/components/create-radio-station-form';
import { openEditRadioStationModal } from '/@/renderer/features/radio/components/edit-radio-station-form';
import { useRadioPlayer } from '/@/renderer/features/radio/hooks/use-radio-player';
import { useDeleteRadioStation } from '/@/renderer/features/radio/mutations/delete-radio-station-mutation';
import { RadioCard } from '/@/renderer/features/sour/components/home-sections';
import {
    findStations,
    forgetStation,
    isStationPlaying,
    myCountry,
    playStation,
    saveStation,
    type Station,
    stationHue,
    stopStation,
    useRadioPlus,
} from '/@/renderer/features/sour/radio/radio-plus';
import { useCurrentServer, usePermissions } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Icon } from '/@/shared/components/icon/icon';
import { closeAllModals, ConfirmModal, openModal } from '/@/shared/components/modal/modal';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { useDebouncedValue } from '/@/shared/hooks/use-debounced-value';
import { InternetRadioStation, LibraryItem } from '/@/shared/types/domain-types';

// The Radio page (0.13): what's on now, Sour Radio, your stations, the ones you played lately, and a
// directory of stations from all over the world to try and keep.

// the little dancing bars of a station that's playing
const Bars = ({ big, on }: { big?: boolean; on: boolean }) => (
    <span aria-hidden className={clsx(styles.bars, big && styles.bigBars, on && styles.barsOn)}>
        <i />
        <i />
        <i />
        <i />
    </span>
);

const StationArt = ({
    big,
    image,
    name,
}: {
    big?: boolean;
    image?: null | string;
    name: string;
}) => {
    const [broken, setBroken] = useState(false);
    const hue = stationHue(name);
    return (
        <span
            className={clsx(styles.art, big && styles.bigArt)}
            style={{ '--hue': hue } as CSSProperties}
        >
            {image && !broken ? (
                <img
                    alt=""
                    decoding="async"
                    loading="lazy"
                    onError={() => setBroken(true)}
                    src={image}
                />
            ) : (
                <span className={styles.initial}>{(name.trim()[0] || '?').toUpperCase()}</span>
            )}
        </span>
    );
};

const Tile = ({ actions, s }: { actions?: ReactNode; s: Station }) => {
    const { currentStreamUrl, isPlaying } = useRadioPlayer();
    const [busy, setBusy] = useState(false);
    const on = isStationPlaying(currentStreamUrl, s.url);
    const tags = (s.tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(' · ');
    const click = async () => {
        if (on) return stopStation();
        setBusy(true);
        try {
            await playStation(s);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className={clsx(styles.tile, on && styles.tileOn)}>
            <button className={styles.tileMain} onClick={click} type="button">
                <StationArt image={s.image} name={s.name} />
                <span className={styles.tileText}>
                    <span className={styles.tileName}>{s.name}</span>
                    <span className={styles.tileMeta}>
                        {[tags, s.kind === 'directory' ? s.country : '']
                            .filter(Boolean)
                            .join(' · ') ||
                            (s.kind === 'server' ? 'On your music server' : 'Saved')}
                    </span>
                </span>
                <span className={styles.tilePlay}>
                    {on ? (
                        <Bars on={isPlaying} />
                    ) : (
                        <Icon fill="inherit" icon={busy ? 'spinner' : 'mediaPlay'} />
                    )}
                </span>
            </button>
            {actions && <span className={styles.tileActions}>{actions}</span>}
        </div>
    );
};

const Small = ({
    icon,
    label,
    onClick,
}: {
    icon: 'delete' | 'edit' | 'plus' | 'x';
    label: string;
    onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) => (
    <button
        aria-label={label}
        className={styles.small}
        onClick={onClick}
        title={label}
        type="button"
    >
        <Icon icon={icon} />
    </button>
);

const OnAir = () => {
    const { currentStationArt, currentStreamUrl, isPlaying, metadata, stationName } =
        useRadioPlayer();
    const saved = useRadioPlus((s) => s.saved);
    const recent = useRadioPlus((s) => s.recent);
    if (!currentStreamUrl) return null;
    const name = stationName || 'Radio';
    const station = recent.find((r) => isStationPlaying(currentStreamUrl, r.url));
    const canSave =
        station && station.kind === 'directory' && !saved.some((x) => x.url === station.url);
    const song = metadata ? [metadata.artist, metadata.title].filter(Boolean).join(' - ') : '';
    return (
        <section className={styles.onAir} style={{ '--hue': stationHue(name) } as CSSProperties}>
            <StationArt big image={currentStationArt?.imageUrl} name={name} />
            <div className={styles.onAirText}>
                <span className={clsx(styles.live, isPlaying && styles.liveOn)}>
                    <i /> {isPlaying ? 'On air' : 'Paused'}
                </span>
                <h2 className={styles.onAirName}>{name}</h2>
                <span className={styles.onAirSong}>{song || 'Live radio'}</span>
            </div>
            <Bars big on={isPlaying} />
            <div className={styles.onAirButtons}>
                {canSave && (
                    <Button
                        leftSection={<Icon icon="plus" />}
                        onClick={() => saveStation(station)}
                        variant="default"
                    >
                        Save
                    </Button>
                )}
                <Button
                    leftSection={<Icon fill="inherit" icon="mediaStop" />}
                    onClick={stopStation}
                    variant="filled"
                >
                    Stop
                </Button>
            </div>
        </section>
    );
};

const Section = ({
    action,
    children,
    title,
}: {
    action?: ReactNode;
    children: ReactNode;
    title: string;
}) => (
    <section className={styles.section}>
        <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{title}</h2>
            {action}
        </div>
        {children}
    </section>
);

const YourStations = () => {
    const server = useCurrentServer();
    const permissions = usePermissions();
    const saved = useRadioPlus((s) => s.saved);
    const list = useQuery({
        ...radioQueries.list({ query: undefined, serverId: server?.id || '' }),
        enabled: !!server?.id,
    });
    const remove = useDeleteRadioStation({});
    const fromServer: { raw: InternetRadioStation; s: Station }[] = (list.data ?? []).map(
        (raw) => ({
            raw,
            s: {
                id: raw.id,
                image:
                    raw.imageUrl ||
                    (raw.imageId
                        ? getItemImageUrl({
                              id: raw.imageId,
                              itemType: LibraryItem.RADIO_STATION,
                              serverId: server?.id,
                              type: 'table',
                          })
                        : null),
                kind: 'server',
                name: raw.name,
                url: raw.streamUrl,
            },
        }),
    );
    const askDelete = (raw: InternetRadioStation) =>
        openModal({
            children: (
                <ConfirmModal
                    labels={{ cancel: 'Keep it', confirm: 'Delete' }}
                    onConfirm={async () => {
                        try {
                            await remove.mutateAsync({
                                apiClientProps: { serverId: server!.id },
                                query: { id: raw.id },
                            });
                        } catch (err) {
                            toast.error({ message: (err as Error).message });
                        }
                        closeAllModals();
                    }}
                >
                    <Text>Delete {raw.name} from your music server, for everyone?</Text>
                </ConfirmModal>
            ),
            title: 'Delete station',
        });
    const empty = !fromServer.length && !saved.length;
    return (
        <Section
            action={
                permissions.radio.create && (
                    <Button
                        leftSection={<Icon icon="plus" />}
                        onClick={(e) => openCreateRadioStationModal(server, e)}
                        size="compact-sm"
                        variant="subtle"
                    >
                        Add a station
                    </Button>
                )
            }
            title="Your stations"
        >
            {list.isLoading && <Text isMuted>Getting your stations...</Text>}
            {empty && !list.isLoading && (
                <Text isMuted size="sm">
                    No stations yet: find one below and save it, or add one by its address.
                </Text>
            )}
            <div className={styles.tiles}>
                {fromServer.map(({ raw, s }) => (
                    <Tile
                        actions={
                            (permissions.radio.edit || permissions.radio.delete) && (
                                <>
                                    {permissions.radio.edit && (
                                        <Small
                                            icon="edit"
                                            label="Edit"
                                            onClick={(e) =>
                                                openEditRadioStationModal(raw, server, e)
                                            }
                                        />
                                    )}
                                    {permissions.radio.delete && (
                                        <Small
                                            icon="delete"
                                            label="Delete"
                                            onClick={() => askDelete(raw)}
                                        />
                                    )}
                                </>
                            )
                        }
                        key={raw.id}
                        s={s}
                    />
                ))}
                {saved.map((s) => (
                    <Tile
                        actions={
                            <Small icon="x" label="Remove" onClick={() => forgetStation(s.url)} />
                        }
                        key={s.url}
                        s={s}
                    />
                ))}
            </div>
        </Section>
    );
};

const Recent = () => {
    const recent = useRadioPlus((s) => s.recent);
    const { currentStreamUrl } = useRadioPlayer();
    if (!recent.length) return null;
    return (
        <Section title="Played lately">
            <div className={styles.chips}>
                {recent.slice(0, 10).map((s) => (
                    <button
                        className={clsx(
                            styles.chip,
                            isStationPlaying(currentStreamUrl, s.url) && styles.chipOn,
                        )}
                        key={s.url}
                        onClick={() => void playStation(s)}
                        type="button"
                    >
                        <StationArt image={s.image} name={s.name} />
                        {s.name}
                    </button>
                ))}
            </div>
        </Section>
    );
};

const GENRES: [string, string][] = [
    ['Popular', ''],
    ['Lo-fi', 'lofi'],
    ['Chill', 'chillout'],
    ['Pop', 'pop'],
    ['Hip hop', 'hip hop'],
    ['R&B', 'rnb'],
    ['Rock', 'rock'],
    ['Jazz', 'jazz'],
    ['Electronic', 'electronic'],
    ['Classical', 'classical'],
    ['Country', 'country'],
    ['Latin', 'latin'],
    ['News', 'news'],
];

const Discover = () => {
    const country = myCountry();
    const [tag, setTag] = useState('');
    const [typed, setTyped] = useState('');
    const [debounced] = useDebouncedValue(typed.trim(), 450);
    const name = debounced ?? '';
    const saved = useRadioPlus((s) => s.saved);
    const found = useQuery({
        queryFn: () => findStations(name ? { name } : tag === 'near' ? { country } : { tag }),
        queryKey: ['sour-radio-directory', name, tag],
        staleTime: 30 * 60 * 1000,
    });
    const chips: [string, string][] = country
        ? [GENRES[0], ['Near you', 'near'], ...GENRES.slice(1)]
        : GENRES;
    return (
        <Section
            action={
                <TextInput
                    className={styles.search}
                    leftSection={<Icon icon="search" />}
                    onChange={(e) => setTyped(e.currentTarget.value)}
                    placeholder="Find a station"
                    size="sm"
                    value={typed}
                />
            }
            title="Discover"
        >
            {!name && (
                <div className={styles.chips}>
                    {chips.map(([label, id]) => (
                        <button
                            className={clsx(styles.genre, tag === id && styles.genreOn)}
                            key={label}
                            onClick={() => setTag(id)}
                            type="button"
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}
            {found.isLoading && <Text isMuted>Tuning in...</Text>}
            {found.error && <Text isMuted>{(found.error as Error).message}</Text>}
            {found.data && !found.data.length && <Text isMuted>No stations found.</Text>}
            <div className={styles.tiles}>
                {found.data?.map((s) => {
                    const kept = saved.some((x) => x.url === s.url);
                    return (
                        <Tile
                            actions={
                                kept ? (
                                    <Small
                                        icon="x"
                                        label="Remove from your stations"
                                        onClick={() => forgetStation(s.url)}
                                    />
                                ) : (
                                    <Small
                                        icon="plus"
                                        label="Save to your stations"
                                        onClick={() => saveStation(s)}
                                    />
                                )
                            }
                            key={s.id}
                            s={s}
                        />
                    );
                })}
            </div>
        </Section>
    );
};

export const RadioPage = () => (
    <NativeScrollArea>
        <div className={styles.page}>
            <header className={styles.header}>
                <h1 className={styles.title}>Radio</h1>
                <Text isMuted size="sm">
                    Live stations from your server and from all over the world.
                </Text>
            </header>
            <OnAir />
            <RadioCard />
            <YourStations />
            <Recent />
            <Discover />
        </div>
    </NativeScrollArea>
);
