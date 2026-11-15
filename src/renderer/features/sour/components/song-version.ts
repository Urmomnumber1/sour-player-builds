import { create } from 'zustand';

// Songs whose audio was swapped ("Not the right song"): the player asks for them with a fresh address, so it
// doesn't keep playing a copy of the old audio it still has around.
export const useSongVersions = create<{ v: Record<string, number> }>(() => ({ v: {} }));

export const bumpSong = (id: string) =>
    useSongVersions.setState((s) => ({ v: { ...s.v, [id]: Date.now() } }));

export const withSongVersion = (url: string | undefined, id?: string, version?: number) => {
    const v = version ?? (id ? useSongVersions.getState().v[id] : undefined);
    return url && v ? `${url}${url.includes('?') ? '&' : '?'}sv=${v}` : url;
};
