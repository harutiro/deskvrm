import { VRM, VRMExpressionPresetName, VRMHumanBoneName } from "@pixiv/three-vrm";
import * as Three from "three";

interface AnimationState {
  clock: Three.Clock;
  blinkTimer: number;
  nextBlinkTime: number;
  isBlinking: boolean;
  blinkProgress: number;
  breathPhase: number;
  idlePhase: number;
}

interface AnimatorConfig {
  enableBlink: boolean;
  enableBreathing: boolean;
  enableIdleMotion: boolean;
  enableSpringBone: boolean;
  blinkIntervalMin: number;
  blinkIntervalMax: number;
  blinkDuration: number;
  breathingSpeed: number;
  breathingIntensity: number;
  idleMotionSpeed: number;
  idleMotionIntensity: number;
}

const DEFAULT_CONFIG: AnimatorConfig = {
  enableBlink: true,
  enableBreathing: true,
  enableIdleMotion: true,
  enableSpringBone: true,
  blinkIntervalMin: 2.0,
  blinkIntervalMax: 6.0,
  blinkDuration: 0.15,
  breathingSpeed: 0.8,
  breathingIntensity: 0.02,
  idleMotionSpeed: 0.5,
  idleMotionIntensity: 0.01,
};

function createAnimationState(): AnimationState {
  return {
    clock: new Three.Clock(),
    blinkTimer: 0,
    nextBlinkTime: getRandomBlinkInterval(DEFAULT_CONFIG),
    isBlinking: false,
    blinkProgress: 0,
    breathPhase: 0,
    idlePhase: 0,
  };
}

function getRandomBlinkInterval(config: AnimatorConfig): number {
  return (
    config.blinkIntervalMin +
    Math.random() * (config.blinkIntervalMax - config.blinkIntervalMin)
  );
}

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

function updateBreathing(
  vrm: VRM,
  state: AnimationState,
  deltaTime: number,
  config: AnimatorConfig
): void {
  if (!config.enableBreathing) return;

  state.breathPhase += deltaTime * config.breathingSpeed * Math.PI * 2;

  const breathValue = Math.sin(state.breathPhase) * config.breathingIntensity;

  const spine = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Spine);
  const chest = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Chest);

  if (spine) {
    spine.scale.y = 1 + breathValue;
  }
  if (chest) {
    chest.scale.y = 1 + breathValue * 0.5;
  }
}

function updateIdleMotion(
  vrm: VRM,
  state: AnimationState,
  deltaTime: number,
  config: AnimatorConfig
): void {
  if (!config.enableIdleMotion) return;

  state.idlePhase += deltaTime * config.idleMotionSpeed;

  const swayX = Math.sin(state.idlePhase * 1.3) * config.idleMotionIntensity;
  const swayZ = Math.sin(state.idlePhase * 0.7) * config.idleMotionIntensity * 0.5;

  const spine = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Spine);
  if (spine) {
    spine.rotation.x += swayX;
    spine.rotation.z += swayZ;
  }

  const leftShoulder = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.LeftUpperArm);
  const rightShoulder = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.RightUpperArm);

  const shoulderSway = Math.sin(state.idlePhase * 0.9) * config.idleMotionIntensity * 0.3;
  if (leftShoulder) {
    leftShoulder.rotation.x += shoulderSway;
  }
  if (rightShoulder) {
    rightShoulder.rotation.x -= shoulderSway;
  }
}

function updateSpringBone(vrm: VRM, deltaTime: number): void {
  vrm.springBoneManager?.update(deltaTime);
}

export class VrmAnimator {
  private state: AnimationState;
  private config: AnimatorConfig;
  private vrm: VRM | null = null;

  constructor(config: Partial<AnimatorConfig> = {}) {
    this.state = createAnimationState();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setVrm(vrm: VRM): void {
    this.vrm = vrm;
    this.state = createAnimationState();
  }

  setConfig(config: Partial<AnimatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  update(): void {
    if (!this.vrm) return;

    const deltaTime = this.state.clock.getDelta();

    if (this.config.enableSpringBone) {
      updateSpringBone(this.vrm, deltaTime);
    }

    updateBlink(this.vrm, this.state, deltaTime, this.config);
    updateBreathing(this.vrm, this.state, deltaTime, this.config);
    updateIdleMotion(this.vrm, this.state, deltaTime, this.config);

    this.vrm.expressionManager?.update();
  }

  dispose(): void {
    this.vrm = null;
  }
}

export function createVrmAnimator(config?: Partial<AnimatorConfig>): VrmAnimator {
  return new VrmAnimator(config);
}
