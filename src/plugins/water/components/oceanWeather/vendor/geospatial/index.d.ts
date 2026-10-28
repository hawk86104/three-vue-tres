import { Data3DTexture, Loader, Matrix4, Vector3 } from 'three'

export class Geodetic {
    constructor(longitude: number, latitude: number)
    toECEF(): Vector3
}

export class Ellipsoid {
    static WGS84: Ellipsoid
    getEastNorthUpFrame(position: Vector3): Matrix4
}

export function parseUint8Array(buffer: ArrayBuffer): Uint8Array
export class DataTextureLoader extends Loader<Data3DTexture> {
    constructor(textureClass: typeof Data3DTexture, parser: typeof parseUint8Array, options: object)
}
export class STBNLoader extends Loader<Data3DTexture> {}
