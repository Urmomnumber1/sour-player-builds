import clsx from 'clsx';
import { type ComponentProps, useEffect, useState } from 'react';

import styles from './discord-bot.module.css';

import { NativeScrollArea } from '/@/renderer/components/native-scroll-area/native-scroll-area';
import {
    type BotMember,
    type BotState,
    time,
    useBot,
    useBotAccess,
} from '/@/renderer/features/sour/discord-bot/bot-api';
import { BotLibraryPanel, short } from '/@/renderer/features/sour/discord-bot/bot-library';
import { Button } from '/@/shared/components/button/button';
import { Icon } from '/@/shared/components/icon/icon';
import { Slider } from '/@/shared/components/slider/slider';
import { Text } from '/@/shared/components/text/text';

// The Discord Bot tab: music, ambience and sound effects in a Discord voice channel, for D&D nights.
// Hermes Music runs the bot; this page picks the voice channel, plays, and keeps the bot's own library.

export type Bot = ReturnType<typeof useBot>;
type IconName = ComponentProps<typeof Icon>['icon'];
interface Props {
    bot: Bot;
    s: BotState;
}

const DiscordBotRoute = () => {
    const allowed = useBotAccess();
    const bot = useBot(allowed);
    const s = bot.state;
    return (
        <NativeScrollArea>
            <div className={styles.page}>
                <Header bot={bot} />
                {!allowed ? (
                    <div className={styles.card}>
                        <Text>
                            The Discord bot is for admins and the people they allow. Ask an admin to
                            turn it on for you in Hermes Music &gt; Config &gt; Sour Player
                            accounts.
                        </Text>
                    </div>
                ) : !s ? (
                    <Text isMuted>{bot.error ? bot.error.message : 'Asking Hermes Music...'}</Text>
                ) : !s.configured ? (
                    <div className={styles.card}>
                        <Text fw={700}>There&apos;s no bot yet</Text>
                        <Text size="sm">
                            An admin sets it up once in Hermes Music &gt; Config &gt; Discord bot:
                            make a bot on Discord&apos;s developer page, paste its token there, then
                            invite it to your server.
                        </Text>
                    </div>
                ) : (
                    <>
                        <Voice bot={bot} s={s} />
                        <div className={styles.columns}>
                            <Music bot={bot} s={s} />
                            <div className={styles.stack}>
                                <Ambience bot={bot} s={s} />
                                <Effects bot={bot} s={s} />
                            </div>
                        </div>
                        <BotLibraryPanel bot={bot} />
                    </>
                )}
            </div>
        </NativeScrollArea>
    );
};

export default DiscordBotRoute;

const Header = ({ bot }: { bot: Bot }) => {
    const s = bot.state;
    const status = !s
        ? ''
        : !s.configured
          ? 'not set up yet'
          : s.installing
            ? 'getting ready (about a minute)...'
            : s.online
              ? `online as ${s.name}${s.fake ? ' (test mode, no Discord)' : ''}`
              : s.error
                ? `offline: ${s.error}`
                : 'starting...';
    return (
        <div className={styles.header}>
            <div className={styles.headText}>
                <h1 className={styles.title}>Discord Bot</h1>
                {s && (
                    <div className={styles.status}>
                        <span className={clsx(styles.dot, s.online && styles.dotOn)} />
                        {status}
                    </div>
                )}
            </div>
            {s?.voice && (
                <Button
                    color="red"
                    leftSection={<Icon icon="mediaStop" />}
                    onClick={() => bot.act('stopAll')}
                    variant="filled"
                >
                    Stop everything
                </Button>
            )}
        </div>
    );
};

const Avatar = ({ m }: { m: BotMember }) =>
    m.avatar ? (
        <img alt={m.name} className={styles.avatar} src={m.avatar} title={m.name} />
    ) : (
        <span className={styles.avatar} title={m.name}>
            {m.name.slice(0, 1).toUpperCase()}
        </span>
    );

export const IconBtn = ({
    big,
    disabled,
    icon,
    label,
    on,
    onClick,
    small,
}: {
    big?: boolean;
    disabled?: boolean;
    icon: IconName;
    label: string;
    on?: boolean;
    onClick: () => void;
    small?: boolean;
}) => (
    <button
        aria-label={label}
        className={clsx(
            styles.iconBtn,
            big && styles.iconBig,
            small && styles.iconSmall,
            on && styles.iconOn,
        )}
        disabled={disabled}
        onClick={onClick}
        title={label}
        type="button"
    >
        <Icon icon={icon} size={big ? 'xl' : small ? 'sm' : 'lg'} />
    </button>
);

const VolumeRow = ({
    bot,
    label,
    layer,
    value,
}: {
    bot: Bot;
    label: string;
    layer: 'ambience' | 'master' | 'music' | 'sfx';
    value: number;
}) => (
    <div className={styles.volume}>
        <Icon icon="volumeNormal" />
        <span className={styles.volLabel}>{label}</span>
        <Slider
            className={styles.grow}
            defaultValue={value}
            key={value}
            label={(v) => `${Math.round(v * 100)}%`}
            max={1.5}
            min={0}
            onChangeEnd={(v) => bot.act('volume', { args: { layer, value: v } })}
            size="xs"
            step={0.05}
        />
    </div>
);

// ---------- the voice channel: who's where, join, switch, leave ----------
const Voice = ({ bot, s }: Props) => {
    const [pick, setPick] = useState(false);
    const [busy, setBusy] = useState('');
    const v = s.voice;
    const join = async (guildId: string, channelId: string) => {
        setBusy(channelId);
        try {
            await bot.act('join', { channelId, guildId });
            setPick(false);
        } catch {
            // the error is shown
        } finally {
            setBusy('');
        }
    };
    const people = v ? v.members.filter((m) => !m.bot) : [];
    return (
        <div className={styles.card}>
            <div className={styles.cardTitle}>
                <Icon icon="volumeMax" /> Voice channel
            </div>
            {v && (
                <div className={styles.inCall}>
                    <div className={styles.callText}>
                        <strong>{v.channelName || 'A voice channel'}</strong>
                        <span className={styles.muted}>
                            {[
                                v.guildName,
                                v.status === 'ready' ? '' : 'connecting...',
                                people.length
                                    ? people.map((m) => m.name).join(', ')
                                    : 'nobody else is in it',
                            ]
                                .filter(Boolean)
                                .join(' - ')}
                        </span>
                    </div>
                    <span className={styles.avatars}>
                        {people.slice(0, 6).map((m) => (
                            <Avatar key={m.id} m={m} />
                        ))}
                    </span>
                    <Button onClick={() => setPick(!pick)} size="compact-sm" variant="default">
                        {pick ? 'Done' : 'Switch'}
                    </Button>
                    <Button
                        leftSection={<Icon icon="signOut" />}
                        onClick={() => bot.act('leave')}
                        size="compact-sm"
                        variant="default"
                    >
                        Leave
                    </Button>
                </div>
            )}
            {!s.online && (
                <Text isMuted size="sm">
                    The bot is offline{s.error ? `: ${s.error}` : ''}.
                </Text>
            )}
            {s.online && !s.guilds.length && (
                <Text size="sm">
                    The bot isn&apos;t in a Discord server yet.{' '}
                    {s.invite ? (
                        <a href={s.invite} rel="noreferrer" target="_blank">
                            Invite it to yours
                        </a>
                    ) : (
                        'An admin can invite it from Hermes Music > Config.'
                    )}
                </Text>
            )}
            {(!v || pick) &&
                s.guilds.map((g) => (
                    <div className={styles.guild} key={g.id}>
                        <Text fw={600} size="sm">
                            {g.name}
                        </Text>
                        {g.channels.length ? (
                            g.channels.map((c) => {
                                const here = v?.channelId === c.id;
                                const ppl = c.members.filter((m) => !m.bot);
                                return (
                                    <div
                                        className={clsx(styles.channel, here && styles.channelHere)}
                                        key={c.id}
                                    >
                                        <Icon icon="volumeNormal" />
                                        <span className={styles.channelName}>{c.name}</span>
                                        <span className={styles.avatars}>
                                            {ppl.slice(0, 5).map((m) => (
                                                <Avatar key={m.id} m={m} />
                                            ))}
                                        </span>
                                        {here ? (
                                            <span className={styles.here}>here</span>
                                        ) : (
                                            <Button
                                                disabled={!c.canJoin || !!busy}
                                                loading={busy === c.id}
                                                onClick={() => join(g.id, c.id)}
                                                size="compact-sm"
                                                variant={ppl.length ? 'filled' : 'default'}
                                            >
                                                {c.canJoin ? 'Join' : 'No access'}
                                            </Button>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <Text isMuted size="sm">
                                No voice channels the bot can see here.
                            </Text>
                        )}
                    </div>
                ))}
            <VolumeRow bot={bot} label="Everything" layer="master" value={s.volumes.master} />
        </div>
    );
};

// the song's position, moving between Hermes Music's updates
const useLivePosition = (s: BotState) => {
    const { paused, position } = s.music;
    // seconds since Hermes Music last said where the song was
    const [extra, setExtra] = useState({ from: position, secs: 0 });
    useEffect(() => {
        if (paused) return undefined;
        const at = Date.now();
        const t = window.setInterval(
            () => setExtra({ from: position, secs: (Date.now() - at) / 1000 }),
            250,
        );
        return () => window.clearInterval(t);
    }, [position, paused]);
    return paused || extra.from !== position ? position : position + extra.secs;
};

// ---------- the music: now playing, the controls, the queue ----------
const Music = ({ bot, s }: Props) => {
    const m = s.music;
    const cur = m.current;
    const live = useLivePosition(s);
    const [drag, setDrag] = useState<null | number>(null);
    const dur = cur?.duration || 0;
    const pos = drag ?? Math.min(live, dur || live);
    const nextLoop = m.loop === 'off' ? 'all' : m.loop === 'all' ? 'one' : 'off';
    const noVoice = !s.voice;
    return (
        <div className={styles.card}>
            <div className={styles.cardTitle}>
                <Icon icon="itemSong" /> Music
            </div>
            {cur ? (
                <>
                    <div className={styles.now}>
                        <div className={styles.nowArt}>
                            <Icon icon="disc" size="xl" />
                        </div>
                        <div className={styles.nowText}>
                            <strong className={styles.ellipsis}>{cur.title}</strong>
                            <span className={clsx(styles.muted, styles.ellipsis)}>
                                {cur.artist}
                            </span>
                        </div>
                    </div>
                    <div className={styles.seek}>
                        <span className={styles.muted}>{time(pos)}</span>
                        <Slider
                            className={styles.grow}
                            label={(v) => time(v)}
                            max={Math.max(1, dur)}
                            min={0}
                            onChange={setDrag}
                            onChangeEnd={(v) => {
                                setDrag(null);
                                bot.act('seek', { args: { seconds: v } });
                            }}
                            size="sm"
                            step={1}
                            value={pos}
                        />
                        <span className={styles.muted}>{time(dur)}</span>
                    </div>
                </>
            ) : (
                <Text isMuted size="sm">
                    {noVoice
                        ? 'Join a voice channel first, then pick songs or a playlist from the library below.'
                        : m.queue.length
                          ? 'Stopped.'
                          : 'Nothing playing: pick songs or a playlist from the library below.'}
                </Text>
            )}
            <div className={styles.controls}>
                <IconBtn
                    icon="mediaShuffle"
                    label={m.shuffle ? 'Shuffle: on' : 'Shuffle: off'}
                    on={m.shuffle}
                    onClick={() => bot.act('shuffle', { args: { on: !m.shuffle } })}
                />
                <IconBtn
                    disabled={!m.queue.length}
                    icon="mediaPrevious"
                    label="Previous"
                    onClick={() => bot.act('previous')}
                />
                <IconBtn
                    big
                    disabled={!m.queue.length || noVoice}
                    icon={m.paused ? 'mediaPlay' : 'mediaPause'}
                    label={m.paused ? 'Play' : 'Pause'}
                    onClick={() => bot.act(m.paused ? 'resume' : 'pause')}
                />
                <IconBtn
                    disabled={!m.queue.length}
                    icon="mediaNext"
                    label="Next"
                    onClick={() => bot.act('skip')}
                />
                <IconBtn
                    icon={m.loop === 'one' ? 'mediaRepeatOne' : 'mediaRepeat'}
                    label={`Repeat: ${m.loop === 'off' ? 'off' : m.loop === 'all' ? 'the queue' : 'this song'}`}
                    on={m.loop !== 'off'}
                    onClick={() => bot.act('loop', { args: { mode: nextLoop } })}
                />
            </div>
            <VolumeRow bot={bot} label="Music" layer="music" value={s.volumes.music} />
            {m.queue.length > 0 && (
                <div className={styles.queue}>
                    <div className={styles.queueHead}>
                        <Text fw={600} size="sm">
                            Queue ({m.queue.length})
                        </Text>
                        <Button onClick={() => bot.act('clear')} size="compact-xs" variant="subtle">
                            Clear the rest
                        </Button>
                    </div>
                    {m.queue.map((t, i) => (
                        <div
                            className={clsx(styles.qRow, i === m.index && styles.qNow)}
                            key={`${t.id}-${i}`}
                        >
                            <button
                                className={styles.qTitle}
                                disabled={noVoice}
                                onClick={() => bot.act('jump', { args: { index: i } })}
                                type="button"
                            >
                                <span className={styles.ellipsis}>{t.title}</span>
                                <span className={styles.muted}>{time(t.duration)}</span>
                            </button>
                            <IconBtn
                                disabled={i === 0}
                                icon="arrowUp"
                                label="Move up"
                                onClick={() => bot.act('move', { args: { from: i, to: i - 1 } })}
                                small
                            />
                            <IconBtn
                                icon="x"
                                label="Take out of the queue"
                                onClick={() => bot.act('remove', { args: { index: i } })}
                                small
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ---------- ambience: loops under the music, as many at once as you like ----------
const Ambience = ({ bot, s }: Props) => {
    const list = (bot.library?.items ?? []).filter(
        (i) => i.kind === 'ambience' && i.status === 'ready',
    );
    const on = new Map(s.ambience.map((a) => [a.id, a]));
    return (
        <div className={styles.card}>
            <div className={styles.cardTitle}>
                <Icon icon="waves" /> Ambience{' '}
                <span className={styles.muted}>loops under the music</span>
            </div>
            {list.length ? (
                <div className={styles.tiles}>
                    {list.map((it) => {
                        const a = on.get(it.id);
                        return (
                            <div className={clsx(styles.tile, a && styles.tileOn)} key={it.id}>
                                <button
                                    className={styles.tileBtn}
                                    disabled={!s.voice}
                                    onClick={() => bot.act('ambience', { id: it.id, on: !a })}
                                    title={a ? 'Fade it out' : 'Fade it in'}
                                    type="button"
                                >
                                    <span className={styles.ellipsis}>{it.title}</span>
                                    <span className={styles.tileState}>{a ? 'on' : 'off'}</span>
                                </button>
                                {a && (
                                    <Slider
                                        defaultValue={a.volume}
                                        key={a.volume}
                                        label={(v) => `${Math.round(v * 100)}%`}
                                        max={1.5}
                                        min={0}
                                        onChangeEnd={(v) =>
                                            bot.act('ambience', { id: it.id, volume: v })
                                        }
                                        size="xs"
                                        step={0.05}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <Text isMuted size="sm">
                    No ambience yet: add rain, a tavern, wind in the trees... with Add sounds below.
                </Text>
            )}
            <div className={styles.rowEnd}>
                <VolumeRow bot={bot} label="Ambience" layer="ambience" value={s.volumes.ambience} />
                {s.ambience.length > 0 && (
                    <Button
                        onClick={() => bot.act('ambienceOff')}
                        size="compact-xs"
                        variant="subtle"
                    >
                        All off
                    </Button>
                )}
            </div>
        </div>
    );
};

// ---------- sound effects: a pad each, played once on top of everything ----------
const Effects = ({ bot, s }: Props) => {
    const list = (bot.library?.items ?? []).filter((i) => i.kind === 'sfx' && i.status === 'ready');
    const playing = new Set(s.sfx.map((x) => x.id));
    return (
        <div className={styles.card}>
            <div className={styles.cardTitle}>
                <Icon icon="swords" /> Sound effects
            </div>
            {list.length ? (
                <div className={styles.pads}>
                    {list.map((it) => (
                        <button
                            className={clsx(styles.pad, playing.has(it.id) && styles.padOn)}
                            disabled={!s.voice}
                            key={it.id}
                            onClick={() => bot.act('sfx', { id: it.id })}
                            type="button"
                        >
                            <span className={styles.padTitle}>{it.title}</span>
                            <span className={styles.muted}>{short(it.duration)}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <Text isMuted size="sm">
                    No sound effects yet: add a door creak, a sword clash, thunder... with Add
                    sounds below.
                </Text>
            )}
            <div className={styles.rowEnd}>
                <VolumeRow bot={bot} label="Effects" layer="sfx" value={s.volumes.sfx} />
                {s.sfx.length > 0 && (
                    <Button onClick={() => bot.act('stopSfx')} size="compact-xs" variant="subtle">
                        Stop sounds
                    </Button>
                )}
            </div>
        </div>
    );
};
