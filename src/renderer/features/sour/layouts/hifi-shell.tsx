import {
    type CSSProperties,
    type KeyboardEvent,
    type PointerEvent,
    type ReactNode,
    useRef,
} from 'react';

import { useGroupPlayStore } from '/@/renderer/features/group-play/store/group-play.store';
import { openRequestWindow } from '/@/renderer/features/hermes-request/components/request-button';
import { TransportButtons } from '/@/renderer/features/player/components/center-controls';
import { PlayerbarSlider } from '/@/renderer/features/player/components/playerbar-slider';
import { VolumeButton } from '/@/renderer/features/player/components/right-controls';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { SidebarPins } from '/@/renderer/features/sour/components/look';
import { openSourStudio } from '/@/renderer/features/sour/components/sour-studio';
import {
    Frame,
    InboxBell,
    MeButton,
    MoreTools,
    NavButton,
    NowAlbum,
    NowArtist,
    NowCover,
    NowTitle,
    Page,
    Points,
    requestStep,
    SearchButton,
    SettingsButton,
    StatusBits,
    type ToolKey,
    Tools,
    UpNextList,
    useLibraryNav,
    useMainNav,
    useMe,
    useNow,
    useQueueLength,
    useRequests,
} from '/@/renderer/features/sour/layouts/layout-bits';
import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { PlayerBarVisualizer } from '/@/renderer/features/sour/visualizer/sour-visualizer';
import {
    useAutoDJSettings,
    usePlayerMuted,
    usePlayerRepeat,
    usePlayerShuffle,
    usePlayerStatus,
    usePlayerTimestamp,
    usePlayerVolume,
} from '/@/renderer/store';
import { PlayerRepeat, PlayerShuffle, PlayerStatus } from '/@/shared/types/types';

const KEYS: ToolKey[] = [
    'lyrics',
    'video',
    'sound',
    'sleep',
    'autodj',
    'group',
    'mini',
    'stage',
    'love',
    'request',
    'queue',
];

const mmss = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// Hi-Fi: the app as a piece of audio gear. The deck across the top is the player (display, keys, a
// volume knob, function keys with lamps); the rack on the left is the menu; the queue sits on the right.
const HifiShell = () => (
    <Frame kind="hifi">
        <Deck />
        <div className="x-hifi-under">
            <Rack />
            <Page />
            <Side />
        </div>
    </Frame>
);

const Flag = ({ children, on }: { children: string; on?: boolean }) => (
    <span className={on ? 'x-flag x-on' : 'x-flag'}>{children}</span>
);

const Deck = () => {
    const song = useNow();
    const shuffle = usePlayerShuffle();
    const repeat = usePlayerRepeat();
    const autoDJ = useAutoDJSettings();
    const group = useGroupPlayStore((s) => s.code);
    const priv = useSourStore((s) => s.privateSession);
    const quality = song
        ? [song.container?.toUpperCase(), song.bitRate ? `${song.bitRate} kbps` : null]
              .filter(Boolean)
              .join(' ')
        : '';
    return (
        <header className="x-deck">
            <NowCover />
            <div className="x-lcd">
                <div className="x-lcd-flags">
                    <Flag on={!!quality}>{quality || 'No disc'}</Flag>
                    <Flag on={!!autoDJ?.enabled}>Auto DJ</Flag>
                    <Flag on={shuffle !== PlayerShuffle.NONE}>Shuffle</Flag>
                    <Flag on={repeat !== PlayerRepeat.NONE}>
                        {repeat === PlayerRepeat.ONE ? 'Repeat 1' : 'Repeat'}
                    </Flag>
                    <Flag on={!!group}>Group</Flag>
                    <Flag on={!!priv}>Private</Flag>
                </div>
                <div className="x-lcd-main">
                    <div className="x-lcd-title">
                        <NowTitle fallback="No disc" />
                    </div>
                    <div className="x-lcd-viz">
                        <PlayerBarVisualizer />
                    </div>
                    <LcdTime />
                </div>
                <div className="x-lcd-sub">
                    <NowArtist />
                    <NowAlbum />
                </div>
                <div className="x-lcd-seek">
                    <PlayerbarSlider />
                </div>
            </div>
            <div className="x-keys">
                <TransportButtons />
            </div>
            <Knob />
            <div className="x-fkeys">
                <Tools keys={KEYS} />
                <MoreTools shown={KEYS} />
            </div>
        </header>
    );
};

const LcdTime = () => {
    const at = usePlayerTimestamp();
    const song = useNow();
    const status = usePlayerStatus();
    const total = (song?.duration ?? 0) / 1000;
    return (
        <div className={status === PlayerStatus.PLAYING ? 'x-lcd-time' : 'x-lcd-time x-paused'}>
            <b>{mmss(at)}</b>
            <span>-{mmss(total - at)}</span>
        </div>
    );
};

// the volume knob: drag up or down, scroll, or use the arrow keys; the speaker below mutes (right-click
// it for the audio output)
const Knob = () => {
    const volume = usePlayerVolume();
    const muted = usePlayerMuted();
    const { setVolume } = usePlayer();
    const drag = useRef<null | { at: number; v: number; y: number }>(null);
    const set = (v: number) => setVolume(Math.max(0, Math.min(100, Math.round(v))));
    const down = (e: PointerEvent<HTMLDivElement>) => {
        drag.current = { at: 0, v: volume, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d) return;
        const now = performance.now();
        if (now - d.at < 40) return; // the player doesn't need more than 25 changes a second
        d.at = now;
        set(d.v + (d.y - e.clientY) * 0.5);
    };
    const key = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(volume + 5);
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(volume - 5);
        else return;
        e.preventDefault();
    };
    const level = muted ? 0 : volume / 100;
    return (
        <div className="x-knob">
            <div
                aria-label="Volume"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={volume}
                className="x-knob-dial"
                onKeyDown={key}
                onPointerCancel={() => (drag.current = null)}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={() => (drag.current = null)}
                onWheel={(e) => set(volume + (e.deltaY < 0 ? 4 : -4))}
                role="slider"
                style={{ '--level': level } as CSSProperties}
                tabIndex={0}
            >
                <KnobFace level={level} />
            </div>
            <div className="x-knob-foot">
                <VolumeButton />
                <span className="x-knob-val">{muted ? 'Mute' : volume}</span>
            </div>
        </div>
    );
};

const point = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(42 + r * Math.sin(a)).toFixed(1)} ${(42 - r * Math.cos(a)).toFixed(1)}`;
};

const KnobFace = ({ level }: { level: number }) => {
    const ticks: ReactNode[] = [];
    for (let i = 0; i <= 24; i++) {
        const deg = -135 + (270 * i) / 24;
        ticks.push(
            <path
                className={i / 24 <= level && level > 0 ? 'x-tick x-on' : 'x-tick'}
                d={`M${point(35, deg)} L${point(40, deg)}`}
                key={i}
            />,
        );
    }
    const deg = -135 + 270 * level;
    return (
        <svg aria-hidden viewBox="0 0 84 84">
            {ticks}
            <circle className="x-knob-shadow" cx="42" cy="43.5" r="28" />
            <circle className="x-knob-body" cx="42" cy="42" r="28" />
            <circle className="x-knob-cap" cx="42" cy="42" r="21" />
            <path className="x-knob-mark" d={`M${point(9, deg)} L${point(24, deg)}`} />
        </svg>
    );
};

const Rack = () => {
    const main = useMainNav();
    const library = useLibraryNav();
    const me = useMe();
    const home = main.find((i) => i.key === 'home');
    const sour = main.filter((i) => !['home', 'library', 'playlists'].includes(i.key));
    return (
        <aside className="x-rack">
            <SearchButton wide />
            <div className="x-rack-h">Library</div>
            {home && <NavButton item={home} />}
            {library.map((item) => (
                <NavButton item={item} key={item.key} />
            ))}
            <div className="x-rack-h">Sour</div>
            {sour.map((item) => (
                <NavButton item={item} key={item.key} />
            ))}
            <NavButton
                item={{
                    go: openSourStudio,
                    icon: 'palette',
                    key: 'studio',
                    label: 'Studio',
                    on: false,
                }}
            />
            <div className="x-pins">
                <SidebarPins />
            </div>
            <div className="x-rack-me">
                <MeButton size={32} />
                <div className="x-rack-me-text">
                    <b>{me?.name ?? 'Sour Player'}</b>
                    <Points />
                </div>
                <InboxBell />
                <SettingsButton />
            </div>
        </aside>
    );
};

const Module = ({
    children,
    idx,
    right,
    title,
}: {
    children: ReactNode;
    idx: string;
    right?: string;
    title: string;
}) => (
    <section className="x-mod">
        <div className="x-mod-h">
            <span className="x-mod-idx">{idx}</span>
            <span className="x-mod-title">{title}</span>
            {right && <span className="x-mod-right">{right}</span>}
        </div>
        <div className="x-mod-b">{children}</div>
    </section>
);

const Side = () => {
    const song = useNow();
    const queued = useQueueLength();
    const requests = useRequests()
        .filter((r) => r.status !== 'done')
        .slice(0, 4);
    return (
        <aside className="x-side">
            <Module idx="Q" right={queued ? `${queued} songs` : 'empty'} title="Queue">
                <div className="x-q-now">
                    <span className="x-q-play">&#9654;</span>
                    <b>{song?.name ?? 'Nothing playing'}</b>
                </div>
                <UpNextList count={7} />
            </Module>
            <Module idx="R" right="Hermes" title="Requests">
                {requests.map((r) => {
                    const step = requestStep(r);
                    return (
                        <div className="x-rq" key={r.id}>
                            <div className="x-rq-top">
                                <b>{r.title || r.query}</b>
                                <span>
                                    {step.label} {step.pct ? `${step.pct}%` : ''}
                                </span>
                            </div>
                            <div
                                className="x-segs"
                                style={{ '--pct': `${step.pct}%` } as CSSProperties}
                            />
                        </div>
                    );
                })}
                {!requests.length && <p className="x-empty">Nothing on the way.</p>}
                <button className="x-key-btn" onClick={openRequestWindow} type="button">
                    Request music
                </button>
            </Module>
            <Module idx="S" title="Status">
                <StatusBits />
            </Module>
        </aside>
    );
};

export default HifiShell;
