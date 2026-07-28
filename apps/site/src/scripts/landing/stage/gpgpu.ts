import type { Tier } from '../tier';
import { readTuning } from './tuning';

const SIZE = 1024;

const FLOW_GLSL = `
vec3 flowField(vec3 p, float t) {
  float a = sin(p.y * 0.33 + t * 0.42) + cos(p.z * 0.27 - t * 0.31);
  float b = sin(p.z * 0.31 - t * 0.28) + cos(p.x * 0.29 + t * 0.24);
  float c = sin(p.x * 0.28 + t * 0.35) + cos(p.y * 0.25 - t * 0.3);
  float swirl = 0.55 / (0.9 + length(p.xz) * 0.06);
  return vec3(a - p.z * 0.02, b * 0.72, c + p.x * 0.02) * swirl;
}
`;

const VELOCITY_SHADER = `
uniform float uTime;
uniform float uDelta;
uniform float uConverge;
uniform float uBurst;
uniform sampler2D uTarget;

${FLOW_GLSL}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 posData = texture2D(texturePosition, uv);
  vec4 velData = texture2D(textureVelocity, uv);
  vec3 pos = posData.xyz;
  vec3 vel = velData.xyz;
  vec3 target = texture2D(uTarget, uv).xyz;

  vec3 flow = flowField(pos * 0.16, uTime) * 2.4;
  vec3 toTarget = target - pos;
  float dist = length(toTarget);
  vec3 pull = (dist > 0.0001 ? toTarget / dist : vec3(0.0)) * min(dist, 6.0) * 5.2;

  vec3 accel = mix(flow, pull, uConverge);
  accel += normalize(pos + vec3(0.001)) * uBurst * 11.0;

  vel += accel * uDelta;
  vel *= mix(0.972, 0.9, uConverge);

  float limit = 14.0;
  float speed = length(vel);
  if (speed > limit) vel = vel / speed * limit;

  gl_FragColor = vec4(vel, velData.w);
}
`;

const POSITION_SHADER = `
uniform float uDelta;
uniform float uConverge;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 posData = texture2D(texturePosition, uv);
  vec4 velData = texture2D(textureVelocity, uv);
  vec3 pos = posData.xyz + velData.xyz * uDelta;

  float leash = mix(52.0, 30.0, uConverge);
  float d = length(pos);
  if (d > leash) pos = pos / d * leash;

  gl_FragColor = vec4(pos, posData.w);
}
`;

const RENDER_VERTEX = `
uniform sampler2D uPosition;
uniform sampler2D uVelocity;
uniform float uPixelRatio;
uniform float uPointScale;
attribute vec2 aReference;
varying float vSpeed;
varying float vSeed;

void main() {
  vec4 posData = texture2D(uPosition, aReference);
  vec3 velocity = texture2D(uVelocity, aReference).xyz;
  vSpeed = clamp(length(velocity) / 9.0, 0.0, 1.0);
  vSeed = posData.w;

  vec4 mv = modelViewMatrix * vec4(posData.xyz, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = (0.9 + vSpeed * 3.8 + posData.w * 0.8) * uPixelRatio * uPointScale;
  gl_PointSize = size * (34.0 / max(1.0, -mv.z));
}
`;

const RENDER_FRAGMENT = `
uniform vec3 uCool;
uniform vec3 uWarm;
uniform vec3 uHot;
uniform float uBaseAlpha;
uniform float uSpeedAlpha;
uniform float uHotFrom;
varying float vSpeed;
varying float vSeed;

void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  float alpha = smoothstep(0.25, 0.0, r);

  vec3 color = mix(uCool, uWarm, smoothstep(0.0, 0.3, vSpeed));
  color = mix(color, uHot, smoothstep(uHotFrom, 1.0, vSpeed));
  color *= 0.6 + vSeed * 0.45;

  gl_FragColor = vec4(color, alpha * (uBaseAlpha + vSpeed * uSpeedAlpha));
}
`;

export interface ParticleField {
  object: unknown;
  update: (deltaSeconds: number, elapsed: number) => void;
  dispose: () => void;
}

const buildTargetShape = (data: Float32Array, count: number): void => {
  const columns = 44;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const lane = i % columns;
    const laneT = lane / columns;
    const stack = Math.floor(i / columns);

    const x = (laneT - 0.5) * 46;
    const wave =
      Math.sin(laneT * 9.2) * 3.6 + Math.sin(laneT * 21.7 + 1.3) * 1.7 + Math.cos(laneT * 4.1) * 2.2;
    const bodyHeight = 3.2 + Math.abs(Math.sin(laneT * 13.7)) * 7.4;
    const inBody = stack % 7 !== 0;

    const spread = inBody ? 0.72 : 0.14;
    const angle = i * goldenAngle;
    const jitterX = Math.cos(angle) * spread;
    const jitterZ = Math.sin(angle) * spread * 1.6;
    const heightSpan = inBody ? bodyHeight : bodyHeight * 1.85;
    const y = wave + (((i * 2654435761) % 1000) / 1000 - 0.5) * heightSpan;

    data[i * 4] = x + jitterX;
    data[i * 4 + 1] = y;
    data[i * 4 + 2] = jitterZ + Math.sin(laneT * 6.1) * 2.4 - 26;
    data[i * 4 + 3] = t;
  }
};

export const createParticleField = async (
  renderer: unknown,
  tier: Tier,
): Promise<ParticleField | null> => {
  if (tier !== 'full') return null;
  const tuning = readTuning();

  const THREE = await import('three');
  const { GPUComputationRenderer } = await import(
    'three/examples/jsm/misc/GPUComputationRenderer.js'
  );

  const gpu = new GPUComputationRenderer(SIZE, SIZE, renderer as never);
  const count = SIZE * SIZE;

  const positionTexture = gpu.createTexture();
  const velocityTexture = gpu.createTexture();
  const targetTexture = gpu.createTexture();

  const positionData = positionTexture.image.data as unknown as Float32Array;
  const velocityData = velocityTexture.image.data as unknown as Float32Array;
  const targetData = targetTexture.image.data as unknown as Float32Array;

  for (let i = 0; i < count; i++) {
    const radius = 26 + ((i * 7919) % 1000) / 1000 * 34;
    const theta = ((i * 2654435761) % 10000) / 10000 * Math.PI * 2;
    const phi = Math.acos(1 - (2 * ((i * 40503) % 10000)) / 10000);
    positionData[i * 4] = radius * Math.sin(phi) * Math.cos(theta);
    positionData[i * 4 + 1] = radius * Math.cos(phi) * 0.5;
    positionData[i * 4 + 2] = radius * Math.sin(phi) * Math.sin(theta) - 10;
    positionData[i * 4 + 3] = ((i * 65537) % 1000) / 1000;
    velocityData[i * 4] = 0;
    velocityData[i * 4 + 1] = 0;
    velocityData[i * 4 + 2] = 0;
    velocityData[i * 4 + 3] = 1;
  }
  buildTargetShape(targetData, count);

  const velocityVariable = gpu.addVariable('textureVelocity', VELOCITY_SHADER, velocityTexture);
  const positionVariable = gpu.addVariable('texturePosition', POSITION_SHADER, positionTexture);
  gpu.setVariableDependencies(velocityVariable, [velocityVariable, positionVariable]);
  gpu.setVariableDependencies(positionVariable, [velocityVariable, positionVariable]);

  const targetMap = new THREE.DataTexture(
    targetData,
    SIZE,
    SIZE,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  targetMap.needsUpdate = true;

  velocityVariable.material.uniforms.uTime = { value: 0 };
  velocityVariable.material.uniforms.uDelta = { value: 0.016 };
  velocityVariable.material.uniforms.uConverge = { value: 0 };
  velocityVariable.material.uniforms.uBurst = { value: 0 };
  velocityVariable.material.uniforms.uTarget = { value: targetMap };
  positionVariable.material.uniforms.uDelta = { value: 0.016 };
  positionVariable.material.uniforms.uConverge = { value: 0 };

  const error = gpu.init();
  if (error !== null) throw new Error(error);

  const geometry = new THREE.BufferGeometry();
  const references = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    references[i * 2] = (i % SIZE) / SIZE;
    references[i * 2 + 1] = Math.floor(i / SIZE) / SIZE;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aReference', new THREE.BufferAttribute(references, 2));
  geometry.setDrawRange(0, count);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPosition: { value: null },
      uVelocity: { value: null },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uBaseAlpha: { value: tuning.baseAlpha },
      uSpeedAlpha: { value: tuning.speedAlpha },
      uPointScale: { value: tuning.pointScale },
      uHotFrom: { value: tuning.hotFrom },
      uCool: { value: new THREE.Color(tuning.coolColor) },
      uWarm: { value: new THREE.Color(tuning.warmColor) },
      uHot: { value: new THREE.Color(tuning.hotColor) },
    },
    vertexShader: RENDER_VERTEX,
    fragmentShader: RENDER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const CYCLE = tuning.cycleSeconds;
  let clock = 0;

  return {
    object: points,
    update: (deltaSeconds: number, elapsed: number) => {
      clock = (clock + deltaSeconds) % CYCLE;
      const phase = clock / CYCLE;

      let converge = 0;
      let burst = 0;
      if (phase < 0.16) converge = 0;
      else if (phase < 0.42) converge = (phase - 0.16) / 0.26;
      else if (phase < 0.66) converge = 1;
      else if (phase < 0.72) {
        converge = 1 - (phase - 0.66) / 0.06;
        burst = Math.sin(((phase - 0.66) / 0.06) * Math.PI) * 1.4;
      }

      const dt = Math.min(0.033, deltaSeconds);
      velocityVariable.material.uniforms.uTime.value = elapsed;
      velocityVariable.material.uniforms.uDelta.value = dt;
      velocityVariable.material.uniforms.uConverge.value = converge;
      velocityVariable.material.uniforms.uBurst.value = burst;
      positionVariable.material.uniforms.uDelta.value = dt;
      positionVariable.material.uniforms.uConverge.value = converge;

      gpu.compute();
      material.uniforms.uPosition.value = gpu.getCurrentRenderTarget(positionVariable).texture;
      material.uniforms.uVelocity.value = gpu.getCurrentRenderTarget(velocityVariable).texture;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      targetMap.dispose();
      gpu.dispose();
    },
  };
};
