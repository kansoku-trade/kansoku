export interface CameraWaypoint {
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_WAYPOINTS: CameraWaypoint[] = [
  { position: [0, 2.2, 20], target: [0, -6.5, -26] },
  { position: [-16, 5.5, 12], target: [4, -7, -24] },
  { position: [12, 4.2, 4], target: [-3, 2.4, -14] },
  { position: [0, 15, 12], target: [0, -2, -16] },
  { position: [-6, 3, -6], target: [8, 3, -22] },
  { position: [0, 6, 30], target: [0, 0, -18] },
];

export const sampleCameraPath = (progress: number): CameraWaypoint => {
  const clamped = Math.min(1, Math.max(0, progress));
  const segments = CAMERA_WAYPOINTS.length - 1;
  const scaled = clamped * segments;
  const index = Math.min(segments - 1, Math.floor(scaled));
  const t = scaled - index;
  const eased = t * t * (3 - 2 * t);
  const from = CAMERA_WAYPOINTS[index];
  const to = CAMERA_WAYPOINTS[index + 1];
  const mix = (a: number, b: number): number => a + (b - a) * eased;
  return {
    position: [
      mix(from.position[0], to.position[0]),
      mix(from.position[1], to.position[1]),
      mix(from.position[2], to.position[2]),
    ],
    target: [
      mix(from.target[0], to.target[0]),
      mix(from.target[1], to.target[1]),
      mix(from.target[2], to.target[2]),
    ],
  };
};
