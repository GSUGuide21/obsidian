import { useEffect } from "react";
export const useTimeout = (callback: () => void, delay: number) => {
  useEffect(() => {
    const timeoutId = setTimeout(callback, delay);
    return () => clearTimeout(timeoutId);
  }, [callback, delay]);
};