// (0.16) One press of a lock screen, Control Center or headphone button can reach the app twice in the
// iPhone app: once through iOS's own remote controls (the app's SourMedia) and once through the page's
// media session. Whichever comes second within a moment is the same press, so it's skipped
// (next / previous would otherwise jump two songs).
const last: Record<string, number> = {};

export const remoteOnce = (action: string, run: () => void) => {
    const now = Date.now();
    if (now - (last[action] || 0) < 700) return;
    last[action] = now;
    run();
};
