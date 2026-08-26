import {
	AnyPixelFormat,
	FloatType,
	Matrix4,
	Object3D,
	RedFormat,
	RepeatWrapping,
	Texture,
	TextureDataType,
	UnsignedByteType,
	Vector3,
	Vector3Like,
	Vector4,
	Wrapping,
} from "three";
import {
	abs,
	float,
	globalId,
	If,
	instanceIndex,
	length,
	min,
	modelWorldMatrix,
	modelWorldMatrixInverse,
	mx_noise_float,
	positionLocal,
	smoothstep,
	texture3D,
	textureStore,
	uniform,
	uniformArray,
	uvec3,
	vec3,
	vec4,
} from "three/tsl";
import {
	IndexNode,
	Node,
	Storage3DTexture,
	StorageTextureNode,
	Texture3DNode,
	TextureNode,
	UniformArrayNode,
	UniformNode,
} from "three/webgpu";
import { createStorage3D } from "./util/createStorage3D";
import { CollisionHandler } from "./sdf/CollisionHandler";

const getVoxelCoord = (id: IndexNode, size: Vector3Like) => {
	const x = id.mod(size.x);
	const y = id.div(size.x).mod(size.y);
	const z = id.div(size.x * size.y);

	return uvec3(x, y, z);
};

const gridCoordToUVW = (coord: Node<"uvec3">, grid: Vector3Like) =>
	vec3(coord)
		.add(0.5)
		.div(vec3(grid.x, grid.y, grid.z));

export type NoiseTextureConfig = {
	size: number;
	frecuency: number;
};

export type VoxelGrid = {
	readonly size: Vector3Like;
	readonly coord: Node<"uvec3">;
	readonly uvw: Node<"vec3">;
	readonly texel: Vector3Like;
	readonly count: number;
};

export type DataTexture = {
	write: (coord: Node<"uvec3">, value: Node<"vec4">) => void;
	sample: (uvw: Node<"vec3">) => Texture3DNode;
	loadPixel: (iuvw: Node<"ivec3">) => Texture3DNode;
	getTexture(): Texture;
	setTexture(newTexture: Texture): void;
};

function makeDataTexture(
	name: string,
	size: Vector3Like,
	config?: { wrap?: Wrapping; format?: AnyPixelFormat; writeOnly?: boolean; dataType?: TextureDataType },
): DataTexture {
	const texture = createStorage3D(name, size.x, size.y, size.z, config?.format, config?.dataType);

	const readOnlyNode = texture3D(texture);
	const storeNodes = new Set<StorageTextureNode>();
	let writableTexture = texture;

	if (config?.wrap) {
		texture.wrapR = config.wrap;
		texture.wrapS = config.wrap;
		texture.wrapT = config.wrap;
	}

	return {
		getTexture() {
			return readOnlyNode.value;
		},
		setTexture(newTexture: Texture) {
			readOnlyNode.value = newTexture;
			writableTexture = newTexture as Storage3DTexture;
			for (const node of storeNodes) node.value = newTexture;
		},
		write(coord, value) {
			storeNodes.add(textureStore(writableTexture, coord, value) as unknown as StorageTextureNode);
		},
		sample(uvw) {
			return readOnlyNode.sample(uvw);
		},
		loadPixel(iuvw) {
			return readOnlyNode.load(iuvw);
		},
	};
}

export class FluidFireShaderContext {
	/**
	 * Size of 1 voxel in physical meters
	 */
	readonly dyeVoxelSizeWorld: Vector3;

	// /**
	//  *  Radius in integer voxel count (CPU calculation)
	//  */
	// readonly emitKernelRadius: number;

	readonly uTime = uniform(0);

	readonly uCurlNoiseMultiplier = uniform(5.0);

	/**
	 * noise force frequency
	 */
	readonly uTurbFrequency = uniform(4);

	/**
	 *  turbulence decay rate over age
	 */
	readonly uTurbulenceDecay = uniform(0.51);

	/**
	 * noise force strength
	 */
	readonly uTurbulence = uniform(0.9);

	/**
	 * smoke dissipation /s (default for 2.5s lifespan)
	 */
	readonly uDissipation = uniform(0.2);

	/**
	 * temperature cooling /s (default for 1.0s lifespan)
	 */
	readonly uCooling = uniform(0.21);

	readonly uEmitDensity = uniform(20);
	readonly uEmitTemperature = uniform(15.5);

	/**
	 * velocity dissipation /s
	 */
	readonly uVelDamping = uniform(0.25);

	readonly uVolumeWorldSize: UniformNode<"vec3", Vector3>;

	/**
	 * Simulation's delta time
	 */
	readonly uDt = uniform(0.016);

	/**
	 * hot air rises
	 */
	readonly uBuoyancy = uniform(6.1);

	readonly uVorticityConfinementStrength = uniform(0.1);

	/**
	 * smoke weight (pulls down)
	 */
	readonly uWeight = uniform(0.15);

	readonly noiseTextureConfig: NoiseTextureConfig;

	/**
	 * offsets in dye grid units for when a vertex will splat data on dye grid
	 * This is calculated once on CPU before calling the emitObjectsPass to speed up the process
	 *
	 * xyz offset + w fallof factor
	 */
	readonly uVertexSplatBrushOffsets: UniformArrayNode<"ivec4">;
	readonly uVertexSplatBrushOffsetsCount: UniformNode<"uint", number>;
	readonly uEmitRadiusWorld: UniformNode<"float", number>;

	/**
	 * to turn world space coord to local space of our bounding box
	 */
	readonly invWorldMatrix: UniformNode<"mat4", Matrix4>;
	readonly worldMatrix: UniformNode<"mat4", Matrix4>;

	readonly grid: Readonly<{
		phy: VoxelGrid;
		dye: VoxelGrid;
		world: Readonly<{
			size: Readonly<Vector3Like>;
		}>;
	}>;

	readonly texture: {
		/**
		 * xyz
		 */
		curlNoise: DataTexture;

		/**
		 * vec4(vx,vy,vz,magnitud...)
		 */
		vel: {
			A: DataTexture;
			B: DataTexture;
		};

		/**
		 * vec4(density, temperature, age, 1.0)
		 */
		dye: {
			A: DataTexture;
			B: DataTexture;
			swap(): void;
		};
		divergence: DataTexture;
		press: {
			A: DataTexture;
			B: DataTexture;
		};
		//detailNoise: DataTexture;
		vorticity: DataTexture;
	};

	readonly collisions: CollisionHandler;

	constructor(config: {
		world: Object3D;
		grid: {
			phy: Vector3Like;
			dye: Vector3Like;
			world: Vector3Like;
		};
		noiseTextureConfig: NoiseTextureConfig;
		collisions: CollisionHandler;
	}) {
		this.noiseTextureConfig = config.noiseTextureConfig;
		this.collisions = config.collisions;

		this.worldMatrix = uniform(config.world.matrixWorld);
		this.invWorldMatrix = uniform(config.world.matrixWorld.invert());

		// const phyCoord = getVoxelCoord(instanceIndex, config.grid.phy);
		// const dyeCoord = getVoxelCoord(instanceIndex, config.grid.dye);
		const phyCoord = globalId;
		const dyeCoord = globalId;

		this.dyeVoxelSizeWorld = new Vector3().copy(config.grid.world).divide(config.grid.dye);

		//this.emitKernelRadius = Math.max(1, Math.ceil(config.vertexEmissionWorldRadius / this.dyeVoxelSizeWorld));
		this.uVertexSplatBrushOffsets = uniformArray<"ivec4">([new Vector4()]);
		this.uVertexSplatBrushOffsetsCount = uniform(0, "uint");
		this.uEmitRadiusWorld = uniform(0, "float");

		this.grid = {
			phy: {
				size: config.grid.phy,
				coord: phyCoord,
				uvw: gridCoordToUVW(phyCoord, config.grid.phy),
				texel: {
					x: 1 / config.grid.phy.x,
					y: 1 / config.grid.phy.y,
					z: 1 / config.grid.phy.z,
				},
				count: config.grid.phy.x * config.grid.phy.y * config.grid.phy.z,
			},
			dye: {
				size: config.grid.dye,
				coord: dyeCoord,
				uvw: gridCoordToUVW(dyeCoord, config.grid.dye),
				texel: {
					x: 1 / config.grid.dye.x,
					y: 1 / config.grid.dye.y,
					z: 1 / config.grid.dye.z,
				},
				count: config.grid.dye.x * config.grid.dye.y * config.grid.dye.z,
			},
			world: {
				size: config.grid.world,
			},
		};

		this.uVolumeWorldSize = uniform(new Vector3(config.grid.world.x, config.grid.world.y, config.grid.world.z));

		this.texture = {
			curlNoise: makeDataTexture(
				"curlNoise",
				{
					x: config.noiseTextureConfig.size,
					y: config.noiseTextureConfig.size,
					z: config.noiseTextureConfig.size,
				},
				{
					wrap: RepeatWrapping,
				},
			),
			vel: {
				A: makeDataTexture("velA", config.grid.phy),
				B: makeDataTexture("velB", config.grid.phy),
			},
			dye: {
				A: makeDataTexture("dyeA", config.grid.dye),
				B: makeDataTexture("dyeB", config.grid.dye),
				swap() {
					const tmp = this.A.getTexture();
					this.A.setTexture(this.B.getTexture());
					this.B.setTexture(tmp);
				},
			},
			divergence: makeDataTexture("divergence", config.grid.phy, { format: RedFormat }),
			press: {
				A: makeDataTexture("pressA", config.grid.phy, { format: RedFormat }),
				B: makeDataTexture("pressB", config.grid.phy, { format: RedFormat }),
			},
			vorticity: makeDataTexture("vorticity", config.grid.phy),
			// detailNoise: makeDataTexture(
			// 	"detailNoise",
			// 	{
			// 		x: config.noiseTextureConfig.size,
			// 		y: config.noiseTextureConfig.size,
			// 		z: config.noiseTextureConfig.size,
			// 	},
			// 	{ wrap: RepeatWrapping, format: RedFormat },
			// ),
		};

		/**
		 * textures for the object collider...
		 */
		this.collisions.setBakeTexture(
			// normal + dist
			makeDataTexture("sdf", config.grid.phy),
			//
			makeDataTexture("sdfVelocity", config.grid.phy),
		);
	}

	insideBoundingVolume(worldPos: Node<"vec3">, callMe: (uvw: Node<"vec3">) => void) {
		const bboxPosition = this.invWorldMatrix.mul(worldPos).xyz;
		const uvw = bboxPosition
			//.sub(vec3(0, this.grid.world.size.y / 2, 0))
			.div(this.uVolumeWorldSize)
			.add(0.5);

		If(
			uvw.x
				.greaterThanEqual(0)
				.and(uvw.x.lessThanEqual(1))
				.and(uvw.y.greaterThanEqual(0))
				.and(uvw.y.lessThanEqual(1))
				.and(uvw.z.greaterThanEqual(0))
				.and(uvw.z.lessThanEqual(1)),
			() => {
				callMe(uvw);
			},
		);
	}

	sampleVolumeAt(worldPos: Node<"vec3">) {
		//const bboxPosition = modelWorldMatrixInverse.mul(worldPos);

		const bboxPosition = this.invWorldMatrix.mul(worldPos).xyz;

		const uvw = bboxPosition
			//.sub(vec3(0, this.grid.world.size.y / 2, 0))
			.div(this.uVolumeWorldSize)
			.add(0.5)
			.toVar();

		// 1) Domain Warping
		const noiseDistortion = this.texture.vel.A.sample(uvw)
			.xyz.div(this.uVolumeWorldSize)
			.mul(0.35)
			.mul(this.uTurbulence);
		const distortedUVW = uvw.add(noiseDistortion).clamp(0.0, 1.0).toVar();

		const sample = this.texture.dye.A.sample(uvw);

		const density = sample.r.toVar(); //Declare as Var so we can mutate
		const age = sample.b;
		const temperature = sample.g;
		const colorMass = sample.a;

		// 2) Conditional Detail Noise - Only fetch if smoke exists here

		// const noiseCoord = bboxPosition
		// 	.mul(0.25)
		// 	.mul(13.85)
		// 	.add(vec3(0, age.mul(0.3).negate(), 0));

		// const detailNoise = this.texture.curlNoise.sample(noiseCoord).r;
		// density.mulAssign(detailNoise.mul(0.4).add(0.8));
		// 2) High-frequency detail noise modulation.
		const detailNoise = mx_noise_float(bboxPosition.mul(5.5).add(vec3(0, age.mul(0.8).negate(), 0))).mul(this.uTurbulence);
		density.mulAssign(detailNoise.mul(0.35).add(0.85));

		const edge = min(distortedUVW, vec3(1).sub(distortedUVW));
		density.mulAssign(smoothstep(0.0, 0.03, min(edge.x, min(edge.y, edge.z))));

		return { density, temperature, age, distortedUVW, bboxPosition, uvw, colorMass };
	}
}
