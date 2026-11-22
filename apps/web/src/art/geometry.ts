const round = (n: number) => Math.round(n * 100) / 100;

/** 极坐标 → 直角坐标，角度以度计，0° 指向右，顺时针增加。 */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [round(cx + r * Math.cos(rad)), round(cy + r * Math.sin(rad))];
}

/** 圆环上的一块扇形玻璃。 */
export function sector(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number): string {
  const [x1, y1] = polar(cx, cy, r2, a1);
  const [x2, y2] = polar(cx, cy, r2, a2);
  const [x3, y3] = polar(cx, cy, r1, a2);
  const [x4, y4] = polar(cx, cy, r1, a1);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M${x1} ${y1}A${r2} ${r2} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 ${large} 0 ${x4} ${y4}Z`;
}

/** 从圆心出发的楔形（用来铺满整块区域，再靠裁剪收边）。 */
export function wedge(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const [x1, y1] = polar(cx, cy, r, a1);
  const [x2, y2] = polar(cx, cy, r, a2);
  return `M${cx} ${cy}L${x1} ${y1}L${x2} ${y2}Z`;
}
