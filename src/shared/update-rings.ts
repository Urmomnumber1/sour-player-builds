// Sour Player 0.16: updates in rings. Admins (of the music server) get an update as soon as it's published,
// so they can try it first; everyone else gets it from the first Saturday on or after the day it was
// published, and any day after that. The rule is the same on computers (main/hermes-updater), phones (the
// Android app's own updater) and, for the web app and iPhones, on Hermes Music (which keeps both copies).
// It starts with the update after 0.16.0: apps older than that take updates the old way.
//
// (0.16.1) The test week goes by the line (0.17, 0.18...), not by the single release: a line opens for
// everyone on the first Saturday on or after the day its first release came out, and its later releases
// (0.17.1...) are open the moment the line is. A small update of the version an app already is (0.16.1 for
// 0.16.0) is taken at once, and so is a release whose notes say <!-- no-wait -->.

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

// 0.16.0 and 0.16.3 are one line, 0.17.0 is the next
const lineOf = (v: string) => {
    const p = parts(v);
    return `${p[0] || 0}.${p[1] || 0}`;
};
export const sameLine = (a: string, b: string) => lineOf(a) === lineOf(b);

export interface RingRelease {
    // the release notes (a hidden <!-- no-wait --> in them: for everyone at once)
    body?: null | string;
    draft?: boolean;
    published_at: string;
    tag_name: string;
}

const NO_WAIT = /<!--\s*no-wait\s*-->/i;
const ownOpensAt = (r: RingRelease) =>
    NO_WAIT.test(r.body || '') ? 0 : opensForEveryone(r.published_at);

// When this release opens for everyone (0: it isn't held back). `releases` are the ones listed with it (its
// line's earlier releases decide), `current` is the version the app is.
export const releaseOpensAt = <T extends RingRelease>(
    release: T,
    releases: T[],
    current = '',
): number => {
    if (current && sameLine(release.tag_name, current)) return 0;
    let at = ownOpensAt(release);
    for (const r of releases) {
        if (r === release || r.draft || !sameLine(r.tag_name, release.tag_name)) continue;
        if (isNewerVersion(r.tag_name, release.tag_name)) continue;
        at = Math.min(at, ownOpensAt(r));
    }
    return at;
};

// the newest of these releases this ring may take now (null: none yet)
export const pickRelease = <T extends RingRelease>(
    releases: T[],
    ring: UpdateRing,
    now = Date.now(),
    current = '',
): null | T => {
    const live = releases.filter((r) => !r.draft);
    return (
        live
            .sort((a, b) =>
                isNewerVersion(a.tag_name, b.tag_name)
                    ? -1
                    : isNewerVersion(b.tag_name, a.tag_name)
                      ? 1
                      : 0,
            )
            .find((r) => ring === 'admin' || now >= releaseOpensAt(r, live, current)) ?? null
    );
};
