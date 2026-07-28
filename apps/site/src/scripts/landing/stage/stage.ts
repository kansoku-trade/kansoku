import { buildCandles } from '../kline';
import type { Tier } from '../tier';
import { CAMERA_WAYPOINTS, sampleCameraPath } from './cameraPath';

const UP_COLOR = 0x26a69a;
const DOWN_COLOR = 0xef5350;
const AMBER = 0xffb000;

const TERRAIN_COLUMNS = 96;
const TERRAIN_ROWS = 11;
const COLUMN_SPACING = 1.05;
const ROW_SPACING = 2.6;

export interface Stage {
  destroy: () => void;
}

const scrollProgress = (): number => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, window.scrollY / max));
};

export const mountStage = async (
  canvas: HTMLCanvasElement,
  tier: Tier,
): Promise<Stage | null> => {
  if (tier !== 'full') return null;

  const THREE = await import('three');
  const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer.js');
  const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
  const { UnrealBloomPass } = await import(
    'three/examples/jsm/postprocessing/UnrealBloomPass.js'
  );
  const { OutputPass } = await import('three/examples/jsm/postprocessing/OutputPass.js');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x050505, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060606, 0.038);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);

  scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  const key = new THREE.DirectionalLight(0xffd9a0, 0.55);
  key.position.set(-18, 26, 14);
  scene.add(key);
  const rim = new THREE.PointLight(AMBER, 90, 70, 2);
  rim.position.set(6, 9, -22);
  scene.add(rim);

  const disposables: Array<{ dispose: () => void }> = [];

  const candles = buildCandles(TERRAIN_COLUMNS * TERRAIN_ROWS, {
    seed: 20260729,
    volatility: 2.4,
  });
  let high = -Infinity;
  let low = Infinity;
  for (const candle of candles) {
    if (candle.high > high) high = candle.high;
    if (candle.low < low) low = candle.low;
  }
  const span = Math.max(1, high - low);

  const bodyGeometry = new THREE.BoxGeometry(0.62, 1, 0.62);
  const wickGeometry = new THREE.BoxGeometry(0.07, 1, 0.07);
  disposables.push(bodyGeometry, wickGeometry);

  const makeMaterial = (color: number, emissiveIntensity: number) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity,
      roughness: 0.32,
      metalness: 0.15,
    });
    disposables.push(material);
    return material;
  };

  const upMaterial = makeMaterial(UP_COLOR, 0.85);
  const downMaterial = makeMaterial(DOWN_COLOR, 0.85);
  const wickMaterial = makeMaterial(0xb08a4a, 0.5);

  const total = TERRAIN_COLUMNS * TERRAIN_ROWS;
  const upMesh = new THREE.InstancedMesh(bodyGeometry, upMaterial, total);
  const downMesh = new THREE.InstancedMesh(bodyGeometry, downMaterial, total);
  const wickMesh = new THREE.InstancedMesh(wickGeometry, wickMaterial, total);
  upMesh.frustumCulled = false;
  downMesh.frustumCulled = false;
  wickMesh.frustumCulled = false;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let upCount = 0;
  let downCount = 0;

  for (let row = 0; row < TERRAIN_ROWS; row++) {
    for (let column = 0; column < TERRAIN_COLUMNS; column++) {
      const candle = candles[row * TERRAIN_COLUMNS + column];
      if (!candle) continue;
      const x = (column - TERRAIN_COLUMNS / 2) * COLUMN_SPACING;
      const z = -row * ROW_SPACING;
      const depthFade = 1 - row / (TERRAIN_ROWS + 2);

      const bodyLow = (Math.min(candle.open, candle.close) - low) / span;
      const bodyHigh = (Math.max(candle.open, candle.close) - low) / span;
      const bodyHeight = Math.max(0.16, (bodyHigh - bodyLow) * 6.5 * depthFade);
      const bodyCenter = (bodyLow + bodyHigh) * 0.5 * 6.5 * depthFade;

      position.set(x, bodyCenter, z);
      scale.set(1, bodyHeight, 1);
      matrix.compose(position, quaternion, scale);
      if (candle.up) upMesh.setMatrixAt(upCount++, matrix);
      else downMesh.setMatrixAt(downCount++, matrix);

      const wickLow = (candle.low - low) / span;
      const wickHigh = (candle.high - low) / span;
      position.set(x, (wickLow + wickHigh) * 0.5 * 6.5 * depthFade, z);
      scale.set(1, Math.max(0.2, (wickHigh - wickLow) * 6.5 * depthFade), 1);
      matrix.compose(position, quaternion, scale);
      wickMesh.setMatrixAt(row * TERRAIN_COLUMNS + column, matrix);
    }
  }
  upMesh.count = upCount;
  downMesh.count = downCount;
  wickMesh.count = total;
  upMesh.instanceMatrix.needsUpdate = true;
  downMesh.instanceMatrix.needsUpdate = true;
  wickMesh.instanceMatrix.needsUpdate = true;

  const terrain = new THREE.Group();
  terrain.add(upMesh, downMesh, wickMesh);
  terrain.position.y = -15.5;
  scene.add(terrain);

  const gridGeometry = new THREE.PlaneGeometry(220, 220, 44, 44);
  const gridMaterial = new THREE.MeshBasicMaterial({
    color: AMBER,
    wireframe: true,
    transparent: true,
    opacity: 0.13,
  });
  disposables.push(gridGeometry, gridMaterial);
  const grid = new THREE.Mesh(gridGeometry, gridMaterial);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -15.9;
  scene.add(grid);

  const starCount = 900;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.sin(i * 12.9898) * 43758.5453) % 160;
    starPositions[i * 3 + 1] = 6 + (Math.abs(Math.sin(i * 78.233) * 12345.6789) % 46);
    starPositions[i * 3 + 2] = -((Math.abs(Math.sin(i * 39.425) * 9876.5432) % 180) + 12);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffe0b0,
    size: 0.24,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  disposables.push(starGeometry, starMaterial);
  scene.add(new THREE.Points(starGeometry, starMaterial));

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.95, 0.7, 0.34);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloom.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();

  const target = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let progress = scrollProgress();
  let pointerX = 0;
  let pointerY = 0;
  let rafId = 0;

  const onPointerMove = (event: PointerEvent): void => {
    pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
    pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
  };

  const tick = (now: number): void => {
    progress += (scrollProgress() - progress) * 0.08;
    const frame = sampleCameraPath(progress);
    desired.set(
      frame.position[0] + pointerX * 1.6,
      frame.position[1] - pointerY * 1.1,
      frame.position[2],
    );
    camera.position.lerp(desired, 0.09);
    target.set(frame.target[0], frame.target[1], frame.target[2]);
    camera.lookAt(target);

    terrain.position.z = ((now * 0.0016) % ROW_SPACING) - ROW_SPACING;
    grid.position.z = terrain.position.z;
    rim.position.x = Math.sin(now * 0.0004) * 14;

    composer.render();
    rafId = window.requestAnimationFrame(tick);
  };

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  rafId = window.requestAnimationFrame(tick);

  return {
    destroy: () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      for (const item of disposables) item.dispose();
      upMesh.dispose();
      downMesh.dispose();
      wickMesh.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
};

export { CAMERA_WAYPOINTS };
