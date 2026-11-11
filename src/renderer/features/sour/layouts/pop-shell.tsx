import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useGroupPlayStore } from '/@/renderer/features/group-play/store/group-play.store';
import { TransportButtons } from '/@/renderer/features/player/components/center-controls';
import { PlayerbarSlider } from '/@/renderer/features/player/components/playerbar-slider';
import {
    FavoriteButton,
    VolumeButton,
} from '/@/renderer/features/player/components/right-controls';
import { HotSeatCard } from '/@/renderer/features/sour/components/hub-panels';
import { SidebarPins } from '/@/renderer/features/sour/components/look';
import { SourSafe } from '/@/renderer/features/sour/components/sour-safe';
import { openSourStudio } from '/@/renderer/features/sour/components/sour-studio';
import {
    Frame,
    FriendRow,
    greeting,
    InboxBell,
    LibraryStrip,
    MeButton,
    MoreTools,
    NavButton,
    NowArtist,
    NowCover,
    NowTitle,
    Page,
    Points,
    SearchButton,
    SliceMark,
    StatusBits,
    type ToolKey,
    Tools,
    useFriends,
    useMainNav,
    useMe,
} from '/@/renderer/features/sour/layouts/layout-bits';
import { PlayerBarVisualizer } from '/@/renderer/features/sour/visualizer/sour-visualizer';
import { AppRoute } from '/@/renderer/router/routes';
import { Icon } from '/@/shared/components/icon/icon';

const KEYS: ToolKey[] = ['lyrics', 'video', 'queue', 'sound', 'sleep', 'autodj', 'group'];

// Pop: sour-candy colours, thick outlines and hard shadows (everything is a sticker). An icon rail on the
// left, friends on the right and the player floating at the bottom.
const PopShell = () => (
    <Frame kind="pop">
        <div className="x-pop">
            <Rail />
            <div className="x-pop-center">
                <TopBar />
                <LibraryStrip />
                <Page />
            </div>
            <Pals />
        </div>
        <PopPlayer />
    </Frame>
);

const Rail = () => {
    const navigate = useNavigate();
    const nav = useMainNav();
    return (
        <aside className="x-rail">
            <button
                className="x-logo"
                onClick={() => navigate(AppRoute.HOME)}
                title="Home"
                type="button"
            >
                <SliceMark size={46} />
            </button>
            {nav.map((item) => (
                <NavButton item={item} key={item.key} />
            ))}
            <span className="x-grow" />
            <NavButton
                item={{
                    go: openSourStudio,
                    icon: 'palette',
                    key: 'studio',
                    label: 'Studio',
                    on: false,
                }}
            />
            <NavButton
                item={{
                    go: () => navigate(AppRoute.SETTINGS),
                    icon: 'settings',
                    key: 'settings',
                    label: 'Settings',
                    on: false,
                }}
            />
        </aside>
    );
};

const TopBar = () => {
    const { pathname } = useLocation();
    const me = useMe();
    const home = pathname === '/' || pathname === '';
    return (
        <div className="x-top">
            <h1 className="x-greet">{home ? `${greeting()}${me ? `, ${me.name}` : ''}` : ''}</h1>
            <StatusBits />
            <SearchButton wide />
            <InboxBell />
            <Points suffix="" />
            <MeButton />
        </div>
    );
};

const Pals = () => {
    const { offline, online } = useFriends();
    const [all, setAll] = useState(false);
    return (
        <aside className="x-pals">
            <div className="x-pals-h">
                <h3>Friends</h3>
                <span className="x-tag">{online.length} on</span>
            </div>
            <div className="x-pals-list">
                {online.map((p) => (
                    <FriendRow key={p.id} p={p} />
                ))}
                {!online.length && <p className="x-empty">Nobody else is on right now.</p>}
                {(all ? offline : offline.slice(0, 3)).map((p) => (
                    <FriendRow cover={false} key={p.id} p={p} />
                ))}
                {offline.length > 3 && (
                    <button className="x-link" onClick={() => setAll((v) => !v)} type="button">
                        {all ? 'Show fewer' : `All ${offline.length} offline`}
                    </button>
                )}
            </div>
            <button
                className="x-big-btn"
                onClick={() => useGroupPlayStore.setState({ panelOpen: true })}
                type="button"
            >
                <Icon icon="groupPlay" /> Start a Group Play
            </button>
            <div className="x-pals-card">
                <SourSafe name="hot seat">
                    <HotSeatCard />
                </SourSafe>
            </div>
            <div className="x-pins">
                <SidebarPins />
            </div>
        </aside>
    );
};

const PopPlayer = () => (
    <div className="x-box">
        <div className="x-box-now">
            <NowCover />
            <div className="x-box-text">
                <NowTitle />
                <NowArtist />
            </div>
            <span className="x-box-love">
                <FavoriteButton />
            </span>
        </div>
        <div className="x-box-mid">
            <TransportButtons />
            <PlayerbarSlider />
        </div>
        <div className="x-box-tools">
            <Tools keys={KEYS} />
            <MoreTools shown={[...KEYS, 'love']} />
            <PlayerBarVisualizer />
            <VolumeButton />
        </div>
    </div>
);

export default PopShell;
