import { useRef } from "react";
import { useParams } from "react-router-dom";
import {
  useMousePosition,
  useWindowDrag,
  useVrmLoader,
  useDoubleClick,
} from "@/hooks";
import "@/ModelView.css";

function ModelView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { vrm: vrmName } = useParams<{ vrm: string }>();

  const mousePosition = useMousePosition();
  const { startDrag, stopDrag } = useWindowDrag(mousePosition);
  const { handleClick, handleMouseDown } = useDoubleClick();

  useVrmLoader({
    vrmName,
    containerRef,
    mousePosition,
  });

  const onMouseDown = async () => {
    handleMouseDown();
    await startDrag();
  };

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    await handleClick();
  };

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseUp={stopDrag}
      className="render"
    />
  );
}

export default ModelView;
