import {
    useEffect,
    useState,
    type RefObject
} from "react";

/**
 * Whether the element is in view (or within `options.root`). The observer is
 * made once per element and option values, so an inline options object is
 * fine; an array `threshold` should be stable (e.g. a module constant). The
 * element must be rendered when the component mounts.
 */
export const useIntersection = (ref: RefObject<HTMLElement | null>, options?: IntersectionObserverInit) => {
    const [isIntersecting, setIsIntersecting] = useState(false);
    const root = options?.root ?? null;
    const rootMargin = options?.rootMargin;
    const threshold = options?.threshold;

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            (entries) => {
                // Several changes can arrive at once; the last is the current one.
                const entry = entries[entries.length - 1];
                if (entry) setIsIntersecting(entry.isIntersecting);
            },
            { root, rootMargin, threshold }
        );
        observer.observe(element);

        return () => observer.disconnect();
    }, [ref, root, rootMargin, threshold]);

    return isIntersecting;
};
