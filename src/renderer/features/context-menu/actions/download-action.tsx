import type { Song } from '/@/shared/types/domain-types';

import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '/@/renderer/api';
import { phoneOffline } from '/@/renderer/features/sour/mobile/offline';
import {
    type OfflineKind,
    SaveOfflineAction,
} from '/@/renderer/features/sour/mobile/offline-actions';
import { useCurrentServer } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';

interface DownloadActionProps {
    ids: string[];
    kind?: OfflineKind;
    songs?: Song[];
}

const utils = isElectron() ? window.api.utils : null;

// phones: keep it in the app for listening offline; computers: save the file
export const DownloadAction = ({ ids, kind = 'song', songs }: DownloadActionProps) => {
    if (phoneOffline()) return <SaveOfflineAction ids={ids} kind={kind} songs={songs} />;
    if (kind === 'playlist') return null;
    return <FileDownloadAction ids={ids} />;
};

const FileDownloadAction = ({ ids }: { ids: string[] }) => {
    const { t } = useTranslation();
    const server = useCurrentServer();

    const onSelect = useCallback(async () => {
        try {
            for (const id of ids) {
                const downloadUrl = api.controller.getDownloadUrl({
                    apiClientProps: { serverId: server.id },
                    query: { id },
                });

                if (isElectron()) {
                    utils?.download(downloadUrl);
                } else {
                    window.open(downloadUrl, '_blank');
                }
            }
        } catch (error) {
            console.error('Failed to download items:', error);
        }
    }, [ids, server]);

    return (
        <ContextMenu.Item disabled={ids.length > 1} leftIcon="download" onSelect={onSelect}>
            {t('page.contextMenu.download')}
        </ContextMenu.Item>
    );
};
