import { openModal } from '@mantine/modals';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import styles from './people.module.css';

import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { type Me, sourApi, type SourProfile } from '/@/renderer/features/sour/api/sour-api';
import {
    activity,
    ProfileAvatar,
    ProfileName,
    SongCover,
} from '/@/renderer/features/sour/components/profile-bits';
import { ProfileEditor } from '/@/renderer/features/sour/components/profile-editor';
import { NowPlayingRing } from '/@/renderer/features/sour/components/profile-extras';
import { ProfileView } from '/@/renderer/features/sour/components/profile-view';
import {
    openFriendGroup,
    openLeaderboard,
    openRecap,
    openYearInReview,
} from '/@/renderer/features/sour/components/social';
import {
    useMyProfile,
    useSourProfiles,
    useSourStore,
} from '/@/renderer/features/sour/store/sour.store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

export { ProfileAvatar, SongCover };

// a profile that switches between viewing and editing (editing only for your own)
const ProfileScreen = ({ id, onBack }: { id: string; onBack?: () => void }) => {
    const profiles = useSourProfiles().data ?? [];
    const own = useMyProfile().data;
    const [editing, setEditing] = useState(false);
    const listed = profiles.find((p) => p.id === id);
    // your own profile comes with everything, even when it is private to others (so editing it
    // never starts from the hidden version)
    const profile = listed && own?.id === id ? { ...listed, ...own } : listed;
    if (!profile) return <Text isMuted>Loading...</Text>;
    if (editing) return <ProfileEditor onDone={() => setEditing(false)} profile={profile} />;
    return <ProfileView onBack={onBack} onEdit={() => setEditing(true)} profile={profile} />;
};

// Everyone with Sour Player: who's online and what they're listening to.
export const PeoplePanel = () => {
    const url = useHermesUrl();
    const me = useSourStore((state) => state.me);
    const profiles = useSourProfiles();
    const [viewing, setViewing] = useState<null | string>(null);

    if (!url) {
        return (
            <Text isMuted>
                People runs through Hermes Music. Add its address in Settings &gt; General &gt;
                Music videos first.
            </Text>
        );
    }

    if (viewing) return <ProfileScreen id={viewing} onBack={() => setViewing(null)} />;

    const all = profiles.data ?? [];
    const mine = all.find((p) => p.id === me?.id);
    const others = all.filter((p) => p.id !== me?.id);
    const online = others.filter((p) => p.online);
    const offline = others.filter((p) => !p.online);

    const row = (p: SourProfile) => (
        <button className={styles.person} key={p.id} onClick={() => setViewing(p.id)} type="button">
            <NowPlayingRing profile={p} size={40} />
            <Stack flex={1} gap={0} miw={0}>
                <ProfileName profile={p} size={14} />
                <Text isMuted size="xs" truncate>
                    {activity(p)}
                </Text>
            </Stack>
            {p.online && p.listening && <SongCover size={36} song={p.listening} />}
        </button>
    );

    return (
        <Stack gap="md">
            {mine && (
                <div className={styles.meCard}>
                    {row(mine)}
                    <Button onClick={() => setViewing(mine.id)} size="xs" variant="filled">
                        My profile
                    </Button>
                </div>
            )}
            <Group gap="xs">
                <Button onClick={openFriendGroup} size="xs" variant="default">
                    The group
                </Button>
                <Button onClick={openLeaderboard} size="xs" variant="default">
                    Leaderboard
                </Button>
                <Button onClick={openRecap} size="xs" variant="default">
                    My week
                </Button>
                <Button onClick={openYearInReview} size="xs" variant="default">
                    Year in review
                </Button>
            </Group>
            <Stack gap={4}>
                <Text fw={700}>Online - {online.length}</Text>
                {online.map(row)}
                {!online.length && (
                    <Text isMuted size="sm">
                        Nobody else is online right now.
                    </Text>
                )}
            </Stack>
            {!!offline.length && (
                <Stack gap={4}>
                    <Text fw={700}>Offline</Text>
                    {offline.map(row)}
                </Stack>
            )}
        </Stack>
    );
};

// Player bar: opens People.
export const PeopleButton = () => {
    const profiles = useSourProfiles();
    const me = useSourStore((state) => state.me);
    const online = (profiles.data ?? []).filter((p) => p.online && p.id !== me?.id).length;
    return (
        <ActionIcon
            icon="user"
            iconProps={{ color: online ? 'primary' : undefined, size: 'lg' }}
            onClick={(e) => {
                e.stopPropagation();
                openPeople();
            }}
            size="sm"
            tooltip={{ label: `People (${online} online)`, openDelay: 0 }}
            variant="subtle"
        />
    );
};

// Admins (a Hermes Music perk, Settings > Sour Player) can fix a friend's profile for them: name,
// bio, pictures, colours... Hermes Music checks the perk; everyone else never sees this.
const ProfileHelper = () => {
    const url = useHermesUrl();
    const me = useSourStore((state) => state.me);
    const profiles = useSourProfiles().data ?? [];
    const [id, setId] = useState<null | string>(null);
    const helper: Me | null = me && id ? { as: me.id, id, key: me.key } : null;
    const target = useQuery({
        enabled: !!url && !!helper,
        queryFn: () => sourApi.me(url, helper as Me),
        queryKey: ['sour-help', url, id],
        staleTime: 0,
    });

    if (id && target.data) {
        return <ProfileEditor helping onDone={() => setId(null)} profile={target.data} />;
    }
    if (id) {
        return (
            <Stack gap="sm">
                <Text isMuted>{target.error ? target.error.message : 'Loading...'}</Text>
                <Button onClick={() => setId(null)} size="xs" variant="default" w="fit-content">
                    Back
                </Button>
            </Stack>
        );
    }
    const others = profiles.filter((p) => p.id !== me?.id);
    return (
        <Stack gap={4}>
            <Text isMuted size="sm">
                Pick whose profile to fix. They see the changes right away; nothing else of theirs
                is touched.
            </Text>
            {others.map((p) => (
                <button
                    className={styles.person}
                    key={p.id}
                    onClick={() => setId(p.id)}
                    type="button"
                >
                    <ProfileAvatar profile={p} size={36} />
                    <Stack flex={1} gap={0} miw={0}>
                        <ProfileName profile={p} size={14} />
                        <Text isMuted size="xs" truncate>
                            {activity(p)}
                        </Text>
                    </Stack>
                </button>
            ))}
            {!others.length && <Text isMuted>Nobody else has a profile yet.</Text>}
        </Stack>
    );
};

export const openProfileHelper = () =>
    openModal({ children: <ProfileHelper />, size: 'xl', title: "Edit someone's profile" });

export const openPeople = () =>
    openModal({ children: <PeoplePanel />, size: 'xl', title: 'People' });

// Opens one person's profile (from Group Play, the sidebar, search...).
export const openProfile = (profile: Pick<SourProfile, 'id' | 'name'>) =>
    openModal({ children: <ProfileScreen id={profile.id} />, size: 'xl', title: profile.name });
