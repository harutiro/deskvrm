import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  useMousePosition,
  useWindowDrag,
  useVrmLoader,
  useDoubleClick,
} from "@/hooks";
import VrmaPanel from "@/components/VrmaPanel";
import "@/ModelView.css";

function ModelView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { vrm: vrmName } = useParams<{ vrm: string }>();
  const [showVrmaPanel, setShowVrmaPanel] = useState(false);

  const mousePosition = useMousePosition();
  const { startDrag, stopDrag } = useWindowDrag(mousePosition);
  const { handleClick, handleMouseDown } = useDoubleClick({
    onTripleClick: () => {
      setShowVrmaPanel((prev) => !prev);
    },
  });

  const { animator, isLoading } = useVrmLoader({
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
    <>
      <div
        ref={containerRef}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onMouseUp={stopDrag}
        className="render"
      />
      {showVrmaPanel && !isLoading && (
        <VrmaPanel animator={animator} onClose={() => setShowVrmaPanel(false)} />
      )}
    </>
  );
}

export default ModelView;
