import { useState, useCallback, useRef } from "react";

interface UseMultiClickOptions {
  onDoubleClick?: () => void;
  onTripleClick?: () => void;
}

interface UseMultiClickResult {
  handleClick: () => Promise<void>;
  handleMouseDown: () => void;
}

export function useDoubleClick(options?: UseMultiClickOptions): UseMultiClickResult {
  const [clickCount, setClickCount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseDown = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setClickCount(0);
    }, 800);

    setClickCount((prev) => prev + 1);
  }, []);

  const handleClick = useCallback(async () => {
    if (clickCount === 2) {
      options?.onDoubleClick?.();
    } else if (clickCount === 3) {
      options?.onTripleClick?.();
      setClickCount(0);
    }
  }, [clickCount, options]);

  return {
    handleClick,
    handleMouseDown,
  };
}
