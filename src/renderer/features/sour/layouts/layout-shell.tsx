import type { SourLayout } from '/@/renderer/features/sour/layouts/layout-kind';

import { lazy, Suspense } from 'react';

const MagShell = lazy(() => import('./mag-shell'));
const HifiShell = lazy(() => import('./hifi-shell'));
const PopShell = lazy(() => import('./pop-shell'));

// The frame of the 0.12 layouts. Only the one that's picked is downloaded.
const LayoutShell = ({ kind }: { kind: SourLayout }) => (
    <Suspense fallback={null}>
        {kind === 'mag' && <MagShell />}
        {kind === 'hifi' && <HifiShell />}
        {kind === 'pop' && <PopShell />}
    </Suspense>
);

export default LayoutShell;
