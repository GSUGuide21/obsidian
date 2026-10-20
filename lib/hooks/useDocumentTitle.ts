import { useEffect } from "react";

/**
 * Show `title` in the browser tab while the component is mounted, then put
 * back the title from before.
 */
export const useDocumentTitle = (title: string) => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = title;
        return () => {
            document.title = previousTitle;
        };
    }, [title]);
};
