// The audio elements the built-in players play through (slot 1 and 2; the iPhone player has just one, slot 1),
// so Sour Player's version switching (features/sour/versions) can follow the song to the millisecond.
const elements: (HTMLMediaElement | null)[] = [null, null];

export const setPlayerElement = (slot: 1 | 2, el: HTMLMediaElement | null | undefined) => {
    elements[slot - 1] = el ?? null;
};

export const playerElement = (slot: number) => elements[slot - 1] ?? null;
