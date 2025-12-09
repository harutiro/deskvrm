import type { VRM } from "@pixiv/three-vrm";

export type OnUpdateCallback = (vrm: VRM | null) => void;

export interface MousePosition {
  x: number;
  y: number;
}

export interface WindowOffset {
  x: number;
  y: number;
}
