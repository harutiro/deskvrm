import * as Three from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MutableRefObject } from "react";

import { appWindow, LogicalSize } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";

type OnUpdateCallback = (vrm: VRM | null) => void;

export const loadModel = (
  render: HTMLDivElement,
  model: ArrayBuffer,
  lightP: number,
  onUpdate: MutableRefObject<OnUpdateCallback>,
) => {
  console.log("loadModel called, model size:", model.byteLength);
  const scene = new Three.Scene();

  const renderer = new Three.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(render.clientWidth, render.clientHeight);
  renderer.setClearAlpha(0);
  renderer.shadowMap.enabled = false;
  const elem = renderer.domElement;

  if (render.hasChildNodes()) {
    console.log("render already has children, skipping");
    return;
  }
  console.log("appending canvas to render element");
  render.appendChild(elem);

  const camera = new Three.PerspectiveCamera(
    30.0,
    render.clientWidth / render.clientHeight,
    0.1,
    20.0,
  );
  camera.position.set(0.0, 0.0, -2.8);
  camera.rotation.set(0, Math.PI, 0);

  const light = new Three.DirectionalLight(0xffffff, lightP);
  light.position.set(0.0, 0.0, -1).normalize();
  scene.add(light);
  const shadowLight = new Three.DirectionalLight(0xffffff, 1);
  shadowLight.position.set(-0.5, -3.0, -10.0).normalize();
  shadowLight.castShadow = false;
  scene.add(shadowLight);

  let vrm: VRM | null = null;

  const loader = new GLTFLoader();
  loader.register((parser: GLTFParser) => {
    return new VRMLoaderPlugin(parser);
  });
  loader.parse(
    model,
    "test.vrm",
    (gltf: GLTF) => {
      console.log("GLTF loaded successfully", gltf);
      vrm = gltf.userData.vrm as VRM;

      if (vrm) {
        console.log("VRM model found, adding to scene");
        scene.add(vrm.scene);

        vrm.humanoid
          .getRawBoneNode(VRMHumanBoneName.LeftUpperArm)
          ?.rotateZ(Math.PI / 2.6);
        vrm.humanoid
          .getRawBoneNode(VRMHumanBoneName.RightUpperArm)
          ?.rotateZ(Math.PI / -2.6);
        vrm.scene.traverse((object) => {
          object.castShadow = false;
        });
      } else {
        console.error("VRM not found in GLTF userData");
      }
    },
    (error: unknown) => {
      console.error("GLTF parse error:", error);
    },
  );

  const back = new Three.Mesh(
    new Three.BoxGeometry(100, 100, 1),
    new Three.ShadowMaterial({ opacity: 0.5 }),
  );
  back.position.set(0, 0, 2);
  back.receiveShadow = false;
  scene.add(back);

  // Track previous window size to avoid unnecessary updates
  let prevWidth = 0;
  let prevHeight = 0;

  // Debounced invalidateShadow to fix ghost artifacts without heavy performance impact
  let shadowInvalidationPending = false;
  const scheduleInvalidateShadow = () => {
    if (!shadowInvalidationPending) {
      shadowInvalidationPending = true;
      setTimeout(() => {
        invoke("invalidate_shadow");
        shadowInvalidationPending = false;
      }, 16); // ~60fps throttle
    }
  };

  // mouse events
  let mouseWheel = 0;
  elem.addEventListener("wheel", (e) => {
    mouseWheel -= e.deltaY / 10;
  });
  let mouseDownTime = 0;
  let mouseDownCount = 0;
  elem.addEventListener("mousedown", () => {
    mouseDownTime = new Date().getTime();
    mouseDownCount += 1;
  });
  elem.addEventListener("mouseleave", () => {
    emit("cursor_grab", { grab: false });
  });
  elem.addEventListener("mouseup", () => {
    emit("cursor_grab", { grab: false });
    if (new Date().getTime() - mouseDownTime < 500) {
      if (mouseDownCount === 2) {
        // show menu
      }
    } else {
      mouseDownCount = 0;
    }
  });
  elem.addEventListener("mousemove", (e) => {
    if (mouseDownCount === 2) {
      if (vrm) {
        emit("cursor_grab", { grab: true });
        vrm.scene.rotation.x -= e.movementY / 100 / Math.PI / 2;
        vrm.scene.rotation.y += e.movementX / 100 / Math.PI / 2;
        // Invalidate shadow when rotating to fix ghost artifact
        scheduleInvalidateShadow();
      }
    }
  });

  const update = async () => {
    requestAnimationFrame(update);

    if (vrm) {
      vrm.scene.position.x = 0;
      vrm.scene.position.y = 0;
      vrm.scene.position.z = 0;
      const currentBounding = new Three.Box3().setFromObject(vrm.scene);
      vrm.scene.position.x =
        (currentBounding.max.x + currentBounding.min.x) / -2;
      vrm.scene.position.y =
        (currentBounding.max.y + currentBounding.min.y) / -2;
      vrm.scene.position.z =
        (currentBounding.max.z + currentBounding.min.z) / -2;
      const vrmBounding = new Three.Box3().setFromObject(vrm.scene);

      back.position.z = vrmBounding.max.z + 1;

      const vFOV = (camera.fov * Math.PI) / 180;
      const tan = Math.tan(vFOV / 2);
      camera.position.z =
        (vrmBounding.max.y - vrmBounding.min.y + 0.1) / -2 / tan;

      const aspect =
        (vrmBounding.max.x - vrmBounding.min.x) /
        (vrmBounding.max.y - vrmBounding.min.y);
      const width = Math.round((500 + mouseWheel) * aspect);
      const height = Math.round(500 + mouseWheel);

      // Only update window size if it actually changed
      if (width !== prevWidth || height !== prevHeight) {
        prevWidth = width;
        prevHeight = height;
        appWindow.setSize(new LogicalSize(width, height));
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        // Invalidate shadow to fix ghost artifact on macOS transparent windows
        scheduleInvalidateShadow();
      }
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }

    if (onUpdate.current) {
      onUpdate.current(vrm);
      // Invalidate shadow after head rotation update
      scheduleInvalidateShadow();
    }

    renderer.render(scene, camera);
  };
  update();
};
