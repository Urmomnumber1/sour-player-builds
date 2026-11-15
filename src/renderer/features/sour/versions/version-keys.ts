import { type Song } from '/@/shared/types/domain-types';

// How Hermes Music names a song (its songKey: the first artist and the title, loosely), so Sour Player finds a
// song's versions the same way Hermes stores them. Kept in step with server.js (deaccent, norm, normAny,
// primaryArtist, titleKey, songKey).
const deaccent = (s: string) =>
    String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');

const norm = (s: string) =>
    deaccent(s)
        .toLowerCase()
        .replace(/\(.*?\)|\[.*?\]/g, ' ')
        .replace(/\b(feat|ft)\.?\s.*$/, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const normAny = (s: string) =>
    deaccent(s)
        .toLowerCase()
        .replace(/[(（[【].*?[)）\]】]/g, ' ')
        .replace(/\b(feat|ft)\.?\s.*$/, ' ')
        .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
        .trim();

export const primaryArtist = (artist: string) => {
    const first = String(artist || '').split(
        /\s*(?:,|;|\/|&|\bfeat\.?|\bft\.?|\bwith\b|\bx\b)\s*/i,
    )[0];
    return norm(first) || normAny(first);
};

export const titleKey = (title: string) => {
    const s = deaccent(title)
        .toLowerCase()
        .replace(/[([]\s*(feat|ft)\.?[^)\]]*[)\]]/g, ' ')
        .replace(/\b(feat|ft)\.?\s.*$/, ' ');
    return s.replace(/[^a-z0-9]+/g, ' ').trim() || s.replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
};

export const songKey = (artist: string, title: string) =>
    `${primaryArtist(artist)}|${titleKey(title)}`;

// every key a song from the music server could be stored under (its artist, its album artist, each of its
// artists: Navidrome joins several with " • ")
export const songKeysFor = (
    song: Pick<Song, 'albumArtistName' | 'albumArtists' | 'artistName' | 'artists' | 'name'>,
) => {
    const title = song.name || '';
    if (!title) return [];
    const names = [
        song.artistName,
        song.albumArtistName,
        ...(song.artists ?? []).map((a) => a.name),
        ...(song.albumArtists ?? []).map((a) => a.name),
    ]
        .flatMap((n) => [n, ...String(n || '').split(/\s*[•·]\s*/)])
        .filter((n): n is string => !!n && !!n.trim());
    return [...new Set(names.map((n) => songKey(n, title)))];
};
