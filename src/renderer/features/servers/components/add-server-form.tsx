import { closeAllModals } from '@mantine/modals';
import isElectron from 'is-electron';
import { nanoid } from 'nanoid/non-secure';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '/@/renderer/api';
import {
    isLegacyAuth,
    isServerLock,
} from '/@/renderer/features/action-required/utils/window-properties';
import JellyfinIcon from '/@/renderer/features/servers/assets/jellyfin.png';
import NavidromeIcon from '/@/renderer/features/servers/assets/navidrome.png';
import SubsonicIcon from '/@/renderer/features/servers/assets/opensubsonic.png';
import { IgnoreCorsSslSwitches } from '/@/renderer/features/servers/components/ignore-cors-ssl-switches';
import { JellyfinQuickConnectButton } from '/@/renderer/features/servers/components/jellyfin-quick-connect-button';
import {
    JellyfinSignInMethod,
    JellyfinSignInMethodPicker,
} from '/@/renderer/features/servers/components/jellyfin-sign-in-method-picker';
import { useJellyfinQuickConnect } from '/@/renderer/features/servers/hooks/use-jellyfin-quick-connect';
import { useAuthStoreActions, useServerList } from '/@/renderer/store';
import { normalizeServerUrl } from '/@/renderer/utils/normalize-server-url';
import { Checkbox } from '/@/shared/components/checkbox/checkbox';
import { Divider } from '/@/shared/components/divider/divider';
import { Group } from '/@/shared/components/group/group';
import { ModalButton } from '/@/shared/components/modal/model-shared';
import { Paper } from '/@/shared/components/paper/paper';
import { PasswordInput } from '/@/shared/components/password-input/password-input';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { useFocusTrap } from '/@/shared/hooks/use-focus-trap';
import { useForm } from '/@/shared/hooks/use-form';
import { AuthenticationResponse, ServerListItemWithCredential } from '/@/shared/types/domain-types';
import { DiscoveredServerItem, ServerType, toServerType } from '/@/shared/types/types';

const autodiscover = isElectron() ? window.api.autodiscover : null;
const localSettings = isElectron() ? window.api.localSettings : null;

interface AddServerFormProps {
    onCancel: (() => void) | null;
}

interface ServerDetails {
    icon: string;
    name: string;
}

function ServerIconWithLabel({ icon, label }: { icon: string; label: string }) {
    return (
        <Stack align="center" justify="center">
            <img height="50" src={icon} width="50" />
            <Text>{label}</Text>
        </Stack>
    );
}

function useAutodiscovery() {
    const [isDone, setDone] = useState(false);
    const [servers, setServers] = useState<DiscoveredServerItem[]>([]);

    useEffect(() => {
        setServers([]);

        autodiscover
            ?.discover((newServer) => {
                setServers((tail) => [...tail, newServer]);
            })
            .then(() => {
                setDone(true);
            });
    }, []);

    return { isDone, servers };
}

const SERVER_TYPES: Record<ServerType, ServerDetails> = {
    [ServerType.JELLYFIN]: {
        icon: JellyfinIcon,
        name: 'Jellyfin',
    },
    [ServerType.NAVIDROME]: {
        icon: NavidromeIcon,
        name: 'Navidrome',
    },
    [ServerType.SUBSONIC]: {
        icon: SubsonicIcon,
        name: 'OpenSubsonic',
    },
};

// Sour Player: the addresses to try when signing in, in order. What was typed first, then the usual
// slips that all end in the same "A network error occurred": no http:// at all, https:// on a server that
// only speaks http (Navidrome on an Umbrel), or no port (Navidrome's is 4533).
const addressesToTry = (typed: string, type: ServerType): string[] => {
    const raw = normalizeServerUrl(typed);
    const bare = raw.replace(/^https?:\/\//i, '');
    if (!bare) return [raw];
    const out: string[] = [];
    const add = (u: string) => {
        if (!out.includes(u)) out.push(u);
    };
    if (/^https?:\/\//i.test(raw)) add(raw);
    add(`http://${bare}`);
    add(`https://${bare}`);
    const host = bare.split('/')[0];
    if (type !== ServerType.JELLYFIN && !/:\d+$/.test(host)) {
        add(`http://${host}:4533${bare.slice(host.length)}`);
    }
    return out;
};

const isNetworkFailure = (error: any) => {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('network') || message.includes('timed out');
};

// an unreachable address can hang for a minute: give each try a few seconds
const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
    Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Network: timed out')), ms),
        ),
    ]);

const unreachableMessage = (typed: string) =>
    `Couldn't reach ${normalizeServerUrl(typed) || 'the server'}. Type the whole address with http:// and the port, like http://192.168.1.20:4533 at home, or your Umbrel's Tailscale address with :4533 when you're away (with Tailscale on). umbrel.local doesn't work on most Android phones: use the Umbrel's IP address instead.`;

const ALL_SERVERS = Object.keys(SERVER_TYPES).map((serverType) => {
    const info = SERVER_TYPES[serverType];
    return {
        label: <ServerIconWithLabel icon={info.icon} label={info.name} />,
        value: serverType,
    };
});

// Sour Player running from Hermes Music (the iPhone app, the browser version at /app/): the music
// server (Navidrome) sits on the same Umbrel, at :4533
const musicServerNextToHermes = (): null | string => {
    if (typeof window === 'undefined') return null;
    const { hostname, pathname, protocol } = window.location;
    if (!hostname || !pathname.startsWith('/app/') || !/^https?:$/.test(protocol)) return null;
    return `http://${hostname.includes(':') ? `[${hostname}]` : hostname}:4533`;
};

export const AddServerForm = ({ onCancel }: AddServerFormProps) => {
    const { t } = useTranslation();
    const focusTrapRef = useFocusTrap(true);
    const [isLoading, setIsLoading] = useState(false);
    const { addServer, setCurrentServer } = useAuthStoreActions();
    const serverList = useServerList();
    const { servers: discovered } = useAutodiscovery();

    const serverLock = isServerLock();

    const form = useForm({
        initialValues: {
            enableAudiobooks: undefined,
            legacyAuth: isLegacyAuth(),
            name:
                (localSettings ? localSettings.env.SERVER_NAME : window.SERVER_NAME) || 'My Server',
            password: '',
            preferInstantMix: undefined,
            preferRemoteUrl: false,
            remoteUrl: '',
            savePassword: undefined,
            type:
                (localSettings
                    ? localSettings.env.SERVER_TYPE
                    : toServerType(window.SERVER_TYPE)) ?? ServerType.NAVIDROME,
            // http:// (Navidrome on an Umbrel only speaks http; the phone apps used to start at https://)
            url:
                (localSettings ? localSettings.env.SERVER_URL : window.SERVER_URL) ??
                musicServerNextToHermes() ??
                'http://',
            username: '',
        },
    });

    const [signInMethod, setSignInMethod] = useState<JellyfinSignInMethod>('password');
    const showQuickConnect =
        form.values.type === ServerType.JELLYFIN && signInMethod === 'quickConnect';

    const isSubmitDisabled =
        !form.values.name || !form.values.url || (!showQuickConnect && !form.values.username);

    const {
        code: quickConnectCode,
        isLoading: isQuickConnectLoading,
        start: startQuickConnect,
        stop: stopQuickConnect,
    } = useJellyfinQuickConnect({
        onAuthenticated: (data) => {
            const url = form.values.url;
            const serverItem: ServerListItemWithCredential = {
                credential: data.credential,
                id: nanoid(),
                isAdmin: data.isAdmin,
                name: form.values.name,
                type: ServerType.JELLYFIN,
                url: normalizeServerUrl(url),
                userId: data.userId,
                username: data.username,
            };

            if (form.values.remoteUrl?.trim()) {
                serverItem.remoteUrl = form.values.remoteUrl.trim().replace(/\/$/, '');
            }

            if (form.values.preferRemoteUrl !== undefined) {
                serverItem.preferRemoteUrl = form.values.preferRemoteUrl;
            }

            if (form.values.preferInstantMix !== undefined) {
                serverItem.preferInstantMix = form.values.preferInstantMix;
            }

            if (form.values.enableAudiobooks !== undefined) {
                serverItem.enableAudiobooks = form.values.enableAudiobooks;
            }

            addServer(serverItem);
            setCurrentServer(serverItem);
            closeAllModals();
            toast.success({ message: t('form.addServer.success') });
        },
    });

    useEffect(() => {
        if (!showQuickConnect) stopQuickConnect();
    }, [showQuickConnect, stopQuickConnect]);

    const fillServerDetails = (server: DiscoveredServerItem) => {
        form.setValues({ ...server });
    };

    const handleSubmit = form.onSubmit(async (values) => {
        if (serverLock && Object.keys(serverList).length >= 1) {
            toast.error({
                message: t('error.serverLockSingleServer'),
            });
            return;
        }

        const authFunction = api.controller.authenticate;

        if (!authFunction) {
            return toast.error({
                message: t('error.invalidServer'),
            });
        }

        try {
            setIsLoading(true);
            // the address as typed, then the usual fixes for it (see addressesToTry); a wrong password
            // or any other answer from the server stops there, only "can't reach it" tries the next one
            let data: AuthenticationResponse | undefined;
            let workingUrl = values.url;
            let lastError: any = null;
            for (const candidate of addressesToTry(values.url, values.type as ServerType)) {
                try {
                    data = await withTimeout(
                        authFunction(
                            candidate,
                            {
                                legacy: values.legacyAuth,
                                password: values.password,
                                username: values.username,
                            },
                            values.type as ServerType,
                        ),
                        8000,
                    );
                    workingUrl = candidate;
                    lastError = null;
                    break;
                } catch (error) {
                    lastError = error;
                    if (!isNetworkFailure(error)) break;
                }
            }
            if (lastError) {
                throw isNetworkFailure(lastError)
                    ? new Error(unreachableMessage(values.url))
                    : lastError;
            }
            if (workingUrl !== values.url) form.setFieldValue('url', workingUrl);

            if (!data) {
                return toast.error({
                    message: t('error.authenticationFailed'),
                });
            }

            const serverItem: ServerListItemWithCredential = {
                credential: data.credential,
                id: nanoid(),
                isAdmin: data.isAdmin,
                name: values.name,
                type: values.type as ServerType,
                url: normalizeServerUrl(workingUrl),
                userId: data.userId,
                username: data.username,
            };

            if (values.preferInstantMix !== undefined) {
                serverItem.preferInstantMix = values.preferInstantMix;
            }

            if (values.enableAudiobooks !== undefined) {
                serverItem.enableAudiobooks = values.enableAudiobooks;
            }

            if (values.savePassword !== undefined) {
                serverItem.savePassword = values.savePassword;
            }

            if (values.remoteUrl?.trim()) {
                serverItem.remoteUrl = values.remoteUrl.trim().replace(/\/$/, '');
            }

            if (values.preferRemoteUrl !== undefined) {
                serverItem.preferRemoteUrl = values.preferRemoteUrl;
            }

            if (data.ndCredential !== undefined) {
                serverItem.ndCredential = data.ndCredential;
            }

            addServer(serverItem);
            setCurrentServer(serverItem);
            closeAllModals();

            toast.success({
                message: t('form.addServer.success'),
            });

            if (localSettings && values.savePassword) {
                const saved = await localSettings.passwordSet(values.password, serverItem.id);
                if (!saved) {
                    toast.error({
                        message: t('form.addServer.error', {
                            context: 'savePassword',
                        }),
                    });
                }
            }
        } catch (err: any) {
            setIsLoading(false);
            return toast.error({ message: err?.message });
        }

        return setIsLoading(false);
    });

    return (
        <>
            <Stack>
                {discovered.map((server) => (
                    <Paper key={server.url} p="10px">
                        <Group>
                            <img height="32" src={SERVER_TYPES[server.type].icon} width="32" />
                            <div
                                onClick={() => fillServerDetails(server)}
                                style={{ cursor: 'pointer' }}
                            >
                                <Text fw={700}>{server.name}</Text>
                                <Text>
                                    {SERVER_TYPES[server.type].name} server at {server.url}
                                </Text>
                            </div>
                        </Group>
                    </Paper>
                ))}
            </Stack>
            <form onSubmit={handleSubmit}>
                <Stack m={5} ref={focusTrapRef}>
                    <SegmentedControl
                        data={ALL_SERVERS}
                        disabled={serverLock}
                        onChange={(value) => {
                            form.setFieldValue('type', value);
                            if (value !== ServerType.JELLYFIN) stopQuickConnect();
                        }}
                        p="md"
                        value={form.values.type}
                        withItemsBorders={false}
                    />
                    <Group grow>
                        <TextInput
                            data-autofocus
                            disabled={serverLock}
                            label={t('form.addServer.input', {
                                context: 'name',
                            })}
                            required
                            {...form.getInputProps('name')}
                        />
                        <TextInput
                            disabled={serverLock}
                            label={t('form.addServer.input', {
                                context: 'url',
                            })}
                            required
                            {...form.getInputProps('url')}
                        />
                    </Group>
                    <TextInput
                        description={t('form.addServer.input', {
                            context: 'remoteUrlDescription',
                        })}
                        disabled={serverLock}
                        label={t('form.addServer.input', {
                            context: 'remoteUrl',
                        })}
                        placeholder={t('form.addServer.input', {
                            context: 'remoteUrlPlaceholder',
                        })}
                        {...form.getInputProps('remoteUrl')}
                    />
                    {form.values.remoteUrl && (
                        <Checkbox
                            label={t('form.addServer.input', {
                                context: 'preferRemoteUrl',
                            })}
                            {...form.getInputProps('preferRemoteUrl', {
                                type: 'checkbox',
                            })}
                        />
                    )}
                    {isElectron() && (
                        <>
                            <Divider />
                            <IgnoreCorsSslSwitches />
                            <Divider />
                        </>
                    )}
                    {form.values.type === ServerType.JELLYFIN && (
                        <JellyfinSignInMethodPicker
                            onChange={(method) => {
                                setSignInMethod(method);
                                if (method !== 'quickConnect') stopQuickConnect();
                            }}
                            value={signInMethod}
                        />
                    )}
                    {!showQuickConnect && (
                        <>
                            <TextInput
                                label={t('form.addServer.input', {
                                    context: 'username',
                                })}
                                required
                                {...form.getInputProps('username')}
                            />
                            <PasswordInput
                                description={
                                    form.values.type === ServerType.NAVIDROME &&
                                    t('form.addServer.input', { context: 'passwordNoSSO' })
                                }
                                label={t('form.addServer.input', {
                                    context: 'password',
                                })}
                                {...form.getInputProps('password')}
                            />
                        </>
                    )}
                    {localSettings && form.values.type === ServerType.NAVIDROME && (
                        <Checkbox
                            label={t('form.addServer.input', {
                                context: 'savePassword',
                            })}
                            {...form.getInputProps('savePassword', {
                                type: 'checkbox',
                            })}
                        />
                    )}
                    {form.values.type === ServerType.SUBSONIC && (
                        <Checkbox
                            disabled={serverLock}
                            label={t('form.addServer.input', {
                                context: 'legacyAuthentication',
                            })}
                            {...form.getInputProps('legacyAuth', { type: 'checkbox' })}
                        />
                    )}
                    {form.values.type === ServerType.JELLYFIN && (
                        <>
                            <Checkbox
                                description={t('form.addServer.input', {
                                    context: 'preferInstantMixDescription',
                                })}
                                label={t('form.addServer.input', {
                                    context: 'preferInstantMix',
                                })}
                                {...form.getInputProps('preferInstantMix', {
                                    type: 'checkbox',
                                })}
                            />
                            <Checkbox
                                description={t('form.addServer.input', {
                                    context: 'enableAudiobooksDescription',
                                })}
                                label={t('form.addServer.input', {
                                    context: 'enableAudiobooks',
                                })}
                                {...form.getInputProps('enableAudiobooks', {
                                    type: 'checkbox',
                                })}
                            />
                        </>
                    )}
                    {showQuickConnect && (
                        <JellyfinQuickConnectButton
                            code={quickConnectCode}
                            disabled={!form.values.name || !form.values.url}
                            isLoading={isQuickConnectLoading}
                            onStart={() => startQuickConnect(form.values.url)}
                            onStop={stopQuickConnect}
                            url={form.values.url}
                        />
                    )}
                    <Group grow justify="flex-end">
                        {onCancel && (
                            <ModalButton onClick={onCancel}>{t('common.cancel')}</ModalButton>
                        )}
                        {!showQuickConnect && (
                            <ModalButton
                                disabled={isSubmitDisabled}
                                loading={isLoading}
                                type="submit"
                                variant="filled"
                            >
                                {t('common.add')}
                            </ModalButton>
                        )}
                    </Group>
                </Stack>
            </form>
        </>
    );
};
