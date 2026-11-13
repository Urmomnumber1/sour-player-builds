import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import { RadioPage } from '/@/renderer/features/sour/radio/radio-page';

// Sour Player 0.13: the radio page was redone (features/sour/radio)
const RadioListRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <AnimatedPage>
                <RadioPage />
            </AnimatedPage>
        </PageErrorBoundary>
    );
};

export default RadioListRouteWithBoundary;
