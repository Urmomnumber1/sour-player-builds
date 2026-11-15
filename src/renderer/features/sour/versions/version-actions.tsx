import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { setKaraokeOff, useKaraokeInfo } from '/@/renderer/features/sour/stage/karaoke-off';
import { useMyProfile, useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { openPutUnder, openVersionPicker } from '/@/renderer/features/sour/versions/version-picker';
import { startWithVersion, useSongVersions } from '/@/renderer/features/sour/versions/versions';
import { usePlayerSong } from '/@/renderer/store';
import { addToQueueByData } from '/@/renderer/store/player.store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import { type Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

// Sour Player 0.15: the song menu's version items

// "Versions": the song's versions (switch while it plays, or start it in one)
export const VersionsAction = ({ songs }: { songs: Song[] }) => {
    const song = songs.length === 1 ? songs[0] : undefined;
    const entry = useSongVersions(song);
    const playing = usePlayerSong();
    if (!song || !entry) return null;
    const open = () => {
        if (playing?.id === song.id) openVersionPicker(playing, 'switch');
        else
            openVersionPicker(song, 'start', (version) => {
                startWithVersion(song.id, version);
                void addToQueueByData(Play.NOW, [song], { noVersionPrompt: true });
            });
    };
    return (
        <ContextMenu.Item leftIcon="audioLines" onSelect={open}>
            {`Versions (${entry.versions.length + 1})`}
        </ContextMenu.Item>
    );
};

// "Request a version": the Request window, with this song attached
export const RequestVersionAction = ({ songs }: { songs: Song[] }) => {
    const url = useHermesUrl();
    if (!url || songs.length !== 1) return null;
    return (
        <ContextMenu.Item
            leftIcon="plus"
            onSelect={() =>
                void import('/@/renderer/features/hermes-request/components/request-button').then(
                    (m) => m.openRequestWindow({ versionOf: songs[0] }),
                )
            }
        >
            Request a version
        </ContextMenu.Item>
    );
};

// admins: this song becomes a version of another
export const PutUnderAction = ({ songs }: { songs: Song[] }) => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const admin = !!useMyProfile().data?.admin;
    if (!url || !me || !admin || songs.length !== 1) return null;
    return (
        <ContextMenu.Item leftIcon="audioLines" onSelect={() => openPutUnder(songs[0])}>
            Put under another song...
        </ContextMenu.Item>
    );
};

// no karaoke for this song (nobody sings in it), for everyone
export const NoKaraokeAction = ({ songs }: { songs: Song[] }) => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const song = songs.length === 1 ? songs[0] : undefined;
    const info = useKaraokeInfo(song, !!me);
    if (!url || !me || !song) return null;
    const off = !!info.data?.off;
    return (
        <ContextMenu.Item
            leftIcon="microphone"
            onSelect={() =>
                setKaraokeOff(url, song, !off)
                    .then(() =>
                        toast.success({
                            message: off
                                ? `Karaoke is back on for ${song.name}`
                                : `No karaoke for ${song.name} (for everyone)`,
                        }),
                    )
                    .catch((e: Error) => toast.error({ message: e.message }))
            }
        >
            {off ? 'Karaoke back on' : 'No karaoke for this song'}
        </ContextMenu.Item>
    );
};
