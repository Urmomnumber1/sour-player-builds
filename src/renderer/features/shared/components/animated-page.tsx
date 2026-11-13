import type { ReactNode, Ref } from 'react';

import { motion } from 'motion/react';
import { forwardRef } from 'react';

import styles from './animated-page.module.css';

import { useSourStore } from '/@/renderer/features/sour/store/sour.store';
import { animationProps } from '/@/shared/components/animations/animation-props';

interface AnimatedPageProps {
    children: ReactNode;
}

export const AnimatedPage = forwardRef(
    ({ children }: AnimatedPageProps, ref: Ref<HTMLDivElement>) => {
        const bubble = useSourStore(
            (s) => (s.look.ui ?? 'bubble') === 'bubble' && !s.look.reducedMotion,
        );
        return (
            <motion.main
                className={styles.animatedPage}
                ref={ref}
                {...(bubble
                    ? {
                          animate: { opacity: 1, scale: 1, y: 0 },
                          initial: { opacity: 0, scale: 0.985, y: 14 },
                          transition: { damping: 26, mass: 0.8, stiffness: 260, type: 'spring' },
                      }
                    : {
                          ...animationProps.fadeIn,
                          transition: { duration: 0.5, ease: 'anticipate' },
                      })}
            >
                {children}
            </motion.main>
        );
    },
);
