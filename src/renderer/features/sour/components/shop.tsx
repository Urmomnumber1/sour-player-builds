import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';

import styles from './shop.module.css';

import { useHermesUrl } from '/@/renderer/features/hermes-video/store/hermes-video.store';
import { type SourProfile } from '/@/renderer/features/sour/api/sour-api';
import { OutfitPresets } from '/@/renderer/features/sour/components/extras105';
import { ProfileAvatar, ProfileName } from '/@/renderer/features/sour/components/profile-bits';
import {
    bannerClass,
    bannerStyle,
    ItemPreview,
} from '/@/renderer/features/sour/components/shop-looks';
import {
    useMyProfile,
    useSourProfiles,
    useSourStore,
} from '/@/renderer/features/sour/store/sour.store';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { NumberInput } from '/@/shared/components/number-input/number-input';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Select } from '/@/shared/components/select/select';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

// The Sour Shop: every song you listen to past halfway is a point (a bonus for songs new to you and for
// listening with friends; up to a few hundred a day). Spend them on looks for your profile, or gift them.
// No real money, no crates, no trading.
export interface ShopItem {
    available: boolean;
    custom: boolean;
    id: string;
    name: string;
    now: number;
    price: number;
    season: null | string;
    slot: Slot;
}
type Slot = 'banner' | 'bubble' | 'decoration' | 'effect' | 'frame' | 'nameStyle' | 'sidebar';

const SLOTS: { label: string; value: 'featured' | Slot }[] = [
    { label: 'Today', value: 'featured' },
    { label: 'Decorations', value: 'decoration' },
    { label: 'Frames', value: 'frame' },
    { label: 'Names', value: 'nameStyle' },
    { label: 'Banners', value: 'banner' },
    { label: 'Entrances', value: 'effect' },
    { label: 'Chat', value: 'bubble' },
    { label: 'Sidebar', value: 'sidebar' },
];

const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Hermes Music returned ${res.status}`);
    return json;
};

export const useShop = () => {
    const url = useHermesUrl();
    return useQuery({
        enabled: !!url,
        queryFn: async () => {
            const res = await fetch(`${url}/api/shop`);
            if (!res.ok) throw new Error(`Hermes Music returned ${res.status}`);
            return (await res.json()) as {
                cap: number;
                featured: string[];
                fund?: { done: boolean; goal: number; have: number };
                items: ShopItem[];
                sale: null | string;
            };
        },
        queryKey: ['sour-shop', url],
        staleTime: 5 * 60000,
    });
};

export const ShopPanel = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const qc = useQueryClient();
    const shop = useShop().data;
    const mine = useMyProfile().data;
    const friends = (useSourProfiles().data ?? []).filter((p) => p.id !== me?.id);
    const [tab, setTab] = useState<'featured' | Slot>('featured');
    const [trying, setTrying] = useState<null | ShopItem>(null);
    const [giftFor, setGiftFor] = useState<null | string>(null);
    const owned = new Set(mine?.owned ?? []);
    const equipped = mine?.looks ?? {};
    const wish = new Set(mine?.shopWish ?? []);
    const refresh = () => {
        qc.invalidateQueries({ queryKey: ['sour-me'] });
        qc.invalidateQueries({ queryKey: ['sour-profiles', url] });
    };
    const act = (path: string, body: Record<string, unknown>, done?: string) =>
        me &&
        post(`${url}/api/shop/${path}`, { ...body, key: me.key, profile: me.id })
            .then(() => {
                if (done) toast.success({ message: done });
                refresh();
            })
            .catch((e: Error) => toast.error({ message: e.message }));

    const list = useMemo(() => {
        const items = (shop?.items ?? []).filter((i) => i.available);
        if (tab === 'featured')
            return (shop?.featured ?? [])
                .map((id) => items.find((i) => i.id === id))
                .filter(Boolean) as ShopItem[];
        return items.filter((i) => i.slot === tab);
    }, [shop, tab]);

    if (!me || !mine) return <Text isMuted>Set up your profile first (Sour Hub &gt; People).</Text>;
    const points = mine.points ?? 0;
    const worn = (it: ShopItem) =>
        it.slot === 'decoration'
            ? mine.decoration === it.id
            : (equipped as Record<string, string | undefined>)[it.slot] === it.id;
    // "try it on": your avatar and name with the item
    const preview: SourProfile = trying
        ? {
              ...mine,
              decoration: trying.slot === 'decoration' ? trying.id : mine.decoration,
              looks: {
                  ...equipped,
                  ...(trying.slot !== 'decoration' ? { [trying.slot]: trying.id } : {}),
              },
          }
        : mine;
    return (
        <Stack gap="md">
            <div
                className={clsx(styles.wallet, bannerClass(preview.looks?.banner))}
                style={bannerStyle(preview.looks?.banner)}
            >
                <ProfileAvatar profile={preview} size={64} />
                <Stack gap={0}>
                    <ProfileName profile={preview} />
                    <Text size="sm">
                        <b>{points.toLocaleString()}</b> points - {mine.pointsToday ?? 0} of{' '}
                        {mine.pointsCap ?? 300} earned today
                    </Text>
                    <Text isMuted size="xs">
                        A point for every song you listen to past halfway. Songs new to you and
                        listening with friends give a bonus.
                    </Text>
                    {shop?.fund && (
                        <Text
                            size="xs"
                            title="A tenth of everything bought goes in. When it's full, everyone gets the Group crown."
                        >
                            Group fund:{' '}
                            {shop.fund.done
                                ? 'full - everyone got the Group crown!'
                                : `${shop.fund.have} / ${shop.fund.goal}`}
                        </Text>
                    )}
                </Stack>
                {trying && (
                    <Button ml="auto" onClick={() => setTrying(null)} size="xs" variant="subtle">
                        Stop trying on
                    </Button>
                )}
            </div>

            <SegmentedControl data={SLOTS} onChange={(v) => setTab(v as typeof tab)} value={tab} />

            <div className={styles.grid}>
                {list.map((it) => {
                    const sale = shop?.sale === it.id;
                    const have = owned.has(it.id);
                    return (
                        <div className={clsx(styles.card, { [styles.sale]: sale })} key={it.id}>
                            <div className={styles.previewBox}>
                                <ItemPreview id={it.id} name={it.name} slot={it.slot} />
                            </div>
                            <Text fw={700} size="sm" truncate>
                                {it.name}
                            </Text>
                            <Text isMuted size="xs">
                                {sale ? (
                                    <>
                                        <s>{it.price}</s> {it.now} points (sale today)
                                    </>
                                ) : (
                                    `${it.now} points`
                                )}
                                {it.season ? ` - ${it.season}` : ''}
                            </Text>
                            <Group gap={4} wrap="nowrap">
                                {have ? (
                                    <Button
                                        onClick={() =>
                                            act('equip', {
                                                item: worn(it) ? null : it.id,
                                                slot: it.slot,
                                            })
                                        }
                                        size="compact-xs"
                                        variant={worn(it) ? 'filled' : 'default'}
                                    >
                                        {worn(it) ? 'Wearing' : 'Wear'}
                                    </Button>
                                ) : (
                                    <Button
                                        disabled={points < it.now}
                                        onClick={() =>
                                            act('buy', { item: it.id }, `You got ${it.name}`)
                                        }
                                        size="compact-xs"
                                    >
                                        Buy
                                    </Button>
                                )}
                                <Button
                                    onClick={() => setTrying(it)}
                                    size="compact-xs"
                                    variant="subtle"
                                >
                                    Try on
                                </Button>
                                <Button
                                    onClick={() => setGiftFor(giftFor === it.id ? null : it.id)}
                                    size="compact-xs"
                                    title="Gift it to a friend"
                                    variant="subtle"
                                >
                                    🎁
                                </Button>
                                <Button
                                    onClick={() => act('wish', { item: it.id })}
                                    size="compact-xs"
                                    title="Your wishlist (friends can see it)"
                                    variant="subtle"
                                >
                                    {wish.has(it.id) ? '★' : '☆'}
                                </Button>
                            </Group>
                            {giftFor === it.id && (
                                <GiftBox
                                    friends={friends}
                                    item={it}
                                    onSend={(to, note) =>
                                        Promise.resolve(
                                            act(
                                                'buy',
                                                { item: it.id, note, to },
                                                `Sent ${it.name}`,
                                            ),
                                        ).then(() => setGiftFor(null))
                                    }
                                />
                            )}
                        </div>
                    );
                })}
                {!list.length && <Text isMuted>Nothing here right now.</Text>}
            </div>

            <Stack gap={4}>
                <Text fw={700} size="sm">
                    Your points lately
                </Text>
                {(mine.pointsLog ?? []).slice(0, 8).map((l, i) => (
                    <Text isMuted key={`${l.at}-${i}`} size="xs">
                        {l.n > 0 ? `+${l.n}` : l.n} {l.why}
                    </Text>
                ))}
            </Stack>
            <OutfitPresets />
            {mine.admin && <AdminItems />}
        </Stack>
    );
};

const GiftBox = ({
    friends,
    item,
    onSend,
}: {
    friends: SourProfile[];
    item: ShopItem;
    onSend: (to: string, note: string) => void;
}) => {
    const [to, setTo] = useState<null | string>(null);
    const [note, setNote] = useState('');
    const wished = friends.filter((f) => f.shopWish?.includes(item.id));
    return (
        <Stack gap={4}>
            <Select
                data={friends.map((f) => ({
                    label: `${f.name}${wished.includes(f) ? ' (wants it!)' : ''}`,
                    value: f.id,
                }))}
                onChange={setTo}
                placeholder="Gift it to..."
                size="xs"
                value={to}
            />
            <TextInput
                onChange={(e) => setNote(e.currentTarget.value)}
                placeholder="A note (optional)"
                size="xs"
                value={note}
            />
            <Button disabled={!to} onClick={() => to && onSend(to, note)} size="compact-xs">
                Send gift ({item.now} points)
            </Button>
        </Stack>
    );
};

// admins add their own items (a picture they upload), priced in points
const AdminItems = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const qc = useQueryClient();
    const [name, setName] = useState('');
    const [price, setPrice] = useState<number | string>(500);
    const [image, setImage] = useState<null | string>(null);
    const file = useRef<HTMLInputElement>(null);
    return (
        <Stack className={styles.admin} gap={6}>
            <Text fw={700} size="sm">
                Add an item (admins)
            </Text>
            <Text isMuted size="xs">
                A decoration from your own picture (PNG with a see-through background works best).
            </Text>
            <Group gap="xs" wrap="nowrap">
                <TextInput
                    onChange={(e) => setName(e.currentTarget.value)}
                    placeholder="Name"
                    size="xs"
                    style={{ flex: 1 }}
                    value={name}
                />
                <NumberInput
                    min={10}
                    onChange={setPrice}
                    size="xs"
                    style={{ width: 100 }}
                    suffix=" pts"
                    value={price}
                />
                <Button onClick={() => file.current?.click()} size="xs" variant="default">
                    {image ? 'Picture ✓' : 'Picture'}
                </Button>
                <Button
                    disabled={!name.trim() || !image}
                    onClick={() =>
                        me &&
                        post(`${url}/api/shop/items`, {
                            image,
                            key: me.key,
                            name,
                            price: Number(price),
                            profile: me.id,
                            slot: 'decoration',
                        })
                            .then(() => {
                                toast.success({ message: `${name} is in the shop` });
                                setName('');
                                setImage(null);
                                qc.invalidateQueries({ queryKey: ['sour-shop', url] });
                            })
                            .catch((e: Error) => toast.error({ message: e.message }))
                    }
                    size="xs"
                >
                    Add
                </Button>
            </Group>
            <input
                accept="image/png,image/webp,image/gif,image/jpeg"
                hidden
                onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    if (!f) return;
                    const fr = new FileReader();
                    fr.onload = () => setImage(String(fr.result));
                    fr.readAsDataURL(f);
                }}
                ref={file}
                type="file"
            />
        </Stack>
    );
};

// in the background: a gift arrived
export const ShopGifts = () => {
    const url = useHermesUrl();
    const me = useSourStore((s) => s.me);
    const mine = useMyProfile().data;
    const shop = useShop().data;
    const shown = useRef(false);
    useEffect(() => {
        const fresh = (mine?.gifts ?? []).filter((g) => !g.seen);
        if (!fresh.length || !me || shown.current) return;
        shown.current = true;
        for (const g of fresh) {
            const item = shop?.items.find((i) => i.id === g.item);
            toast.success({
                autoClose: 12000,
                message: `🎁 ${g.from} gave you ${item?.name ?? 'something from the shop'}${g.note ? `: "${g.note}"` : ''} - wear it in Sour Hub > Shop`,
            });
        }
        post(`${url}/api/shop/gifts/seen`, { key: me.key, profile: me.id }).catch(() => {});
    }, [me, mine?.gifts, shop, url]);
    return null;
};
