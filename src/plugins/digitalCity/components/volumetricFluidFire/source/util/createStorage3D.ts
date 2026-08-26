import * as THREE from "three/webgpu";

export function createStorage3D(
	name: string,
	sizeX: number,
	sizeY: number,
	sizeZ: number,
	format: THREE.AnyPixelFormat = THREE.RGBAFormat,
	dataType: THREE.TextureDataType = THREE.HalfFloatType,
) {
	const texture = new THREE.Storage3DTexture(sizeX, sizeY, sizeZ);
	texture.name = name;
	texture.format = format;
	texture.type = format === THREE.RedFormat ? THREE.FloatType : dataType;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.wrapS = THREE.ClampToEdgeWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.wrapR = THREE.ClampToEdgeWrapping;
	texture.generateMipmaps = false;

	return texture;
}
