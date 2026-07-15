export type ThemeMode = "day" | "night";

export const FRAME_COUNT = 242;

export function frameSrc(mode: ThemeMode, index: number): string {
  return `/frames/${mode}/${String(index + 1).padStart(3, "0")}.webp`;
}
