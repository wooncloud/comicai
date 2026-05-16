'use client';
import { atom } from 'tldraw';

export type Point = { x: number; y: number };

/**
 * polygon 도구가 현재 누적하는 vertex들 (페이지 좌표).
 * tool과 preview component가 공유.
 */
export const polygonPointsAtom = atom<Point[]>('polygon-points', []);

/** 마우스의 현재 페이지 좌표 (preview line 끝점). */
export const polygonHoverAtom = atom<Point | null>('polygon-hover', null);

export function resetPolygonState(): void {
  polygonPointsAtom.set([]);
  polygonHoverAtom.set(null);
}
