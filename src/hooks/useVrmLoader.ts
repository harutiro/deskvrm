import { useEffect, useRef, useCallback } from "react";
import { appWindow, currentMonitor } from "@tauri-apps/api/window";
import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { initializeVrmRenderer } from "@/services/vrmRenderer";
import { readModel } from "@/util/fetch";
import type { OnUpdateCallback, MousePosition } from "@/types/vrm";

interface UseVrmLoaderOptions {
  vrmName: string | undefined;
  containerRef: React.RefObject<HTMLDivElement | null>;
  mousePosition: MousePosition;
}

export function useVrmLoader({
  vrmName,
  containerRef,
  mousePosition,
}: UseVrmLoaderOptions): void {
  const onUpdateRef = useRef<OnUpdateCallback>(() => {});

  const updateHeadRotation = useCallback(
    async (vrm: VRM | null) => {
      if (!vrm) return;

      const monitor = await currentMonitor();
      if (!monitor) return;

      const windowPosition = await appWindow.outerPosition();

      const rotationY = Math.max(
        Math.min(
          ((Math.PI / 4) * (mousePosition.x - windowPosition.x)) /
            (monitor.position.x + monitor.size.width),
          Math.PI / 4
        ),
        Math.PI / -4
      );

      const rotationX = Math.max(
        Math.min(
          ((Math.PI / 4) * (windowPosition.y - mousePosition.y)) /
            (monitor.position.y + monitor.size.height),
          Math.PI / 4
        ),
        Math.PI / -4
      );

      const head = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Head);
      if (head) {
        head.rotation.x = rotationX;
        head.rotation.y = rotationY;
      }
    },
    [mousePosition.x, mousePosition.y]
  );

  useEffect(() => {
    onUpdateRef.current = updateHeadRotation;
  }, [updateHeadRotation]);

  useEffect(() => {
    const loadVrm = async () => {
      console.log("useVrmLoader: vrmName =", vrmName);

      if (!vrmName) {
        console.log("No VRM name provided, closing window");
        appWindow.close();
        return;
      }

      if (!containerRef.current) {
        console.error("Container ref is null");
        return;
      }

      console.log("Fetching model...");
      const modelData = await readModel(vrmName);

      if (!modelData) {
        console.error("Failed to fetch model");
        return;
      }

      console.log("Model fetched:", modelData.byteLength, "bytes");

      initializeVrmRenderer({
        container: containerRef.current,
        modelData: modelData.buffer as ArrayBuffer,
        lightIntensity: 2,
        onUpdateRef,
      });
    };

    loadVrm();
  }, [vrmName, containerRef]);
}
