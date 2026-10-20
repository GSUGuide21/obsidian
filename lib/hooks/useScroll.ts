import {
    useEffect,
    useState,
    type RefObject
} from "react";

/**
 * The element's scroll position, updated at most once per frame while it
 * scrolls. The element must be rendered when the component mounts.
 */
export const useScroll = (ref: RefObject<HTMLElement | null>) => {
    const [scrollTop, setScrollTop] = useState(0);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        let frame = 0;
        
        const update = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => setScrollTop(element.scrollTop));
        };

        update();
        element.addEventListener("scroll", update, { passive: true });

        return () => {
            cancelAnimationFrame(frame);
            element.removeEventListener("scroll", update);
        };
    }, [ref]);

    return scrollTop;
};
