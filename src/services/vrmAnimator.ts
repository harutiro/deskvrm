import { VRM, VRMExpressionPresetName, VRMHumanBoneName } from "@pixiv/three-vrm";
import * as Three from "three";
import {
  VRMAAnimationManager,
  createVRMAAnimationManager,
} from "./vrmaLoader";

interface AnimationState {
  clock: Three.Clock;
  // まばたき
  blinkTimer: number;
  nextBlinkTime: number;
  isBlinking: boolean;
  blinkProgress: number;
  // 現在のVRMAアニメーション
  currentVrmaName: string | null;
}

interface AnimatorConfig {
  enableBlink: boolean;
  blinkIntervalMin: number;
  blinkIntervalMax: number;
  blinkDuration: number;
}

const DEFAULT_CONFIG: AnimatorConfig = {
  enableBlink: true,
  blinkIntervalMin: 2.0,
  blinkIntervalMax: 6.0,
  blinkDuration: 0.15,
};

function getRandomInterval(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createAnimationState(): AnimationState {
  return {
    clock: new Three.Clock(),
    blinkTimer: 0,
    nextBlinkTime: getRandomInterval(DEFAULT_CONFIG.blinkIntervalMin, DEFAULT_CONFIG.blinkIntervalMax),
    isBlinking: false,
    blinkProgress: 0,
    currentVrmaName: null,
  };
}

function getRandomBlinkInterval(config: AnimatorConfig): number {
  return getRandomInterval(config.blinkIntervalMin, config.blinkIntervalMax);
}

// まばたき更新
function updateBlink(
  vrm: VRM,
  state: AnimationState,
  deltaTime: number,
  config: AnimatorConfig
): void {
  if (!config.enableBlink) return;

  state.blinkTimer += deltaTime;

  if (!state.isBlinking && state.blinkTimer >= state.nextBlinkTime) {
    state.isBlinking = true;
    state.blinkProgress = 0;
  }

  if (state.isBlinking) {
    state.blinkProgress += deltaTime / config.blinkDuration;

    let blinkValue: number;
    if (state.blinkProgress < 0.5) {
      blinkValue = state.blinkProgress * 2;
    } else {
      blinkValue = 1 - (state.blinkProgress - 0.5) * 2;
    }

    blinkValue = Math.max(0, Math.min(1, blinkValue));

    vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, blinkValue);

    if (state.blinkProgress >= 1) {
      state.isBlinking = false;
      state.blinkTimer = 0;
      state.nextBlinkTime = getRandomBlinkInterval(config);
      vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, 0);
    }
  }
}

export class VrmAnimator {
  private state: AnimationState;
  private config: AnimatorConfig;
  private vrm: VRM | null = null;
  private vrmaManager: VRMAAnimationManager;

  constructor(config: Partial<AnimatorConfig> = {}) {
    this.state = createAnimationState();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.vrmaManager = createVRMAAnimationManager();
  }

  setVrm(vrm: VRM): void {
    this.vrm = vrm;
    this.state = createAnimationState();
    this.vrmaManager.setVRM(vrm);
  }

  setConfig(config: Partial<AnimatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * VRMAアニメーションを追加する
   */
  async addVrmaAnimation(name: string, vrmaData: ArrayBuffer): Promise<void> {
    console.log(`VrmAnimator.addVrmaAnimation: ${name}, VRM set: ${this.vrm !== null}`);
    await this.vrmaManager.addAnimation(name, vrmaData);
    console.log(`VrmAnimator.addVrmaAnimation: ${name} added, animations: ${this.vrmaManager.getAnimationNames()}`);
  }

  /**
   * VRMAアニメーションを削除する
   */
  removeVrmaAnimation(name: string): void {
    this.vrmaManager.removeAnimation(name);
    if (this.state.currentVrmaName === name) {
      this.stopVrmaAnimation();
    }
  }

  /**
   * 登録されているVRMAアニメーション名の一覧を取得する
   */
  getVrmaAnimationNames(): string[] {
    return this.vrmaManager.getAnimationNames();
  }

  /**
   * VRMAアニメーションを再生する
   */
  playVrmaAnimation(name: string, options?: { loop?: boolean }): void {
    console.log(`VrmAnimator.playVrmaAnimation: ${name}, hasAnimation: ${this.vrmaManager.hasAnimation(name)}`);
    if (!this.vrmaManager.hasAnimation(name)) {
      console.warn(`VRMA animation "${name}" not found`);
      return;
    }
    this.state.currentVrmaName = name;
    this.vrmaManager.play(name, { loop: options?.loop ?? true });
  }

  /**
   * 現在のVRMAアニメーションを停止する
   */
  stopVrmaAnimation(): void {
    this.vrmaManager.stop();
    this.state.currentVrmaName = null;

    // ボーンを初期ポーズにリセット
    this.resetPose();
  }

  /**
   * VRMのボーンを初期ポーズにリセットする
   */
  private resetPose(): void {
    if (!this.vrm) return;

    // すべてのボーンの回転をリセット
    const humanoid = this.vrm.humanoid;
    const boneNames = Object.values(VRMHumanBoneName);

    for (const boneName of boneNames) {
      const bone = humanoid.getRawBoneNode(boneName);
      if (bone) {
        // 回転を初期状態にリセット
        bone.quaternion.identity();
      }
    }

    // 腕を少し下げた自然なポーズに設定（初期設定と同じ）
    humanoid.getRawBoneNode(VRMHumanBoneName.LeftUpperArm)?.rotateZ(Math.PI / 2.6);
    humanoid.getRawBoneNode(VRMHumanBoneName.RightUpperArm)?.rotateZ(Math.PI / -2.6);
  }

  /**
   * 現在再生中のVRMAアニメーション名を取得
   */
  getCurrentVrmaName(): string | null {
    return this.state.currentVrmaName;
  }

  /**
   * VRMAアニメーションが再生中かどうか
   */
  isVrmaPlaying(): boolean {
    return this.vrmaManager.isPlaying();
  }

  update(): void {
    if (!this.vrm) return;

    const deltaTime = this.state.clock.getDelta();

    // VRMAアニメーション再生中かどうか
    const isPlaying = this.vrmaManager.isPlaying();

    // VRMAアニメーション更新（AnimationMixer）
    this.vrmaManager.update(deltaTime);

    // VRMAアニメーション再生中のみvrm.updateを呼ぶ（ボーンの更新に必要）
    // 再生中でないときはスプリングボーンのみ更新
    if (isPlaying) {
      this.vrm.update(deltaTime);
    } else {
      this.vrm.springBoneManager?.update(deltaTime);
    }

    // まばたき更新（常に動作）
    updateBlink(this.vrm, this.state, deltaTime, this.config);

    this.vrm.expressionManager?.update();
  }

  dispose(): void {
    this.vrmaManager.dispose();
    this.vrm = null;
  }
}

export function createVrmAnimator(config?: Partial<AnimatorConfig>): VrmAnimator {
  return new VrmAnimator(config);
}
