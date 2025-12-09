import { useState, useCallback, useEffect } from "react";
import { appWindow, LogicalPosition } from "@tauri-apps/api/window";
import type { MousePosition, WindowOffset } from "@/types/vrm";

interface UseWindowDragResult {
  isDragging: boolean;
  startDrag: () => Promise<void>;
  stopDrag: () => void;
}

export function useWindowDrag(mousePosition: MousePosition): UseWindowDragResult {
  const [offset, setOffset] = useState<WindowOffset | null>(null);

  const startDrag = useCallback(async () => {
    const pos = (await appWindow.outerPosition()).toLogical(
      await appWindow.scaleFactor()
    );
    setOffset({
      x: mousePosition.x - pos.x,
      y: mousePosition.y - pos.y,
    });
  }, [mousePosition.x, mousePosition.y]);

  const stopDrag = useCallback(() => {
    setOffset(null);
  }, []);

  useEffect(() => {
    if (offset) {
      appWindow.setPosition(
        new LogicalPosition(
          mousePosition.x - offset.x,
          mousePosition.y - offset.y
        )
      );
    }
  }, [mousePosition.x, mousePosition.y, offset]);

  return {
    isDragging: offset !== null,
    startDrag,
    stopDrag,
  };
}
