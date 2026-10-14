const DEAD_ZONE = 0.15;
export const JOYSTICK_RADIUS_PX = 56;

/** Direction uses the raw drag; only its magnitude saturates at the rim. */
export function joystickVector(dx: number, dy: number): { x: number; z: number } {
  const length = Math.hypot(dx, dy);
  const magnitude = Math.min(length / JOYSTICK_RADIUS_PX, 1);
  if (magnitude <= DEAD_ZONE) return { x: 0, z: 0 };
  const strength = (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE);
  return { x: dx / length * strength, z: -dy / length * strength };
}
