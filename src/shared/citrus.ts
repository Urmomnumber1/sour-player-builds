// Citrus Player: the lighter build of Sour Player for older and slower computers and phones. The same app,
// built with SOUR_CITRUS=1: its own name, icon and updates (so both can be installed side by side), and
// lighter defaults (the plain look, no animations or visual extras, smaller pictures).
export const CITRUS: boolean = String(import.meta.env.SOUR_CITRUS) === 'true';

export const APP_NAME = CITRUS ? 'Citrus Player' : 'Sour Player';
