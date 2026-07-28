export interface ParticleFrame {
  positions: Float32Array;
  heats: Float32Array;
  sizes: Float32Array;
  count: number;
}

export interface RendererConfig {
  capacity: number;
  dpr: number;
  baseColor: [number, number, number];
  hotColor: [number, number, number];
}

export interface ParticleRenderer {
  resize: (width: number, height: number) => void;
  render: (frame: ParticleFrame) => void;
  dispose: () => void;
}
