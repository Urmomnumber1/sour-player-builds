// Sour Player 0.16: updates in rings. Admins (of the music server) get an update as soon as it's published,
// so they can try it first; everyone else gets it from the first Saturday on or after the day it was
// published, and any day after that. The rule is the same on computers (main/hermes-updater), phones (the
// Android app's own updater) and, for the web app and iPhones, on Hermes Music (which keeps both copies).
// It starts with the update after 0.16.0: apps older than that take updates the old way.

export type UpdateRing = 'admin' | 'everyone';

// when a release published then opens for everyone: the start of the first Saturday on or after that day,
// by this device's clock (0: no date known, so it isn't held back)
export const opensForEveryone = (publishedAt: number | string): number => {
    const d = new Date(publishedAt);
    if (Number.isNaN(d.getTime())) return 0;
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    day.setDate(day.getDate() + ((6 - day.getDay() + 7) % 7));
    return day.getTime();
};

export const isOpenFor = (ring: UpdateRing, publishedAt: number | string, now = Date.now()) =>
    ring === 'admin' || now >= opensForEveryone(publishedAt);

const parts = (v: string) => (v.match(/\d+/g) || []).map(Number);

// 0.16.10 is newer than 0.16.9 (and v0.16.1 than mobile-v0.16.0: only the numbers count)
export const isNewerVersion = (a: string, b: string) => {
    const x = parts(a);
    const y = parts(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    }
    return false;
};

export interface RingRelease {
    draft?: boolean;
    published_at: string;
    tag_name: string;
}

// the newest of these releases this ring may take now (null: none yet)
export const pickRelease = <T extends RingRelease>(
    releases: T[],
    ring: UpdateRing,
    now = Date.now(),
): null | T =>
    releases
        .filter((r) => !r.draft)
        .sort((a, b) =>
            isNewerVersion(a.tag_name, b.tag_name)
                ? -1
                : isNewerVersion(b.tag_name, a.tag_name)
                  ? 1
                  : 0,
        )
        .find((r) => isOpenFor(ring, r.published_at, now)) ?? null;
