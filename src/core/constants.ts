export const CX = 16;
export const CZ = 16;
export const CY = 128;
export const CHUNK_VOL = CX * CZ * CY;
export const SEA = 38;

/** Index d'un bloc dans un chunk (x, z dans 0..15, y dans 0..127). */
export const bidx = (x: number, y: number, z: number): number => (y * 16 + z) * 16 + x;

export const ckey = (cx: number, cz: number): number => ((cx & 0xffff) << 16) | (cz & 0xffff);

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
