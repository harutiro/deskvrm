import * as Three from "three";
import {
  GLTFLoader,
  type GLTF,
  type GLTFParser,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMHumanBoneName } from "@pixiv/three-vrm";
import { appWindow, LogicalSize } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import type { OnUpdateCallback } from "@/types/vrm";
import type { MutableRefObject } from "react";

interface VrmRendererConfig {
  container: HTMLDivElement;
  modelData: ArrayBuffer;
  lightIntensity: number;
  onUpdateRef: MutableRefObject<OnUpdateCallback>;
}

interface RendererState {
  vrm: VRM | null;
  mouseWheel: number;
  mouseDownTime: number;
  mouseDownCount: number;
  prevWidth: number;
  prevHeight: number;
  shadowInvalidationPending: boolean;
}

function createScene(): Three.Scene {
  return new Three.Scene();
}

function createRenderer(container: HTMLDivElement): Three.WebGLRenderer {
  const renderer = new Three.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearAlpha(0);
  renderer.shadowMap.enabled = false;
  return renderer;
}

function createCamera(container: HTMLDivElement): Three.PerspectiveCamera {
  const camera = new Three.PerspectiveCamera(
    30.0,
    container.clientWidth / container.clientHeight,
    0.1,
    20.0
  );
  camera.position.set(0.0, 0.0, -2.8);
  camera.rotation.set(0, Math.PI, 0);
  return camera;
}

function setupLighting(
  scene: Three.Scene,
  lightIntensity: number
): void {
  const mainLight = new Three.DirectionalLight(0xffffff, lightIntensity);
  mainLight.position.set(0.0, 0.0, -1).normalize();
  scene.add(mainLight);

  const shadowLight = new Three.DirectionalLight(0xffffff, 1);
  shadowLight.position.set(-0.5, -3.0, -10.0).normalize();
  shadowLight.castShadow = false;
  scene.add(shadowLight);
}

function createBackdrop(): Three.Mesh {
  const back = new Three.Mesh(
    new Three.BoxGeometry(100, 100, 1),
    new Three.ShadowMaterial({ opacity: 0.5 })
  );
  back.position.set(0, 0, 2);
  back.receiveShadow = false;
  return back;
}

function loadVrmModel(
  loader: GLTFLoader,
  modelData: ArrayBuffer,
  onLoad: (vrm: VRM) => void,
  onError: (error: unknown) => void
): void {
  loader.parse(
    modelData,
    "model.vrm",
    (gltf: GLTF) => {
      console.log("GLTF loaded successfully", gltf);
      const vrm = gltf.userData.vrm as VRM;

      if (vrm) {
        console.log("VRM model found");
        vrm.humanoid
          .getRawBoneNode(VRMHumanBoneName.LeftUpperArm)
          ?.rotateZ(Math.PI / 2.6);
        vrm.humanoid
          .getRawBoneNode(VRMHumanBoneName.RightUpperArm)
          ?.rotateZ(Math.PI / -2.6);
        vrm.scene.traverse((object) => {
          object.castShadow = false;
        });
        onLoad(vrm);
      } else {
        console.error("VRM not found in GLTF userData");
        onError(new Error("VRM not found in GLTF userData"));
      }
    },
    (error: unknown) => {
      console.error("GLTF parse error:", error);
      onError(error);
    }
  );
}

function createShadowInvalidator(): () => void {
  let pending = false;
  return () => {
    if (!pending) {
      pending = true;
      setTimeout(() => {
        invoke("invalidate_shadow");
        pending = false;
      }, 16);
    }
  };
}

function setupMouseEvents(
  canvas: HTMLCanvasElement,
  state: RendererState,
  scheduleInvalidateShadow: () => void
): void {
  canvas.addEventListener("wheel", (e) => {
    state.mouseWheel -= e.deltaY / 10;
  });

  canvas.addEventListener("mousedown", () => {
    state.mouseDownTime = Date.now();
    state.mouseDownCount += 1;
  });

  canvas.addEventListener("mouseleave", () => {
    emit("cursor_grab", { grab: false });
  });

  canvas.addEventListener("mouseup", () => {
    emit("cursor_grab", { grab: false });
    if (Date.now() - state.mouseDownTime < 500) {
      if (state.mouseDownCount === 2) {
        // Double click - reserved for future menu
      }
    } else {
      state.mouseDownCount = 0;
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (state.mouseDownCount === 2 && state.vrm) {
      emit("cursor_grab", { grab: true });
      state.vrm.scene.rotation.x -= e.movementY / 100 / Math.PI / 2;
      state.vrm.scene.rotation.y += e.movementX / 100 / Math.PI / 2;
      scheduleInvalidateShadow();
    }
  });
}

function updateVrmPosition(vrm: VRM): Three.Box3 {
  vrm.scene.position.set(0, 0, 0);
  const currentBounding = new Three.Box3().setFromObject(vrm.scene);
  vrm.scene.position.x = (currentBounding.max.x + currentBounding.min.x) / -2;
  vrm.scene.position.y = (currentBounding.max.y + currentBounding.min.y) / -2;
  vrm.scene.position.z = (currentBounding.max.z + currentBounding.min.z) / -2;
  return new Three.Box3().setFromObject(vrm.scene);
}

function updateCameraAndWindow(
  vrm: VRM,
  camera: Three.PerspectiveCamera,
  renderer: Three.WebGLRenderer,
  back: Three.Mesh,
  state: RendererState,
  scheduleInvalidateShadow: () => void
): void {
  const vrmBounding = updateVrmPosition(vrm);
  back.position.z = vrmBounding.max.z + 1;

  const vFOV = (camera.fov * Math.PI) / 180;
  const tan = Math.tan(vFOV / 2);
  camera.position.z = (vrmBounding.max.y - vrmBounding.min.y + 0.1) / -2 / tan;

  const aspect =
    (vrmBounding.max.x - vrmBounding.min.x) /
    (vrmBounding.max.y - vrmBounding.min.y);
  const width = Math.round((500 + state.mouseWheel) * aspect);
  const height = Math.round(500 + state.mouseWheel);

  if (width !== state.prevWidth || height !== state.prevHeight) {
    state.prevWidth = width;
    state.prevHeight = height;
    appWindow.setSize(new LogicalSize(width, height));
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    scheduleInvalidateShadow();
  }

  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

export function initializeVrmRenderer(config: VrmRendererConfig): void {
  const { container, modelData, lightIntensity, onUpdateRef } = config;

  console.log("loadModel called, model size:", modelData.byteLength);

  if (container.hasChildNodes()) {
    console.log("render already has children, skipping");
    return;
  }

  const scene = createScene();
  const renderer = createRenderer(container);
  const camera = createCamera(container);
  const back = createBackdrop();

  console.log("appending canvas to render element");
  container.appendChild(renderer.domElement);

  setupLighting(scene, lightIntensity);
  scene.add(back);

  const state: RendererState = {
    vrm: null,
    mouseWheel: 0,
    mouseDownTime: 0,
    mouseDownCount: 0,
    prevWidth: 0,
    prevHeight: 0,
    shadowInvalidationPending: false,
  };

  const scheduleInvalidateShadow = createShadowInvalidator();

  const loader = new GLTFLoader();
  loader.register((parser: GLTFParser) => new VRMLoaderPlugin(parser));

  loadVrmModel(
    loader,
    modelData,
    (vrm) => {
      state.vrm = vrm;
      scene.add(vrm.scene);
      console.log("VRM model added to scene");
    },
    (error) => {
      console.error("Failed to load VRM:", error);
    }
  );

  setupMouseEvents(renderer.domElement, state, scheduleInvalidateShadow);

  const animate = (): void => {
    requestAnimationFrame(animate);

    if (state.vrm) {
      updateCameraAndWindow(
        state.vrm,
        camera,
        renderer,
        back,
        state,
        scheduleInvalidateShadow
      );
    }

    if (onUpdateRef.current) {
      onUpdateRef.current(state.vrm);
      scheduleInvalidateShadow();
    }

    renderer.render(scene, camera);
  };

  animate();
}
