import { useState, useEffect, ChangeEventHandler } from "react";
import type { VrmAnimator } from "@/services/vrmAnimator";
import "./VrmaPanel.css";

interface VrmaPanelProps {
  animator: VrmAnimator | null;
  onClose: () => void;
}

function VrmaPanel({ animator, onClose }: VrmaPanelProps) {
  const [animations, setAnimations] = useState<string[]>([]);
  const [currentAnimation, setCurrentAnimation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshAnimations = () => {
    if (animator) {
      const names = animator.getVrmaAnimationNames();
      console.log("refreshAnimations: names =", names);
      setAnimations(names);
      setCurrentAnimation(animator.getCurrentVrmaName());
    } else {
      console.log("refreshAnimations: animator is null");
    }
  };

  useEffect(() => {
    console.log("VrmaPanel mounted, animator:", animator);
    refreshAnimations();
  }, [animator]);

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = async (e) => {
    console.log("handleFileChange called, animator:", animator);
    if (!animator) {
      console.error("Animator is null!");
      return;
    }

    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);

    for (const file of Array.from(files)) {
      console.log("Processing file:", file.name);
      if (file.name.endsWith(".vrma")) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          console.log("ArrayBuffer size:", arrayBuffer.byteLength);
          const name = file.name.replace(".vrma", "");
          await animator.addVrmaAnimation(name, arrayBuffer);
          console.log(`VRMA "${name}" loaded successfully`);
        } catch (error) {
          console.error(`Failed to load VRMA "${file.name}":`, error);
        }
      }
    }

    refreshAnimations();
    setIsLoading(false);
    e.target.value = "";
  };

  const handlePlay = (name: string) => {
    console.log("handlePlay called:", name, "animator:", animator);
    if (!animator) return;
    animator.playVrmaAnimation(name);
    setCurrentAnimation(name);
    console.log(`再生開始: ${name}`);
  };

  const handleStop = () => {
    if (!animator) return;
    animator.stopVrmaAnimation();
    setCurrentAnimation(null);
  };

  const handleDelete = (name: string) => {
    if (!animator) return;
    animator.removeVrmaAnimation(name);
    refreshAnimations();
  };

  return (
    <div className="vrma-panel">
      <div className="vrma-panel-header">
        <h3>VRMAアニメーション</h3>
        <button type="button" className="close-button" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="vrma-panel-content">
        {isLoading ? (
          <p className="loading">読み込み中...</p>
        ) : (
          <>
            <div className="vrma-list">
              {animations.length === 0 ? (
                <p className="no-animations">アニメーションがありません</p>
              ) : (
                <ul>
                  {animations.map((name) => (
                    <li key={name} className={currentAnimation === name ? "active" : ""}>
                      <span className="animation-name">{name}</span>
                      <div className="animation-actions">
                        {currentAnimation === name ? (
                          <button type="button" onClick={handleStop} className="stop-button">
                            停止
                          </button>
                        ) : (
                          <button type="button" onClick={() => handlePlay(name)} className="play-button">
                            再生
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(name)}
                          className="delete-button"
                        >
                          削除
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="vrma-import">
              <label className="import-label">
                VRMAファイルを追加:
                <input
                  type="file"
                  accept=".vrma"
                  multiple
                  onChange={handleFileChange}
                />
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default VrmaPanel;
