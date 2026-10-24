import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    if (!element || motion.matches || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          element.dataset.reveal = 'visible';
          observer.unobserve(element);
        }
      },
      { threshold: 0.06 },
    );
    if (element.getBoundingClientRect().top > window.innerHeight)
      element.dataset.reveal = 'pending';
    observer.observe(element);
    const show = () => {
      if (motion.matches) element.dataset.reveal = 'visible';
    };
    motion.addEventListener('change', show);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', show);
      delete element.dataset.reveal;
    };
  }, []);
  return (
    <div className="reveal-section" ref={ref}>
      {children}
    </div>
  );
}
