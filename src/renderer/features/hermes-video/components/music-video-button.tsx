import { closeAllModals, openModal } from '@mantine/modals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';

import styles from './music-video-button.module.css';

import { api } from '/@/renderer/api';
import {
    type MusicVideo,
    useMusicVideo,
} from '/@/renderer/features/hermes-video/hooks/use-music-video';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { useAuthStore, usePlayerSong } from '/@/renderer/store';
import { addToQueueByData, usePlayerStoreBase } from '/@/renderer/store/player.store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { type Song } from '/@/shared/types/domain-types';
import { Play, PlayerStatus } from '/@/shared/types/types';

// YouTube player states
const YT_PLAYING = 1;
const YT_BUFFERING = 3;
// the speeds YouTube's player plays at (it reports its own list once it loads)
const YT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface YouTubeMessage {
    event?: string;
    info?: {
        availablePlaybackRates?: number[];
        currentTime?: number;
        duration?: number;
        playbackRate?: number;
        playerState?: number;
    };
}

// Where the Sour Stage shows the song: its cover or its music video ("Video" in the Stage's toolbar)
// the Sour Stage: the cover, the video in its place, or the video behind everything (blurred or sharp)
export const useVideoView = create<{ blur: boolean; view: 'behind' | 'cover' | 'video' }>(() => ({
    blur: true,
    view: 'cover',
}));

// ---------- the sync engine ----------
// Keeps a muted YouTube video in step with the song, which keeps playing from the music server: it follows
// play, pause, seek and the song's speed. YouTube only plays at quarter steps (0.75, 1, 1.25...), so a
// speed in between (Slowed is 0.85) switches between the two nearest steps to land on it on average,
// instead of drifting and jumping back. Subtitles are switched off whenever the video (re)starts, since
// YouTube turns them on for muted videos.
const useVideoSync = (
    frame: RefObject<HTMLIFrameElement | null>,
    offsetRef: { current: number },
) => {
    useEffect(() => {
        const yt = {
            at: 0,
            duration: 0,
            heard: -1e9,
            rate: 1,
            rates: YT_RATES,
            state: -1,
            time: 0,
        };
        const send = (message: Record<string, unknown>) =>
            frame.current?.contentWindow?.postMessage(JSON.stringify(message), '*');
        const command = (func: string, args: unknown[] = []) =>
            send({ args, event: 'command', func });
        const noCaptions = () => {
            command('setOption', ['captions', 'track', {}]);
            command('unloadModule', ['captions']);
            command('unloadModule', ['cc']);
        };
        let captionsUntil = performance.now() + 20000;

        const onMessage = (event: MessageEvent) => {
            if (event.source !== frame.current?.contentWindow) return;
            let data: YouTubeMessage;
            try {
                data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            } catch {
                return;
            }
            if (data.event !== 'infoDelivery' && data.event !== 'onReady') return;
            const info = data.info ?? {};
            yt.heard = performance.now();
            if (typeof info.currentTime === 'number') {
                yt.time = info.currentTime;
                yt.at = performance.now();
            }
            if (typeof info.duration === 'number') yt.duration = info.duration;
            if (typeof info.playbackRate === 'number') yt.rate = info.playbackRate;
            if (Array.isArray(info.availablePlaybackRates) && info.availablePlaybackRates.length)
                yt.rates = [...info.availablePlaybackRates].sort((a, b) => a - b);
            if (typeof info.playerState === 'number') {
                if (info.playerState === YT_PLAYING && yt.state !== YT_PLAYING) {
                    noCaptions();
                    captionsUntil = performance.now() + 6000;
                }
                yt.state = info.playerState;
            }
        };
        window.addEventListener('message', onMessage);

        let clock = -1;
        let clockAt = 0;
        let lastRaw = -1;
        let settleUntil = 0;
        let measure = false;
        let lead = 0.3;
        let offBeats = 0;
        let lastCommand = 0;
        let lastCaptions = 0;
        let wantRate = 1;
        const tick = () => {
            const now = performance.now();
            // ask the player to report its time until it does (also after it reloads)
            if (now - yt.heard > 2000 && now - lastCommand > 1000) {
                send({ channel: 'widget', event: 'listening', id: 'sour-video' });
                command('mute');
                noCaptions();
                lastCommand = now;
                wantRate = 0; // a (re)loaded player starts at normal speed: send the speed again
                captionsUntil = now + 20000;
            }
            // subtitles again for the first seconds after a start (YouTube can switch them on late)
            if (now < captionsUntil && now - lastCaptions > 2500) {
                noCaptions();
                lastCaptions = now;
            }
            const raw = useTimestampStoreBase.getState().timestamp;
            const { speed, status } = usePlayerStoreBase.getState().player;
            const playing = status === PlayerStatus.PLAYING;
            const songRate = speed > 0 ? speed : 1;
            // the song position arrives about twice a second and a little unevenly, so it is
            // smoothed into a steady clock; a big jump (seek, new song) is taken as it is
            if (clock >= 0 && playing) clock += ((now - clockAt) / 1000) * songRate;
            clockAt = now;
            if (raw !== lastRaw) {
                lastRaw = raw;
                clock = clock < 0 || Math.abs(raw - clock) > 1 ? raw : clock + (raw - clock) * 0.25;
            }
            const target = clock + offsetRef.current;
            const videoPlaying = yt.state === YT_PLAYING;
            const videoTime = yt.time + (videoPlaying ? ((now - yt.at) / 1000) * yt.rate : 0);

            if (target < 0 || (yt.duration && target > yt.duration)) {
                if (videoPlaying) command('pauseVideo');
                return;
            }
            if (playing && !videoPlaying && yt.state !== YT_BUFFERING && now - lastCommand > 800) {
                command('playVideo');
                lastCommand = now;
            }
            if (!playing && videoPlaying) command('pauseVideo');
            if (yt.state === YT_BUFFERING || now < settleUntil) return;
            if (playing && !videoPlaying) return;

            const drift = videoTime - target;
            // the speed: exact when YouTube has it, otherwise the step below or above, whichever
            // brings the video back to the song
            const exact = yt.rates.find((r) => Math.abs(r - songRate) < 0.001);
            let rate = exact ?? songRate;
            if (!exact) {
                const lo = [...yt.rates].reverse().find((r) => r < songRate) ?? yt.rates[0];
                const hi = yt.rates.find((r) => r > songRate) ?? yt.rates[yt.rates.length - 1];
                rate =
                    drift > 0.04
                        ? lo
                        : drift < -0.04
                          ? hi
                          : wantRate === lo || wantRate === hi
                            ? wantRate
                            : lo;
            }
            if (rate !== wantRate && yt.heard > 0) {
                wantRate = rate;
                command('setPlaybackRate', [rate]);
            }

            if (measure && videoPlaying) {
                // how far behind the song the video came out of the last seek
                lead = Math.min(1.5, Math.max(0, lead - drift));
                measure = false;
            }
            // between speed steps small drifts are corrected by the speed, so only a real gap seeks
            const limit = exact ? (playing ? 0.35 : 0.2) : 1.2;
            offBeats = Math.abs(drift) > limit ? offBeats + 1 : 0;
            if (offBeats >= 2) {
                const to = target + (playing ? lead : 0);
                command('seekTo', [to, true]);
                yt.time = to;
                yt.at = now;
                settleUntil = now + 1200;
                measure = playing;
                offBeats = 0;
            }
        };
        const sync = setInterval(tick, 200);
        return () => {
            window.removeEventListener('message', onMessage);
            clearInterval(sync);
        };
    }, [frame, offsetRef]);
};

const ytParams = (start: number) =>
    `enablejsapi=1&mute=1&autoplay=1&controls=0&rel=0&playsinline=1&disablekb=1&modestbranding=1&cc_load_policy=0&cc_lang_pref=zxx&iv_load_policy=3&start=${start}`;
const thumb = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

// ---------- the video behind the Sour Stage (muted, in step with the song, no controls) ----------
export const VideoBackdrop = ({ blur, video }: { blur: boolean; video: MusicVideo }) => {
    const frame = useRef<HTMLIFrameElement>(null);
    const offsetRef = useRef(video.offset ?? 0);
    useEffect(() => {
        offsetRef.current = video.offset ?? 0;
    }, [video.offset]);
    const [start] = useState(() =>
        Math.max(0, Math.floor(useTimestampStoreBase.getState().timestamp + (video.offset ?? 0))),
    );
    useVideoSync(frame, offsetRef);
    return (
        <div aria-hidden className={blur ? styles['backdrop-blur'] : styles.backdrop}>
            <iframe
                allow="autoplay; encrypted-media"
                key={video.videoId}
                ref={frame}
                referrerPolicy="strict-origin-when-cross-origin"
                src={`https://www.youtube-nocookie.com/embed/${video.videoId}?${ytParams(start)}`}
                tabIndex={-1}
                title="Music video (background)"
            />
        </div>
    );
};

// ---------- the player ----------
interface SourVideoProps {
    artist: string;
    // the Stage's subtitles (the line being sung), shown over the video
    subtitle?: React.ReactNode;
    title: string;
    variant: 'floating' | 'stage';
    video: MusicVideo;
}

export const SourVideo = ({ artist, subtitle, title, variant, video: saved }: SourVideoProps) => {
    // "Live": a live performance instead of the official video
    const [live, setLive] = useState<MusicVideo['live']>(null);
    const video: MusicVideo = live ? { ...saved, offset: 0, videoId: live.videoId } : saved;
    const url = useHermesUrl();
    const queryClient = useQueryClient();
    const frame = useRef<HTMLIFrameElement>(null);
    const [nudge, setNudge] = useState(0);
    const [saving, setSaving] = useState(false);
    const offset = (video.offset ?? 0) + nudge;
    const offsetRef = useRef(offset);
    // start the video where the song already is, so it doesn't open with a big jump
    const [start] = useState(() =>
        Math.max(0, Math.floor(useTimestampStoreBase.getState().timestamp + (saved.offset ?? 0))),
    );
    useEffect(() => {
        offsetRef.current = offset;
    }, [offset]);
    useVideoSync(frame, offsetRef);

    const saveTiming = async () => {
        if (!url) return;
        setSaving(true);
        try {
            const res = await fetch(`${url}/api/videos/offset`, {
                body: JSON.stringify({ artist, offset, title }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            });
            if (!res.ok) throw new Error(`Hermes Music returned ${res.status}`);
            queryClient.setQueryData(['hermes-video', url, artist, title], { ...saved, offset });
            setNudge(0);
            toast.success({ message: 'Video timing saved for everyone' });
        } catch (error) {
            toast.error({ message: (error as Error).message });
        } finally {
            setSaving(false);
        }
    };

    const toggleLive = async () => {
        if (live) return setLive(null);
        if (saved.live) return setLive(saved.live);
        try {
            const res = await fetch(`${url}/api/videos/live`, {
                body: JSON.stringify({ artist, title }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || 'No live performance found');
            setLive(json);
        } catch (error) {
            toast.error({ message: (error as Error).message });
        }
        return undefined;
    };

    return (
        <div className={variant === 'stage' ? styles['stage-player'] : styles['floating-player']}>
            {/* the video's own picture, blurred, fills the space around it */}
            <div
                className={styles.glow}
                style={{ backgroundImage: `url("${thumb(video.videoId)}")` }}
            />
            <div className={styles.frame}>
                <iframe
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    key={video.videoId}
                    ref={frame}
                    referrerPolicy="strict-origin-when-cross-origin"
                    src={`https://www.youtube-nocookie.com/embed/${video.videoId}?${ytParams(start)}`}
                    title={video.title || 'Video'}
                />
                {/* clicks go to Sour Player, not to YouTube (its controls would fight the sync) */}
                <div className={styles.shield} />
                {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
                {saved.pending && !live && (
                    <div className={styles.badge}>Lining the video up with the song...</div>
                )}
            </div>
            {variant === 'stage' && (
                <div className={styles.bar}>
                    <button
                        className={live ? styles['chip-on'] : styles.chip}
                        onClick={toggleLive}
                        type="button"
                    >
                        {live ? 'Live' : 'Official'}
                    </button>
                    <button
                        className={styles.chip}
                        onClick={() => openVideoPicker(artist, title)}
                        type="button"
                    >
                        Wrong video?
                    </button>
                    <span className={styles.timing}>
                        <button
                            aria-label="Video earlier"
                            className={styles.chip}
                            onClick={() => setNudge((n) => n - 0.25)}
                            type="button"
                        >
                            -
                        </button>
                        <span title="Where the song starts in the video">
                            {offset >= 0 ? '+' : ''}
                            {offset.toFixed(2)}s
                        </span>
                        <button
                            aria-label="Video later"
                            className={styles.chip}
                            onClick={() => setNudge((n) => n + 0.25)}
                            type="button"
                        >
                            +
                        </button>
                        {!!nudge && (
                            <button
                                className={styles['chip-on']}
                                disabled={saving}
                                onClick={saveTiming}
                                type="button"
                            >
                                Save timing
                            </button>
                        )}
                    </span>
                    <button
                        className={styles.chip}
                        onClick={() => useVideoWindow.setState({ floating: true, watch: null })}
                        type="button"
                    >
                        Pop out
                    </button>
                </div>
            )}
        </div>
    );
};

// ---------- the video picker: the other videos that could be this song ----------
const VideoPicker = ({ artist, title }: { artist: string; title: string }) => {
    const url = useHermesUrl();
    const queryClient = useQueryClient();
    const [link, setLink] = useState('');
    const list = useQuery({
        enabled: !!url,
        queryFn: async () => {
            const q = new URLSearchParams({ artist, title });
            const res = await fetch(`${url}/api/videos/candidates?${q}`);
            const json = await res.json().catch(() => null);
            if (!res.ok) throw new Error(json?.error || `Hermes Music returned ${res.status}`);
            return json as {
                candidates: { channel: string; id: string; title: string }[];
                current: null | string;
            };
        },
        queryKey: ['video-candidates', url, artist, title],
        retry: false,
    });
    const pick = async (videoId: string, videoTitle?: string, channel?: string) => {
        try {
            const res = await fetch(`${url}/api/videos/pick`, {
                body: JSON.stringify({ artist, channel, title, videoId, videoTitle }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || `Hermes Music returned ${res.status}`);
            closeAllModals();
            toast.success({
                message: 'Video changed for everyone - lining it up with the song now',
            });
            await queryClient.invalidateQueries({ queryKey: ['hermes-video', url] });
        } catch (error) {
            toast.error({ message: (error as Error).message });
        }
    };
    return (
        <Stack gap="md">
            {list.isLoading && <Text isMuted>Looking for videos of this song...</Text>}
            {list.error && <Text isMuted>{(list.error as Error).message}</Text>}
            <div className={styles['pick-grid']}>
                {(list.data?.candidates ?? []).map((c) => (
                    <button
                        className={c.id === list.data?.current ? styles['pick-on'] : styles.pick}
                        key={c.id}
                        onClick={() => pick(c.id, c.title, c.channel)}
                        type="button"
                    >
                        <img alt="" src={thumb(c.id)} />
                        <Text fw={600} lineClamp={2} size="sm">
                            {c.title}
                        </Text>
                        <Text isMuted size="xs" truncate>
                            {c.id === list.data?.current ? 'Playing now - ' : ''}
                            {c.channel}
                        </Text>
                    </button>
                ))}
            </div>
            <Group align="flex-end" gap="xs" wrap="nowrap">
                <TextInput
                    label="Or paste a YouTube link"
                    onChange={(e) => setLink(e.currentTarget.value)}
                    placeholder="https://youtu.be/..."
                    style={{ flex: 1 }}
                    value={link}
                />
                <Button disabled={link.trim().length < 11} onClick={() => pick(link.trim())}>
                    Use it
                </Button>
            </Group>
        </Stack>
    );
};

export const openVideoPicker = (artist: string, title: string) =>
    openModal({
        children: <VideoPicker artist={artist} title={title} />,
        size: 'xl',
        title: `Which video is ${title}?`,
    });

// ---------- the floating window (pop out, auto-open) ----------
export const useVideoWindow = create<{
    floating: boolean;
    watch: null | { title: string; videoId: string };
}>(() => ({ floating: false, watch: null }));

// opens the Sour Stage showing the song's video (the player bar's Video button, watch parties)
export const openMusicVideo = () => {
    useVideoView.setState({ view: 'video' });
    useVideoWindow.setState({ floating: false, watch: null });
    import('/@/renderer/features/sour/stage/sour-stage').then((m) => m.toggleStage(true));
};

export const FloatingVideo = () => {
    const { floating } = useVideoWindow();
    const song = usePlayerSong();
    const { data: video, isFetching } = useMusicVideo(song?.artistName, song?.name);
    // a song without a video closes the window
    useEffect(() => {
        if (floating && !isFetching && !video) useVideoWindow.setState({ floating: false });
    }, [floating, isFetching, video]);
    if (!floating || !song || !video) return null;
    // a portal: inside the player bar, the v0.9 and v0.10 looks' blurred bar trapped the window in
    // the bar (a fixed box inside a blurred one is placed and clipped by it), so it never showed
    return createPortal(
        <div className={styles.floating}>
            <SourVideo
                artist={song.artistName}
                key={video.videoId}
                title={song.name}
                variant="floating"
                video={video}
            />
            <div className={styles['floating-tools']}>
                <ActionIcon
                    icon="expand"
                    onClick={openMusicVideo}
                    size="xs"
                    tooltip={{ label: 'Show in the Sour Stage' }}
                    variant="subtle"
                />
                <ActionIcon
                    icon="x"
                    onClick={() => useVideoWindow.setState({ floating: false })}
                    size="xs"
                    tooltip={{ label: 'Close' }}
                    variant="subtle"
                />
            </div>
        </div>,
        document.body,
    );
};

// opens the floating video by itself when a song with a video starts (Settings > Sour Player)
export const AutoVideo = () => {
    const song = usePlayerSong();
    const auto = useSourStore((state) => state.look.autoVideo);
    const { data: video } = useMusicVideo(song?.artistName, song?.name);
    useEffect(() => {
        if (auto && video && useVideoView.getState().view !== 'video')
            useVideoWindow.setState({ floating: true, watch: null });
    }, [auto, video]);
    return null;
};

// ---------- playing a song for its video ----------
export interface VideoEntry {
    artist: string;
    at?: string;
    live?: unknown;
    song: string;
    title: string;
    videoId: string;
}

// every song with a video, from Hermes Music
export const useVideoList = () => {
    const url = useHermesUrl();
    return useQuery({
        enabled: !!url,
        queryFn: async () => {
            const res = await fetch(`${url}/api/videos`);
            const json = await res.json().catch(() => null);
            if (!Array.isArray(json))
                throw new Error("That address doesn't answer like Hermes Music");
            return json as VideoEntry[];
        },
        queryKey: ['video-wall', url],
        staleTime: 5 * 60 * 1000,
    });
};

const songKey = (artist: string, title: string) =>
    `${artist}|${title}`.toLowerCase().replace(/[^a-z0-9|]+/g, '');

// keeps only the songs that have a video (for "Play as videos")
export const withVideos = (songs: Song[], list: VideoEntry[]) => {
    const keys = new Set(list.map((v) => songKey(v.artist, v.song)));
    return songs.filter(
        (s) =>
            keys.has(songKey(s.artistName, s.name)) ||
            keys.has(songKey(s.albumArtists?.[0]?.name || '', s.name)),
    );
};

// plays songs and shows them in the Stage's video view
export const playAsVideos = async (songs: Song[]) => {
    if (!songs.length) return toast.info({ message: 'None of these songs have a video yet' });
    await addToQueueByData(Play.NOW, songs);
    openMusicVideo();
    return undefined;
};

// finds the library song for a video and plays it with its video
export const playVideoEntry = async (v: VideoEntry) => {
    const serverId = useAuthStore.getState().currentServer?.id;
    if (!serverId) return toast.error({ message: 'Pick a music server first' });
    const res = await api.controller
        .search({
            apiClientProps: { serverId },
            query: {
                albumArtistLimit: 0,
                albumLimit: 0,
                query: `${v.song} ${v.artist}`,
                songLimit: 10,
            },
        })
        .catch(() => null);
    const want = songKey(v.artist, v.song);
    const songs = res?.songs ?? [];
    const hit =
        songs.find((s) => songKey(s.artistName, s.name) === want) ??
        songs.find((s) => s.name.toLowerCase() === v.song.toLowerCase());
    if (!hit) return toast.error({ message: `${v.song} isn't on your music server` });
    closeAllModals();
    return playAsVideos([hit]);
};

const VideoCard = ({ v }: { v: VideoEntry }) => (
    <button className={styles['wall-item']} onClick={() => playVideoEntry(v)} type="button">
        <img alt="" loading="lazy" src={`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`} />
        <Text fw={600} size="sm" truncate>
            {v.song}
        </Text>
        <Text isMuted size="xs" truncate>
            {v.artist}
        </Text>
    </button>
);

// ---------- Watch: every song that has a video ----------
const Watch = () => {
    const list = useVideoList();
    const [q, setQ] = useState('');
    const all = list.data ?? [];
    if (list.isFetched && !all.length)
        return (
            <Text isMuted>No videos yet - an admin can find them in Sour Library &gt; Videos.</Text>
        );
    const newest = [...all]
        .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
        .slice(0, 12);
    const live = all.filter((v) => v.live);
    const shown = q.trim()
        ? all.filter((v) => `${v.artist} ${v.song}`.toLowerCase().includes(q.trim().toLowerCase()))
        : all;
    return (
        <Stack gap="lg">
            <TextInput
                onChange={(e) => setQ(e.currentTarget.value)}
                placeholder={`Search ${all.length} videos`}
                value={q}
            />
            {!q.trim() && (
                <>
                    <Stack gap="xs">
                        <Text className={styles['row-title']}>New videos</Text>
                        <div className={styles.row}>
                            {newest.map((v) => (
                                <VideoCard key={v.videoId} v={v} />
                            ))}
                        </div>
                    </Stack>
                    {!!live.length && (
                        <Stack gap="xs">
                            <Text className={styles['row-title']}>With a live version</Text>
                            <div className={styles.row}>
                                {live.slice(0, 12).map((v) => (
                                    <VideoCard key={v.videoId} v={v} />
                                ))}
                            </div>
                        </Stack>
                    )}
                </>
            )}
            <Stack gap="xs">
                <Text className={styles['row-title']}>{q.trim() ? 'Results' : 'All videos'}</Text>
                <div className={styles.wall}>
                    {shown.map((v) => (
                        <VideoCard key={v.videoId} v={v} />
                    ))}
                </div>
            </Stack>
        </Stack>
    );
};
export const openVideoWall = () => openModal({ children: <Watch />, size: '90vw', title: 'Watch' });

// Home: the newest videos
export const VideoShelf = () => {
    const list = useVideoList();
    const newest = [...(list.data ?? [])]
        .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
        .slice(0, 10);
    if (!newest.length) return null;
    return (
        <Stack gap="xs">
            <Group justify="space-between">
                <Text className={styles['row-title']}>New videos</Text>
                <Button onClick={openVideoWall} size="compact-xs" variant="subtle">
                    Watch all
                </Button>
            </Group>
            <div className={styles.row}>
                {newest.map((v) => (
                    <VideoCard key={v.videoId} v={v} />
                ))}
            </div>
        </Stack>
    );
};

// The player bar's Video button: only when Hermes Music has a video for the song
export const MusicVideoButton = () => {
    const song = usePlayerSong();
    const { data: video } = useMusicVideo(song?.artistName, song?.name);
    if (!song || !video) return null;
    return (
        <ActionIcon
            icon="musicVideo"
            iconProps={{ size: 'lg' }}
            onClick={(e) => {
                e.stopPropagation();
                openMusicVideo();
            }}
            onContextMenu={(e) => {
                e.preventDefault();
                useVideoWindow.setState({ floating: true, watch: null });
            }}
            size="sm"
            tooltip={{ label: 'Video (right-click: small window)', openDelay: 0 }}
            variant="subtle"
        />
    );
};
