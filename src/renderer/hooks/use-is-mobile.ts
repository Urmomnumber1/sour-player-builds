import { useMediaQuery } from '@mantine/hooks';

import { useMiniStore } from '/@/renderer/features/sour/store/mini.store';

export const useIsMobile = () => {
    const isMobile = useMediaQuery('(max-width: 768px)');
    // a phone turned sideways is wider than that, but it's still a phone (a short touch screen): it
    // keeps the phone layout instead of switching to the computer one
    const phoneSideways = useMediaQuery('(max-height: 540px) and (pointer: coarse)');
    // Sour Player's mini player makes the window tiny on purpose: stay on the desktop layout
    const mini = useMiniStore((state) => state.on);
    return (isMobile || phoneSideways) && !mini;
};
