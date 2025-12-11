import { VRM } from "@pixiv/three-vrm";
import {
  VRMAnimation,
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
} from "@pixiv/three-vrm-animation";
import { GLTFLoader, type GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as Three from "three";

export interface VRMAAnimationData {
  name: string;
  vrmAnimation: VRMAnimation;
}

/**
 * VRMAファイルを読み込んでVRMAnimationを取得する
 */
export async function loadVRMA(
  vrmaData: ArrayBuffer,
  animationName: string = "animation"
): Promise<VRMAAnimationData> {
  const loader = new GLTFLoader();
  loader.register((parser: GLTFParser) => new VRMAnimationLoaderPlugin(parser));

  return new Promise((resolve, reject) => {
    loader.parse(
      vrmaData,
      "animation.vrma",
      (gltf) => {
        const vrmAnimation = gltf.userData.vrmAnimations?.[0] as VRMAnimation | undefined;

        if (!vrmAnimation) {
          reject(new Error("VRMA animation not found in file"));
          return;
        }

        console.log(`loadVRMA: VRMAnimation loaded for "${animationName}"`);
        console.log(`  - duration: ${vrmAnimation.duration}`);
        console.log(`  - humanoidTracks.translation size: ${vrmAnimation.humanoidTracks?.translation?.size ?? 0}`);
        console.log(`  - humanoidTracks.rotation size: ${vrmAnimation.humanoidTracks?.rotation?.size ?? 0}`);
        console.log(`  - expressionTracks.preset size: ${vrmAnimation.expressionTracks?.preset?.size ?? 0}`);
        console.log(`  - expressionTracks.custom size: ${vrmAnimation.expressionTracks?.custom?.size ?? 0}`);

        resolve({
          name: animationName,
          vrmAnimation,
        });
      },
      (error) => {
        console.error("Failed to load VRMA:", error);
        reject(error);
      }
    );
  });
}

/**
 * VRMAアニメーションマネージャー
 * AnimationMixerを使ってVRMAアニメーションを管理する
 */
export class VRMAAnimationManager {
  private vrm: VRM | null = null;
  private mixer: Three.AnimationMixer | null = null;
  private animations: Map<string, VRMAAnimationData> = new Map();
  private clips: Map<string, Three.AnimationClip> = new Map();
  private currentAction: Three.AnimationAction | null = null;
  private currentAnimationName: string | null = null;
  private frameCount = 0;

  setVRM(vrm: VRM): void {
    this.vrm = vrm;
    this.mixer = new Three.AnimationMixer(vrm.scene);
    this.animations.clear();
    this.clips.clear();
    this.currentAction = null;
    this.currentAnimationName = null;
    console.log("VRMAAnimationManager: VRM set");
    console.log("  - vrm.scene.name:", vrm.scene.name || "(empty)");
    console.log("  - vrm.scene.uuid:", vrm.scene.uuid);
    console.log("  - vrm.humanoid exists:", vrm.humanoid !== null);
    console.log("  - vrm.meta.metaVersion:", vrm.meta?.metaVersion);
  }

  async addAnimation(name: string, vrmaData: ArrayBuffer): Promise<void> {
    console.log(`VRMAAnimationManager.addAnimation: ${name}, VRM set: ${this.vrm !== null}, mixer set: ${this.mixer !== null}`);
    if (!this.vrm) {
      throw new Error("VRM not set. Call setVRM first.");
    }

    const animation = await loadVRMA(vrmaData, name);
    this.animations.set(name, animation);

    // VRM用のAnimationClipを作成
    const clip = createVRMAnimationClip(animation.vrmAnimation, this.vrm);
    clip.name = name;
    this.clips.set(name, clip);

    console.log(`VRMAAnimationManager.addAnimation: ${name} added`);
    console.log(`  - clip duration: ${clip.duration}`);
    console.log(`  - clip tracks: ${clip.tracks.length}`);
    if (clip.tracks.length > 0) {
      console.log(`  - first track name: ${clip.tracks[0].name}`);
      console.log(`  - first track times: ${clip.tracks[0].times.length}`);
    }
  }

  addAnimationFromData(name: string, animation: VRMAAnimationData, vrm: VRM): void {
    this.animations.set(name, animation);
    const clip = createVRMAnimationClip(animation.vrmAnimation, vrm);
    clip.name = name;
    this.clips.set(name, clip);
  }

  getAnimationNames(): string[] {
    return Array.from(this.animations.keys());
  }

  hasAnimation(name: string): boolean {
    return this.animations.has(name);
  }

  removeAnimation(name: string): void {
    if (this.currentAnimationName === name) {
      this.stop();
    }
    this.animations.delete(name);
    this.clips.delete(name);
  }

  /**
   * アニメーションを再生する
   * @param name アニメーション名
   * @param options 再生オプション
   */
  play(
    name: string,
    options: {
      loop?: boolean;
      timeScale?: number;
    } = {}
  ): void {
    if (!this.mixer) {
      console.warn("Mixer not initialized");
      return;
    }

    const clip = this.clips.get(name);
    if (!clip) {
      console.warn(`Animation clip "${name}" not found`);
      return;
    }

    const { loop = true, timeScale = 1.0 } = options;

    console.log(`Playing animation "${name}"`);
    console.log(`  - clip duration: ${clip.duration}`);
    console.log(`  - clip tracks: ${clip.tracks.length}`);
    console.log(`  - mixer exists: ${this.mixer !== null}`);

    // 現在のアクションを停止
    if (this.currentAction) {
      this.currentAction.stop();
      console.log(`  - stopped previous action`);
    }

    // 新しいアクションを作成して再生
    const action = this.mixer.clipAction(clip);
    console.log(`  - action created: ${action !== null}`);

    action.reset();
    action.setLoop(loop ? Three.LoopRepeat : Three.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.timeScale = timeScale;
    action.setEffectiveWeight(1.0);
    action.play();

    this.currentAction = action;
    this.currentAnimationName = name;
    this.frameCount = 0;

    console.log(`Animation "${name}" started:`);
    console.log(`  - action.isRunning: ${action.isRunning()}`);
    console.log(`  - action.enabled: ${action.enabled}`);
    console.log(`  - action.weight: ${action.getEffectiveWeight()}`);
    console.log(`  - action.time: ${action.time}`);
  }

  /**
   * 現在のアニメーションを停止する
   */
  stop(): void {
    if (this.currentAction) {
      this.currentAction.stop();
      this.currentAction = null;
      this.currentAnimationName = null;
    }
  }

  /**
   * 毎フレーム呼び出す更新関数
   */
  update(deltaTime: number): void {
    if (this.mixer && this.currentAction) {
      this.mixer.update(deltaTime);
      this.frameCount++;
      // 最初の数フレームだけログを出す
      if (this.frameCount <= 5) {
        console.log(`VRMAAnimationManager.update: frame=${this.frameCount}, deltaTime=${deltaTime.toFixed(4)}, action.time=${this.currentAction.time.toFixed(4)}`);
      }
    }
  }

  getCurrentAnimationName(): string | null {
    return this.currentAnimationName;
  }

  isPlaying(): boolean {
    return this.currentAction !== null && this.currentAction.isRunning();
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.vrm = null;
    this.animations.clear();
    this.clips.clear();
    this.currentAction = null;
    this.currentAnimationName = null;
  }
}

/**
 * VRMAAnimationManagerのインスタンスを作成する
 */
export function createVRMAAnimationManager(): VRMAAnimationManager {
  return new VRMAAnimationManager();
}
