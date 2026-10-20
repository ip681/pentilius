// Which part of the planet a tap landed on, from the tap's position alone.
// The planet's SVG groups don't report taps reliably on Android (new
// architecture), so the whole planet is one plain touch area and this works
// out the land: the Core in the middle, the lands as equal slices of the ring
// around it — the first one starting at the top and going clockwise, exactly
// as they are drawn.

export interface PlanetGeometry {
  // Size of the drawing (its viewBox) and of the view on screen, in points.
  drawingSize: number;
  viewSize: number;
  innerRadius: number;
  // Taps up to this radius still count — the lands' names sit outside the ring.
  outerHitRadius: number;
  landCount: number;
}

export type PlanetHit = { kind: 'core' } | { kind: 'land'; order: number } | null;

export function planetHit(tapX: number, tapY: number, g: PlanetGeometry): PlanetHit {
  const scale = g.drawingSize / g.viewSize;
  const center = g.drawingSize / 2;
  const dx = tapX * scale - center;
  const dy = tapY * scale - center;
  const distance = Math.hypot(dx, dy);
  if (distance <= g.innerRadius) return { kind: 'core' };
  if (distance > g.outerHitRadius || g.landCount < 1) return null;
  // 0° at the top, growing clockwise (screen y grows downwards).
  const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
  const order = Math.min(g.landCount, Math.floor(angle / (360 / g.landCount)) + 1);
  return { kind: 'land', order };
}
