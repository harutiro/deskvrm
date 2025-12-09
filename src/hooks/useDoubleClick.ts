import { useState, useCallback, useRef } from "react";
import { appWindow, getAll } from "@tauri-apps/api/window";

interface UseDoubleClickResult {
  handleClick: () => Promise<void>;
  handleMouseDown: () => void;
}

export function useDoubleClick(): UseDoubleClickResult {
  const [clickCount, setClickCount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseDown = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setClickCount(0);
    }, 600);

    setClickCount((prev) => prev + 1);
  }, []);

  const handleClick = useCallback(async () => {
    if (clickCount === 2) {
      const configWindow = getAll().find((w) => w.label === "config");
      if (configWindow) {
        await configWindow.show();
        await appWindow.close();
      }
    }
  }, [clickCount]);

  return {
    handleClick,
    handleMouseDown,
  };
}
