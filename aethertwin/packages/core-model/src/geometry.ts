export interface Point2 { readonly x: number; readonly y: number }
export interface Size2 { readonly width: number; readonly height: number }
export interface Bounds2 { readonly min: Point2; readonly max: Point2 }
export interface Transform2D { readonly translation: Point2; readonly rotation: number; readonly scale: Point2 }
export interface Spatial3D { readonly elevation: number; readonly height: number }

export const identityTransform2D: Transform2D = Object.freeze({
  translation: Object.freeze({ x: 0, y: 0 }),
  rotation: 0,
  scale: Object.freeze({ x: 1, y: 1 }),
});
