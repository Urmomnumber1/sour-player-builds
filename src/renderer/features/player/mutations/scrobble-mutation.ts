import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';

import { api } from '/@/renderer/api';
import { queryKeys } from '/@/renderer/api/query-keys';
import { isPodcast } from '/@/renderer/features/sour/podcasts/podcast-id';
import { MutationOptions } from '/@/renderer/lib/react-query';
import { incrementQueuePlayCount } from '/@/renderer/store/player.store';
import { ScrobbleArgs, ScrobbleResponse } from '/@/shared/types/domain-types';

export const useSendScrobble = (options?: MutationOptions) => {
    const queryClient = useQueryClient();

    return useMutation<ScrobbleResponse, AxiosError, ScrobbleArgs, null>({
        mutationFn: (args) => {
            // podcast episodes aren't in the music library
            if (isPodcast(args.query)) return Promise.resolve(null as unknown as ScrobbleResponse);
            return api.controller.scrobble({
                ...args,
                apiClientProps: { serverId: args.apiClientProps.serverId },
            });
        },
        onSuccess: (_data, variables) => {
            if (isPodcast(variables.query)) return;
            // Manually increment the play count for the song in the queue if scrobble was submitted
            if (variables.query.submission) {
                const serverId = variables.apiClientProps.serverId;
                incrementQueuePlayCount([variables.query.id]);

                // Invalidate the album detail query for the song's album
                if (variables.query.albumId) {
                    queryClient.invalidateQueries({
                        queryKey: queryKeys.albums.detail(serverId, {
                            id: variables.query.albumId,
                        }),
                    });
                }

                // Invalidate recently played carousel on home route
                queryClient.invalidateQueries({
                    queryKey: ['home', 'recentlyPlayed'],
                });

                // Invalidate most played carousel on home route
                queryClient.invalidateQueries({
                    queryKey: ['home', 'mostPlayed'],
                });

                // Invalidate album artist top songs
                queryClient.invalidateQueries({
                    queryKey: queryKeys.albumArtists.topSongs(serverId),
                });

                // Invalidate album artist favorite songs
                queryClient.invalidateQueries({
                    queryKey: queryKeys.albumArtists.favoriteSongs(serverId),
                });
            }
        },
        ...options,
    });
};
