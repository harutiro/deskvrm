import { useState, useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MousePosition } from "@/types/vrm";

export function useMousePosition(): MousePosition {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 });

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<MousePosition>("mouse_position", (event) => {
        setPosition(event.payload);
      });
    };

    setupListener();

    return () => {
      unlisten?.();
    };
  }, []);

  return position;
}
