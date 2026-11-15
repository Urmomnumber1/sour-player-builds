import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { api } from '/@/renderer/api';
import {
    useSongVersions,
    withSongVersion,
} from '/@/renderer/features/sour/components/song-version';
import { isNativeApp } from '/@/renderer/features/sour/mobile/android';
import { offlineUrl } from '/@/renderer/features/sour/mobile/offline';
import { phoneTranscode } from '/@/renderer/features/sour/mobile/phone-store';
import { isPodcast, podcastStreamUrl } from '/@/renderer/features/sour/podcasts/podcast-id';
import {
    noteLoaded,
    useVersionReloads,
    useVersions,
    versionStream,
} from '/@/renderer/features/sour/versions/versions';
import { TranscodingConfig } from '/@/renderer/store';
import { QueueSong } from '/@/shared/types/domain-types';

export function useSongUrl(
    song: QueueSong | undefined,
    current: boolean,
    transcodeSetting: Partial<TranscodingConfig>,
): string | undefined {
    // Android: data saver on mobile data, and saved offline copies (see features/sour/mobile)
    const transcode = isNativeApp() ? phoneTranscode(transcodeSetting) : transcodeSetting;
    // a saved copy, or a podcast episode (through Hermes Music)
    const offline = offlineUrl(song) ?? podcastStreamUrl(song);
    const prior = useRef(['', '']);
    const version = useSongVersions((s) => (song ? s.v[song.id] : undefined));
    const shouldReusePrior = Boolean(
        song?._serverId && current && prior.current[0] === song._uniqueId && prior.current[1],
    );

    const { data: queryStreamUrl } = useQuery({
        enabled: Boolean(song?._serverId) && !shouldReusePrior && !isPodcast(song),
        queryFn: () =>
            api.controller.getStreamUrl({
                apiClientProps: { serverId: song!._serverId },
                query: {
                    bitrate: transcode.bitrate,
                    format: transcode.format,
                    id: song!.id,
                    maxSampleRate: transcode.maxSampleRate,
                    transcode: transcode.enabled ?? false,
                },
            }),
        queryKey: [
            song?._serverId,
            'stream-url',
            song?.id,
            shouldReusePrior ? 'reuse-prior' : transcode.bitrate,
            shouldReusePrior ? 'reuse-prior' : transcode.format,
            shouldReusePrior ? 'reuse-prior' : transcode.maxSampleRate,
            shouldReusePrior ? 'reuse-prior' : transcode.enabled,
        ] as const,
        staleTime: 60 * 1000,
    });

    useEffect(() => {
        if (!song?._serverId) {
            prior.current = ['', ''];
            return;
        }

        if (!queryStreamUrl) {
            return;
        }

        // Save resolved URL to avoid restarting current track on transcode setting changes.
        prior.current = [song._uniqueId, queryStreamUrl];
    }, [song?._serverId, song?._uniqueId, queryStreamUrl]);

    useEffect(() => {
        if (!song?._serverId) {
            prior.current = ['', ''];
        }
    }, [song?._serverId]);

    // Sour Player 0.15: the version of the song to play (picked when it was started, else your most-played).
    // Re-read when the versions list arrives or the song is switched by reloading.
    useVersions((s) => s.at);
    const reloads = useVersionReloads((s) => (song?._uniqueId ? s.n[song._uniqueId] || 0 : 0));
    const frozen = useRef<null | {
        bump?: number;
        reloads: number;
        uid: string;
        url: string;
        version: string;
    }>(null);

    const own = withSongVersion(
        shouldReusePrior ? prior.current[1] : queryStreamUrl,
        song?.id,
        version,
    );
    // (a song saved on this phone plays its saved copy, unless you picked a version and you're online)
    const picked = versionStream(song);
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    const chosen = offline && !(picked.url && online) ? null : picked;
    let url = (chosen?.url ?? offline) || own;
    let loaded = chosen?.url ? chosen.version : 'original';
    if (!current) {
        frozen.current = null;
    } else {
        // the song that's playing keeps its address (a version switched mid-song plays alongside it), unless
        // its audio was swapped ("Not the right song") or it's switched by reloading
        const f = frozen.current;
        if (f && song && f.uid === song._uniqueId && f.bump === version && f.reloads === reloads) {
            url = f.url;
            loaded = f.version;
        } else if (song?._uniqueId && url) {
            frozen.current = { bump: version, reloads, uid: song._uniqueId, url, version: loaded };
        }
    }
    const uid = song?._uniqueId;
    useEffect(() => {
        if (uid && url) noteLoaded(uid, loaded);
    }, [uid, url, loaded]);
    return url;
}

export const getSongUrl = async (
    song: QueueSong,
    transcode: Partial<TranscodingConfig>,
    skipAutoTranscode?: boolean,
    forRenderer?: boolean,
    startTime?: number,
) => {
    const offline = offlineUrl(song) ?? podcastStreamUrl(song);
    if (offline) return offline;
    // Sour Player 0.15: a version of the song (see versions.ts)
    const chosen = versionStream(song);
    if (song._uniqueId) noteLoaded(song._uniqueId, chosen.url ? chosen.version : 'original');
    if (chosen.url) return chosen.url;
    if (isNativeApp()) transcode = phoneTranscode(transcode);
    const url = await api.controller.getStreamUrl({
        apiClientProps: { serverId: song._serverId },
        query: {
            bitrate: transcode.bitrate,
            container: song.container,
            format: transcode.format,
            forRenderer,
            id: song.id,
            maxSampleRate: transcode.maxSampleRate,
            sampleRate: song.sampleRate,
            skipAutoTranscode,
            startTime,
            transcode: transcode.enabled ?? false,
        },
    });

    return withSongVersion(url, song.id) ?? url;
};
