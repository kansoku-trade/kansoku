import type { ParticleFrame, ParticleRenderer, RendererConfig } from './types';

const vertexShaderSource = `
attribute float aHeat;
attribute float aSize;
uniform float uDpr;
varying float vHeat;
void main() {
  vHeat = aHeat;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * (0.6 + vHeat * 0.8) * uDpr;
}
`;

const fragmentShaderSource = `
precision mediump float;
uniform vec3 uBaseColor;
uniform vec3 uHotColor;
varying float vHeat;
void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;
  float edge = 1.0 - smoothstep(0.3, 0.5, dist);
  vec3 color = mix(uBaseColor, uHotColor, vHeat);
  gl_FragColor = vec4(color, (0.35 + vHeat * 0.65) * edge);
}
`;

export const createWebglRenderer = async (
  canvas: HTMLCanvasElement,
  config: RendererConfig,
): Promise<ParticleRenderer> => {
  const THREE = await import('three');

  const toUnitColor = ([r, g, b]: [number, number, number]) =>
    new THREE.Vector3(r / 255, g / 255, b / 255);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.debug.onShaderError = (gl, program, glVertexShader, glFragmentShader) => {
    const vertexLog = gl.getShaderInfoLog(glVertexShader) ?? '';
    const fragmentLog = gl.getShaderInfoLog(glFragmentShader) ?? '';
    const programLog = gl.getProgramInfoLog(program) ?? '';
    throw new Error(`particle shader compile failed: ${vertexLog} ${fragmentLog} ${programLog}`);
  };
  renderer.setPixelRatio(config.dpr);
  renderer.setClearColor(0x000000, 0);

  const width = canvas.clientWidth || 1;
  const height = canvas.clientHeight || 1;
  renderer.setSize(width, height, false);

  const camera = new THREE.OrthographicCamera(0, width, 0, height, -1, 1);
  const scene = new THREE.Scene();

  const positionArray = new Float32Array(config.capacity * 3);
  const heatArray = new Float32Array(config.capacity);
  const sizeArray = new Float32Array(config.capacity);

  const positionAttribute = new THREE.BufferAttribute(positionArray, 3);
  const heatAttribute = new THREE.BufferAttribute(heatArray, 1);
  const sizeAttribute = new THREE.BufferAttribute(sizeArray, 1);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  heatAttribute.setUsage(THREE.DynamicDrawUsage);
  sizeAttribute.setUsage(THREE.DynamicDrawUsage);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aHeat', heatAttribute);
  geometry.setAttribute('aSize', sizeAttribute);
  geometry.setDrawRange(0, 0);

  const material = new THREE.ShaderMaterial({
    vertexShader: vertexShaderSource,
    fragmentShader: fragmentShaderSource,
    uniforms: {
      uDpr: { value: config.dpr },
      uBaseColor: { value: toUnitColor(config.baseColor) },
      uHotColor: { value: toUnitColor(config.hotColor) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  geometry.setDrawRange(0, 1);
  renderer.render(scene, camera);
  renderer.clear();
  geometry.setDrawRange(0, 0);

  const resize = (nextWidth: number, nextHeight: number): void => {
    renderer.setSize(nextWidth, nextHeight, false);
    camera.right = nextWidth;
    camera.bottom = nextHeight;
    camera.updateProjectionMatrix();
  };

  const render = (frame: ParticleFrame): void => {
    const count = Math.min(frame.count, config.capacity);
    for (let i = 0; i < count; i++) {
      positionArray[i * 3] = frame.positions[i * 2];
      positionArray[i * 3 + 1] = frame.positions[i * 2 + 1];
      positionArray[i * 3 + 2] = 0;
      heatArray[i] = frame.heats[i];
      sizeArray[i] = frame.sizes[i];
    }
    positionAttribute.needsUpdate = true;
    heatAttribute.needsUpdate = true;
    sizeAttribute.needsUpdate = true;
    geometry.setDrawRange(0, count);
    renderer.render(scene, camera);
  };

  const dispose = (): void => {
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };

  return { resize, render, dispose };
};
