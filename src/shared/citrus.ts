// Citrus Player started (0.14) as a lighter build of Sour Player for older and slower computers and phones,
// with its own name, icon and updates. Since 0.16 it is a mode inside the one app: Sour Player can switch to
// Citrus mode (the app restarts its page in the lighter set-up, with Citrus Player's name and icon) and
// Citrus Player can switch to Sour Player's, without installing anything.

// which installer / APK this is (SOUR_CITRUS=1 builds Citrus Player's): its name on the system, the updates
// it takes, and the mode it starts in
export const CITRUS_BUILD: boolean = String(import.meta.env.SOUR_CITRUS) === 'true';

export const CITRUS_MODE_KEY = 'sour-citrus-mode';

// the mode picked in the app ('1' on, '0' off), if one was. Only the page has this; the main process keeps
// its own copy (store key sour_citrus_mode, sent over by the page)
const picked = (): boolean | null => {
    try {
        const v = (globalThis as { localStorage?: Storage }).localStorage?.getItem(CITRUS_MODE_KEY);
        return v === '1' ? true : v === '0' ? false : null;
    } catch {
        return null;
    }
};

// Citrus mode, read once when the app's page starts (switching reloads the page): lighter defaults (the
// plain look, no animations or visual extras, smaller pictures), Citrus Player's name and icon
export const CITRUS: boolean = picked() ?? CITRUS_BUILD;

export const APP_NAME = CITRUS ? 'Citrus Player' : 'Sour Player';
