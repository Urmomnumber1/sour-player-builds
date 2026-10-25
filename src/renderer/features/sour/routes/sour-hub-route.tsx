import styles from '../components/hub.module.css';

import { NativeScrollArea } from '/@/renderer/components/native-scroll-area/native-scroll-area';
import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import {
    ColorOfTheDay,
    DuelsPanel,
    FeedPanel,
    GiftsPanel,
    HotSeatCard,
    RequestsPanel,
    TasteMap,
    WrappedNightCard,
} from '/@/renderer/features/sour/components/hub-panels';
import { ShopPanel } from '/@/renderer/features/sour/components/shop';
import {
    AlbumClubCard,
    DailyGuessCard,
    PollsCard,
    WhosUpCard,
} from '/@/renderer/features/sour/components/social10';
import { SourSafe } from '/@/renderer/features/sour/components/sour-safe';
import { Tabs } from '/@/shared/components/tabs/tabs';
import { Text } from '/@/shared/components/text/text';

// The Sour Hub: the friend group's games and goings-on in one place.
const SourHubRoute = () => {
    const url = useHermesUrl();
    return (
        <NativeScrollArea>
            <div className={styles.page}>
                <h1 className={styles.title}>Sour Hub</h1>
                {!url ? (
                    <Text isMuted>
                        Set your Hermes Music address first (Settings &gt; General &gt; Music
                        videos).
                    </Text>
                ) : (
                    <Tabs
                        defaultValue={
                            new URLSearchParams(window.location.hash.split('?')[1] || '').get(
                                'tab',
                            ) || 'feed'
                        }
                        keepMounted={false}
                    >
                        <Tabs.List>
                            <Tabs.Tab value="feed">Feed</Tabs.Tab>
                            <Tabs.Tab value="shop">Shop</Tabs.Tab>
                            <Tabs.Tab value="duels">Duels</Tabs.Tab>
                            <Tabs.Tab value="gifts">Gifts and capsules</Tabs.Tab>
                            <Tabs.Tab value="map">Taste map</Tabs.Tab>
                            <Tabs.Tab value="requests">Requests</Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel pt="md" value="feed">
                            <div className={styles.columns}>
                                <SourSafe name="feed">
                                    <FeedPanel />
                                </SourSafe>
                                <div className={styles.list}>
                                    <SourSafe name="daily guess">
                                        <DailyGuessCard />
                                    </SourSafe>
                                    <SourSafe name="who's up">
                                        <WhosUpCard />
                                    </SourSafe>
                                    <SourSafe name="album club">
                                        <AlbumClubCard />
                                    </SourSafe>
                                    <SourSafe name="polls">
                                        <PollsCard />
                                    </SourSafe>
                                    <SourSafe name="hot seat">
                                        <HotSeatCard />
                                    </SourSafe>
                                    <SourSafe name="colour of the day">
                                        <ColorOfTheDay />
                                    </SourSafe>
                                    <SourSafe name="recap night">
                                        <WrappedNightCard />
                                    </SourSafe>
                                </div>
                            </div>
                        </Tabs.Panel>
                        <Tabs.Panel pt="md" value="duels">
                            <SourSafe name="duels">
                                <DuelsPanel />
                            </SourSafe>
                        </Tabs.Panel>
                        <Tabs.Panel pt="md" value="gifts">
                            <SourSafe name="gifts">
                                <GiftsPanel />
                            </SourSafe>
                        </Tabs.Panel>
                        <Tabs.Panel pt="md" value="shop">
                            <SourSafe name="shop">
                                <ShopPanel />
                            </SourSafe>
                        </Tabs.Panel>
                        <Tabs.Panel pt="md" value="map">
                            <SourSafe name="taste map">
                                <TasteMap />
                            </SourSafe>
                        </Tabs.Panel>
                        <Tabs.Panel pt="md" value="requests">
                            <SourSafe name="requests">
                                <RequestsPanel />
                            </SourSafe>
                        </Tabs.Panel>
                    </Tabs>
                )}
            </div>
        </NativeScrollArea>
    );
};

export default SourHubRoute;
