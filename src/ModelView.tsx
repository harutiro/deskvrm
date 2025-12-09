import { useRef, useState, useEffect, MouseEventHandler } from "react";
import { useParams } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import {
  appWindow,
  currentMonitor,
  getAll,
  LogicalPosition,
} from "@tauri-apps/api/window";
import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import "@/ModelView.css";
import { loadModel } from "./vrm";
import { readModel } from "@/util/fetch";

function App() {
  const render = useRef<HTMLDivElement>(null);
  const { vrm } = useParams<{ vrm: string }>();

  const [clickCount, setClickCount] = useState(0);

  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [moveOffset, setMoveOffset] = useState<{ x: number; y: number } | null>(
    null,
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onUpdateRef = useRef((_: VRM | null) => {});
  useEffect(() => {
    onUpdateRef.current = async (vrm: VRM | null) => {
      if (vrm) {
        const monitor = await currentMonitor();
        if (monitor) {
          const windowPosition = await appWindow.outerPosition();
          const rotationY = Math.max(
            Math.min(
              ((Math.PI / 4) * (mouseX - windowPosition.x)) /
                (monitor.position.x + monitor.size.width),
              Math.PI / 4,
            ),
            Math.PI / -4,
          );
          const rotationX = Math.max(
            Math.min(
              ((Math.PI / 4) * (windowPosition.y - mouseY)) /
                (monitor.position.y + monitor.size.height),
              Math.PI / 4,
            ),
            Math.PI / -4,
          );
          const head = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Head);
          if (head) {
            head.rotation.x = rotationX;
            head.rotation.y = rotationY;
          }
        }
      }
    };

    if (moveOffset) {
      appWindow.setPosition(
        new LogicalPosition(mouseX - moveOffset.x, mouseY - moveOffset.y),
      );
    }
  }, [mouseX, mouseY, moveOffset]);

  const onClick: MouseEventHandler = async (e) => {
    e.preventDefault();
    if (clickCount === 2) {
      const configWindow = getAll().find((v) => v.label === "config");
      if (configWindow) {
        await configWindow.show();
        await appWindow.close();
      }
    }
  };
  const onMouseDown: MouseEventHandler = async () => {
    setTimeout(() => {
      setClickCount(0);
    }, 600);
    setClickCount((prev) => prev + 1);
    const pos = (await appWindow.outerPosition()).toLogical(
      await appWindow.scaleFactor(),
    );
    if (clickCount == 0) {
      setMoveOffset({ x: mouseX - pos.x, y: mouseY - pos.y });
    }
  };

  useEffect(() => {
    (async () => {
      console.log("ModelView useEffect, vrm param:", vrm);
      if (vrm) {
        console.log("Fetching model...");
        const model = await readModel(vrm);
        console.log("Model fetched:", model ? `${model.byteLength} bytes` : "null");
        if (model) {
          console.log("Calling loadModel with render.current:", render.current);
          loadModel(render.current!, model.buffer as ArrayBuffer, 2, onUpdateRef);
        } else {
          console.error("Failed to fetch model");
        }
      } else {
        console.log("No vrm param, closing window");
        appWindow.close();
      }
    })();
    listen<{ x: number; y: number }>("mouse_position", (event) => {
      setMouseX(event.payload.x);
      setMouseY(event.payload.y);
    });
  }, [vrm]);

  return (
    <>
      <div
        ref={render}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onMouseUp={() => {
          setMoveOffset(null);
        }}
        className="render"
      ></div>
    </>
  );
}

export default App;
