import { useEffect, useRef, useCallback, useState } from "react";
import { appWindow, currentMonitor } from "@tauri-apps/api/window";
import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { initializeVrmRenderer } from "@/services/vrmRenderer";
import { readModel } from "@/util/fetch";
import type { OnUpdateCallback, MousePosition } from "@/types/vrm";
import type { VrmAnimator } from "@/services/vrmAnimator";

interface UseVrmLoaderOptions {
  vrmName: string | undefined;
  containerRef: React.RefObject<HTMLDivElement | null>;
  mousePosition: MousePosition;
}

interface UseVrmLoaderResult {
  animator: VrmAnimator | null;
  isLoading: boolean;
}

export function useVrmLoader({
  vrmName,
  containerRef,
  mousePosition,
}: UseVrmLoaderOptions): UseVrmLoaderResult {
  const onUpdateRef = useRef<OnUpdateCallback>(() => {});
  const [animator, setAnimator] = useState<VrmAnimator | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

      const result = await initializeVrmRenderer({
        container: containerRef.current,
        modelData: modelData.buffer as ArrayBuffer,
        lightIntensity: 2,
        onUpdateRef,
      });

      setAnimator(result.animator);
      setIsLoading(false);
    };

    loadVrm();
  }, [vrmName, containerRef]);

  return { animator, isLoading };
}
