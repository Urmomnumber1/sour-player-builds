// Sour Shop points: the songs this device heard past halfway, kept here until Hermes Music has them. A phone
// asleep in a pocket (or an app closed right after a song) still earns them: they go with the next report.
export type Heard = { at: number; id: string; social?: boolean; title: string };

const KEY = 'sour-heard';
const read = (): Heard[] => {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
};
const write = (list: Heard[]) => {
    try {
        localStorage.setItem(KEY, JSON.stringify(list.slice(-200)));
    } catch {
        /* storage full or private mode: these points are lost */
    }
};

export const pushHeard = (h: Heard) => write([...read(), h]);
export const pendingHeard = () => read().slice(0, 50);
export const dropHeard = (sent: Heard[]) => {
    const done = new Set(sent.map((h) => `${h.id}@${h.at}`));
    write(read().filter((h) => !done.has(`${h.id}@${h.at}`)));
};
