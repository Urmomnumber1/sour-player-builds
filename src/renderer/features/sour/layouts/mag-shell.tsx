import { useNavigate } from 'react-router';

import { TransportButtons } from '/@/renderer/features/player/components/center-controls';
import { PlayerbarSlider } from '/@/renderer/features/player/components/playerbar-slider';
import {
    FavoriteButton,
    VolumeButton,
} from '/@/renderer/features/player/components/right-controls';
import { SidebarPins } from '/@/renderer/features/sour/components/look';
import { openSourStudio } from '/@/renderer/features/sour/components/sour-studio';
import {
    Frame,
    InboxBell,
    LibraryStrip,
    longDate,
    MeButton,
    MoreTools,
    NavButton,
    NowAlbum,
    NowArtist,
    NowCover,
    NowTitle,
    Page,
    Points,
    SearchButton,
    SettingsButton,
    SliceMark,
    StatusBits,
    type ToolKey,
    Tools,
    UpNextList,
    useFriends,
    useHermesState,
    useMainNav,
    useQueueLength,
    useRequests,
} from '/@/renderer/features/sour/layouts/layout-bits';
import { toggleStage } from '/@/renderer/features/sour/stage/sour-stage';
import { PlayerBarVisualizer } from '/@/renderer/features/sour/visualizer/sour-visualizer';
import { AppRoute } from '/@/renderer/router/routes';
import { Icon } from '/@/shared/components/icon/icon';

const TOOLS_A: ToolKey[] = ['lyrics', 'video', 'queue', 'sound', 'sleep', 'autodj'];
const TOOLS_B: ToolKey[] = ['group', 'request', 'people', 'mini', 'rating', 'tools'];
const SHOWN: ToolKey[] = [...TOOLS_A, ...TOOLS_B, 'love'];

const HERMES: Record<string, string> = {
    checking: 'Connecting to Hermes',
    none: 'No Hermes Music set up',
    offline: 'Hermes offline',
    online: 'Hermes online',
};

// Magazine: paper and ink. A masthead with the menu across the top, a dateline with what the group is
// up to, the page in the middle and the Now Playing column on the right.
const MagShell = () => {
    const navigate = useNavigate();
    const nav = useMainNav();
    const { online } = useFriends();
    const listening = online.filter((p) => p.listening).length;
    const grouped = online.find((p) => p.group);
    const coming = useRequests().filter((r) => r.status !== 'done' && r.status !== 'failed').length;
    const hermes = useHermesState();
    return (
        <Frame kind="mag">
            <header className="x-mast">
                <div className="x-mast-top">
                    <button
                        className="x-logo"
                        onClick={() => navigate(AppRoute.HOME)}
                        type="button"
                    >
                        <SliceMark />
                        <span>Sour Player</span>
                    </button>
                    <nav className="x-mast-nav">
                        {nav.map((item) => (
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
                    </nav>
                    <div className="x-mast-tools">
                        <SearchButton wide />
                        <InboxBell />
                        <SettingsButton />
                        <Points />
                        <MeButton />
                    </div>
                </div>
                <div className="x-dateline">
                    <span>{longDate()}</span>
                    <span>
                        {listening
                            ? `${listening} friend${listening === 1 ? '' : 's'} listening`
                            : 'No friends listening'}
                    </span>
                    {grouped?.group && (
                        <span>
                            {grouped.name} is in {grouped.group.name}
                        </span>
                    )}
                    {!!coming && (
                        <span>
                            {coming} request{coming === 1 ? '' : 's'} on the way
                        </span>
                    )}
                    <StatusBits />
                    <span className={`x-hermes x-hermes-${hermes}`}>{HERMES[hermes]}</span>
                </div>
                <LibraryStrip />
                <div className="x-pins">
                    <SidebarPins />
                </div>
            </header>
            <div className="x-mag-body">
                <Page />
                <NowPlayingColumn />
            </div>
        </Frame>
    );
};

const NowPlayingColumn = () => {
    const queued = useQueueLength();
    return (
        <aside className="x-np">
            <div className="x-np-head">
                <h3>Now playing</h3>
                <button className="x-np-full" onClick={() => toggleStage(true)} type="button">
                    Full screen <Icon icon="expand" />
                </button>
            </div>
            <NowCover />
            <div className="x-np-title">
                <NowTitle />
            </div>
            <div className="x-np-meta">
                <NowArtist />
                <NowAlbum />
                <span className="x-np-love">
                    <FavoriteButton />
                </span>
            </div>
            <div className="x-np-seek">
                <PlayerbarSlider />
            </div>
            <div className="x-np-transport">
                <TransportButtons />
            </div>
            <div className="x-np-volume">
                <VolumeButton />
            </div>
            <Tools className="x-np-tools" keys={TOOLS_A} />
            <div className="x-np-tools2">
                <Tools keys={TOOLS_B} />
                <MoreTools shown={SHOWN} />
            </div>
            <div className="x-np-viz">
                <PlayerBarVisualizer />
            </div>
            <section className="x-np-next">
                <div className="x-sec-h">
                    <h3>Up next</h3>
                    <span>{queued ? `${queued} in the queue` : ''}</span>
                </div>
                <UpNextList count={6} />
            </section>
        </aside>
    );
};

export default MagShell;
