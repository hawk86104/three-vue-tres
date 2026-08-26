import {
	AdditiveBlending,
	AxesHelper,
	BoxGeometry,
	Color,
	DoubleSide,
	FloatType,
	Layers,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshNormalMaterial,
	Object3D,
	PerspectiveCamera,
	RGBAFormat,
	Scene,
	SpotLight,
	Vector2,
	Vector3,
	Vector3Like,
	Vector4,
} from "three";
import {
	abs,
	color,
	Continue,
	cos,
	Discard,
	distance,
	float,
	floor,
	Fn,
	fract,
	frameId,
	globalId,
	If,
	instanceIndex,
	int,
	ivec3,
	Loop,
	max,
	mix,
	pass,
	passTexture,
	positionWorld,
	pow,
	Return,
	screenCoordinate,
	screenUV,
	select,
	sin,
	smoothstep,
	step,
	storage,
	texture,
	texture3D,
	textureStore,
	uniform,
	uniformArray,
	vec2,
	vec3,
	vec4,
} from "three/tsl";
import {
	TextureNode,
	VolumeNodeMaterial,
	Node,
	Storage3DTexture,
	WebGPURenderer,
	PassNode,
	TempNode,
	StorageBufferAttribute,
	UniformArrayNode,
	UniformNode,
} from "three/webgpu";
import { EmitterManager, EmitterObjectDef, EmitterOptions } from "./EmitterManager";
import { createStorage3D } from "./util/createStorage3D";
import { FluidFireShaderContext, NoiseTextureConfig } from "./FluidFireShaderContext";
import { curlNoisePass } from "./pass/curlNoisePass";
import { advectVelocityPass } from "./pass/advectVelocityPass";
import { divergencePass } from "./pass/divergencePass";
import { jacobiPass } from "./pass/jacobiPass";
import { projectPass } from "./pass/projectPass";
import { advectDyePass } from "./pass/advectDyePass";
import { emitObjectPassFragment, emitObjectsVelocityAndDyePassFragment } from "./pass/emitObjectPass";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import { CollisionHandler, CollisionHandlerConfig } from "./sdf/CollisionHandler";
import { BasicShapes } from "./sdf/shape/SDFShape";
import { vorticityPass } from "./pass/vorticityPass";

export type FireColorStopType = "tier1" | "tier2" | "tier3";
export type FireColorType = "base" | FireColorStopType | "special";
export type VolumetricFluidFireDebugMode = "final" | "density" | "temperature" | "velocity" | "colliders";

const DEBUG_MODE_IDS: Record<VolumetricFluidFireDebugMode, number> = {
	final: 0,
	density: 1,
	temperature: 2,
	velocity: 3,
	colliders: 4,
};

const interleavedGradientNoise = Fn(([point]) =>
	fract(fract(point.dot(vec2(0.06711056, 0.00583715))).mul(52.9829189)),
);

export type TemperatureColor = {
	color: Color;
	transition: { from: number; to: number };
};

export type VolumetricFluidFireConfig = {
	debug: {
		renderColliders?: boolean;
		renderVolumeBox?: boolean;

		/**
		 * this will make the volume only render the underlying noise texture being used.
		 * Useful to see what the turbulence is working with...
		 */
		noise?: boolean;
	};
	renderLayer: number;
	size: {
		boundingBox: Vector3Like;
		renderResolution: Vector3Like;
		physicsResolution: Vector3Like;
	};
	steps: number;
	burnableMeshes: EmitterObjectDef[];
	noise: NoiseTextureConfig;
	pressureIterations: number;
	vertexEmissionWorldRadius: number;
	blurStrength: number;

	collisions: Partial<CollisionHandlerConfig>;
	colors: {
		/**
		 * color at temperature 0
		 */
		baseColor: Color;

		/**
		 * temperature that we can consider to use the max color.
		 * This affects the coloring of the fire. Temperature will be divided by this color and the result will be used
		 * to pick the right tier color.
		 */
		temperatureAtMaxColor: number;

		/**
		 * each tier the temperature [0-1] gets hotter
		 */
		byTemperature: {
			tier1: TemperatureColor;
			tier2: TemperatureColor;
			tier3: TemperatureColor;
		};

		/**
		 * Special color. Only 1 special color is supporter at this time...
		 */
		specialColor: Color;
	};
};

export class VolumetricFluidFire extends Object3D {
	/**
	 * User for post-processing this is the node that will contain the volumetric lighting.
	 * Usually you would "add" this on top of your sceneNode
	 */
	readonly getRenderPass: (scene: Scene, camera: PerspectiveCamera, sceneDepth: TextureNode) => Node<"vec4">;

	/**
	 * Returns a proxy objects that will "contain" the fire for that particular emitter's ID.
	 */
	readonly getFireFor: (id: string, options?: EmitterOptions) => Object3D | null;
	private objectsManager: EmitterManager;

	/**
	 * Must be called AFTER `initialize` otherwise it will be `undefined`.
	 * This will keep the position of the objects and other data in sync with the data on the GPU.
	 */
	readonly update: ((delta: number) => void) | undefined;

	/**
	 * Call this se we can compute some shaders ( like the to create the noise texture )
	 */
	readonly initialize: () => Promise<void>;

	/**
	 * Data relevant to the compute shaders so they can do their thing...
	 */
	readonly shaderContext: FluidFireShaderContext;

	public simulate: boolean = true;
	public simulationSpeed = 2;

	private volumetricPass: PassNode | undefined;

	private config: VolumetricFluidFireConfig;

	readonly volumetricMaterial: VolumeNodeMaterial;

	private _curlNoiseUpdated = false;

	private _keyLightPosition = new Vector3();
	private uKeyLightPosition = uniform(this._keyLightPosition);

	/**
	 * Colors to be used in the fire, base color, tier1,2,3 and special color.
	 */
	private uTemperatureColors: UniformArrayNode<"color">;

	/**
	 * Smoothstep steps for each tier color ( tier 1, 2, 3 )
	 */
	private uTemperatureColorStops: UniformArrayNode<"vec2">;

	private uTemperatureAtMaxColor = uniform(0); //set in the constructor
	// --- New Aesthetic Control Uniforms ---
	private uRadianceMultiplier = uniform(15.0); // Controls bloom/core intensity
	private uSpecialColorMultiplier = uniform(8.0); // Overall volumetric opacity scale
	private uShadowAbsorption = uniform(2.0); // Controls how fast light is blocked by smoke
	private uTintBlendRange = uniform(new Vector2(0.01, 0.1)); // Smooth transition range for colorMass/special tints
	private uDebugMode = uniform(0, "int");

	private collisions: CollisionHandler;

	constructor(renderer: WebGPURenderer, config: Partial<VolumetricFluidFireConfig> = {}) {
		super();

		const cfg: VolumetricFluidFireConfig = {
			debug: { renderColliders: false, renderVolumeBox: false, noise: false },
			renderLayer: 10,
			size: {
				boundingBox: new Vector3(10, 10, 10),
				renderResolution: new Vector3(100, 100, 100),
				physicsResolution: new Vector3(64, 64, 64),
			},
			steps: 12,
			burnableMeshes: [],
			noise: {
				size: 64,
				frecuency: 122,
			},
			pressureIterations: 4,
			vertexEmissionWorldRadius: 0.02,
			blurStrength: 0,
			colors: {
				baseColor: new Color(0, 0, 0),
				temperatureAtMaxColor: 1, //set below...
				byTemperature: {
					tier1: {
						//"smoke"
						color: new Color(1.2, 0.1, 0.0),
						transition: {
							from: 0.01,
							to: 0.1,
						},
					},
					tier2: {
						color: new Color(4.0, 1.2, 0.05).multiplyScalar(3),
						transition: {
							from: 0.3,
							to: 0.5,
						},
					},
					tier3: {
						color: new Color(12.0, 9.0, 2.0).multiplyScalar(3),
						transition: {
							from: 0.7,
							to: 0.8,
						},
					},
				},
				specialColor: new Color(0x00ffff), //debug
			},
			collisions: {
				disabled: false,
				friction: 0.8,
				angularVelocityMultiplier: 1,
				collisionMargin: 0.1,
				maxCollisionShapes: {
					boxes: 32,
					ellipsoids: 32,
					total: 64,
				},
				sdfShapes: [],
			},
			...config,
		};

		this.config = cfg;

		this.uTemperatureColors = uniformArray(
			[
				cfg.colors.baseColor,
				cfg.colors.byTemperature.tier1.color,
				cfg.colors.byTemperature.tier2.color,
				cfg.colors.byTemperature.tier3.color,
				cfg.colors.specialColor,
			],
			"color",
		);

		this.uTemperatureColorStops = uniformArray(
			[
				new Vector2(
					cfg.colors.byTemperature.tier1.transition.from,
					cfg.colors.byTemperature.tier1.transition.to,
				),
				new Vector2(
					cfg.colors.byTemperature.tier2.transition.from,
					cfg.colors.byTemperature.tier2.transition.to,
				),
				new Vector2(
					cfg.colors.byTemperature.tier3.transition.from,
					cfg.colors.byTemperature.tier3.transition.to,
				),
			],
			"vec2",
		);

		this.temperatureAtMaxColor = cfg.colors.temperatureAtMaxColor;

		if (cfg.debug.renderVolumeBox) {
			this.add(new AxesHelper(0.1));
			this.add(
				new Mesh(
					new BoxGeometry(cfg.size.boundingBox.x, cfg.size.boundingBox.y, cfg.size.boundingBox.z),
					new MeshBasicMaterial({ wireframe: true }),
				),
			);
		}

		//
		// Objects manager : ( this class is in charge of keeping the objects data in sync with the GPU )
		//
		this.objectsManager = new EmitterManager(cfg.burnableMeshes);

		//
		// collisions handler
		//
		this.collisions = new CollisionHandler(cfg.collisions);

		//
		// Shaders context
		//
		this.shaderContext = new FluidFireShaderContext({
			world: this,
			grid: {
				phy: cfg.size.physicsResolution,
				dye: cfg.size.renderResolution,
				world: cfg.size.boundingBox,
			},
			noiseTextureConfig: cfg.noise,
			collisions: this.collisions,
		});

		this.vertexEmissionRadius = cfg.vertexEmissionWorldRadius;

		// 1. Workgroup size per 3D block (4x4x4 = 64 threads)
		const WORKGROUP_3D = [4, 4, 4];
		// // 2. Number of workgroups to dispatch on X, Y, Z
		const PHYS_DISPATCH = [
			Math.ceil(cfg.size.physicsResolution.x / WORKGROUP_3D[0]), // 64 / 4 = 16
			Math.ceil(cfg.size.physicsResolution.y / WORKGROUP_3D[1]), // 64 / 4 = 16
			Math.ceil(cfg.size.physicsResolution.z / WORKGROUP_3D[2]), // 64 / 4 = 16
		];
		const DYE_DISPATCH = [
			Math.ceil(cfg.size.renderResolution.x / WORKGROUP_3D[0]), // 100 / 4 = 25
			Math.ceil(cfg.size.renderResolution.y / WORKGROUP_3D[1]), // 100 / 4 = 25
			Math.ceil(cfg.size.renderResolution.z / WORKGROUP_3D[2]), // 100 / 4 = 25
		];
		const NOISE_DISPATCH = [
			Math.ceil(cfg.noise.size / WORKGROUP_3D[0]),
			Math.ceil(cfg.noise.size / WORKGROUP_3D[1]),
			Math.ceil(cfg.noise.size / WORKGROUP_3D[2]),
		];

		//
		// Simulation's shader passes
		//

		const phyGridRes = cfg.size.physicsResolution;
		const dyeGridRes = cfg.size.renderResolution;

		const inBoundsRun = (name: string, grid: Vector3Like, DISPATCH: number[], execPass: VoidFunction) => {
			return Fn(() => {
				const coord = globalId;
				const gridResolution = ivec3(grid.x, grid.y, grid.z);
				If(
					coord.x
						.lessThan(0)
						.or(coord.x.greaterThanEqual(gridResolution.x))
						.or(coord.y.lessThan(0).or(coord.y.greaterThanEqual(gridResolution.y)))
						.or(coord.z.lessThan(0).or(coord.z.greaterThanEqual(gridResolution.z))),
					() => {
						Return();
					},
				);
				execPass();
			})()
				.compute(DISPATCH as any, WORKGROUP_3D)
				.setName(name);
		};

		const pressTexture = this.shaderContext.texture.press;

		const computeShaders = {
			vorticityPass: inBoundsRun("Vorticity", phyGridRes, PHYS_DISPATCH, vorticityPass(this.shaderContext)),

			bakeColliders: inBoundsRun(
				"Bake Colliders",
				phyGridRes,
				PHYS_DISPATCH,
				this.collisions.bakeCollidersPass(this.shaderContext),
			),

			curlPassCompute: inBoundsRun(
				"Curl Noise",
				{ x: cfg.noise.size, y: cfg.noise.size, z: cfg.noise.size },
				NOISE_DISPATCH,
				curlNoisePass(this.shaderContext),
			),

			advectPassCompute: inBoundsRun(
				"Advect Velocity",
				phyGridRes,
				PHYS_DISPATCH,
				advectVelocityPass(this.shaderContext),
			),

			divPassCompute: inBoundsRun("Divergence", phyGridRes, PHYS_DISPATCH, divergencePass(this.shaderContext)),

			jacobiPassABCompute: inBoundsRun(
				"jacobiABCompute",
				phyGridRes,
				PHYS_DISPATCH,
				jacobiPass(this.shaderContext, pressTexture.A, pressTexture.B),
			),

			jacobiPassBACompute: inBoundsRun(
				"jacobiBACompute",
				phyGridRes,
				PHYS_DISPATCH,
				jacobiPass(this.shaderContext, pressTexture.B, pressTexture.A),
			),

			projectCompute: inBoundsRun("Project", phyGridRes, PHYS_DISPATCH, projectPass(this.shaderContext)),

			advectDyeCompute: inBoundsRun("Advect Dye", dyeGridRes, DYE_DISPATCH, advectDyePass(this.shaderContext)),

			objectsPassCompute: this.objectsManager
				.computeNodePerVertex(emitObjectPassFragment(this.shaderContext))
				.setName("emit Ojects"),

			emitObjectsVelocityAndDyePass: this.objectsManager
				.computeNodePerVertex(emitObjectsVelocityAndDyePassFragment(this.shaderContext))
				.setName("emitVelocityAndDye"),
		};
		//--------------------------------------------------------------------------------------------------------------------------

		// 2. Define the TSL function to take the ray position as an argument
		// In TSL, fn() arguments are passed as an array to the callback
		const calculateScattering = Fn(([posRay]: [Node<"vec3">]) => {
			const { density, temperature, colorMass, bboxPosition, uvw } = this.shaderContext.sampleVolumeAt(posRay);

			//const crispDensity = smoothstep(0.05, 0.35, density);
			const crispDensity = pow(density, float(1.5));

			// 1. Normalize temperature (0.0 to 1.0)
			// Adjust 6.0 to match your emission temperature range
			const t = temperature;

			// 3. Exponential Radiance Boost (Stefan-Boltzmann law style T^3)
			// Keeps smoke cool while letting hot fire core burst with intense radiance
			//const radiance = t.pow(3.0).mul(15.0).add(1.0);
			const radiance = t.pow(3.0).mul(this.uRadianceMultiplier).add(1.0);

			// 4. Smart Self-Absorption
			// Apply heavy shadow absorption ONLY to cool smoke (low t).
			// Let hot fire (high t) pass through unabsorbed so dense cores stay bright!
			const uShadowAbsorption = this.uShadowAbsorption;
			const selfAbsorption = crispDensity.mul(uShadowAbsorption).negate().exp();
			const fireAbsorption = mix(float(1.0), selfAbsorption, smoothstep(0.2, 0.0, t));

			// 5. Final Combined Output
			const finalTemperature = t.div(this.uTemperatureAtMaxColor);

			//
			// now tint the thing...div(this.uTemperatureAtMaxColor)
			//
			const palette = this.uTemperatureColors;
			const temp0Color = palette.element(0);
			const temp1Color = palette.element(1);
			const temp2Color = palette.element(2);
			const temp3Color = palette.element(3);
			const specialColor = palette.element(4);
			const tintMask = mix(color("black"), specialColor, colorMass);

			const colorStops = this.uTemperatureColorStops;
			const temp1Stop = colorStops.element(0);
			const temp2Stop = colorStops.element(1);
			const temp3Stop = colorStops.element(2);

			const fireColor = mix(
				temp0Color,
				mix(
					temp1Color,
					mix(temp2Color, temp3Color, smoothstep(temp3Stop.x, temp3Stop.y, finalTemperature)),
					smoothstep(temp2Stop.x, temp2Stop.y, finalTemperature),
				),
				smoothstep(temp1Stop.x, temp1Stop.y, finalTemperature),
			);

			const normalColor = fireColor.mul(radiance).mul(crispDensity).mul(fireAbsorption);

			const outColor = normalColor.toVar();

			If(colorMass.greaterThan(0.1), () => {
				outColor.assign(vec3(normalColor.length()).mul(specialColor));
			});

			If(this.uDebugMode.equal(1), () => {
				outColor.assign(vec3(density));
			});
			If(this.uDebugMode.equal(2), () => {
				outColor.assign(vec3(finalTemperature));
			});
			If(this.uDebugMode.equal(3), () => {
				outColor.assign(abs(this.shaderContext.texture.vel.A.sample(uvw).xyz).div(5.0));
			});
			If(this.uDebugMode.equal(4), () => {
				outColor.assign(vec3(0.0));
				this.shaderContext.collisions.drawDebugShapes(outColor, uvw);
			});

			if (this.config.debug.renderColliders) this.shaderContext.collisions.drawDebugShapes(outColor, uvw);

			return outColor;
		});

		const renderNoiseTexture = Fn(([posRay]: [Node<"vec3">]) => {
			const bboxPosition = this.shaderContext.invWorldMatrix.mul(posRay).xyz;
			const uvw = bboxPosition
				//.sub(vec3(0, this.grid.world.size.y / 2, 0))
				.div(this.shaderContext.uVolumeWorldSize)
				.add(0.5)
				.toVar();

			return this.shaderContext.texture.curlNoise.sample(uvw);
		});

		//// interesting pattern...
		// // Scale down the coordinates to make the blobs larger
		// const uv = screenCoordinate.mul(0.05);
		// // Multiply intersecting waves to create organic clusters
		// const blobPattern = sin(uv.x).mul(cos(uv.y));
		// Shift the pattern over time
		//const offsetNode = fract(blobPattern.add(float(frameId).mul(0.02)));

		const volumetricMaterial = new VolumeNodeMaterial({
			transparent: true,
			blending: AdditiveBlending,
			side: DoubleSide, // ADD THIS so you can see it while the camera is inside
			steps: cfg.steps,
			depthWrite: false,
			//
			//offsetNode: bayer16(screenCoordinate).mul(0.42),
			offsetNode: fract(interleavedGradientNoise(screenCoordinate).add(float(frameId).mul(0.118033988749895))),
			//offsetNode: interleavedGradientNoise(screenCoordinate),
			//offsetNode,

			scatteringNode: ({ positionRay }) => {
				// We pass the raymarching position into our custom TSL function
				return this.config.debug.noise ? renderNoiseTexture(positionRay) : calculateScattering(positionRay);
			},
		});

		this.volumetricMaterial = volumetricMaterial;

		const volumetricMesh = new Mesh(
			new BoxGeometry(
				this.shaderContext.grid.world.size.x,
				this.shaderContext.grid.world.size.y,
				this.shaderContext.grid.world.size.z,
			),
			volumetricMaterial,
		);
		volumetricMesh.receiveShadow = true;
		volumetricMesh.layers.disableAll();
		volumetricMesh.layers.enable(cfg.renderLayer);
		volumetricMesh.frustumCulled = false;
		this.add(volumetricMesh);

		this.getRenderPass = (scene, camera, sceneDepthTextureNode) => {
			volumetricMaterial.depthNode = sceneDepthTextureNode.sample(screenUV);

			const volumetricLayer = new Layers();
			volumetricLayer.disableAll();
			volumetricLayer.enable(cfg.renderLayer);

			const volumetricPass = pass(scene, camera, { depthBuffer: false });
			volumetricPass.name = "Volumetric Lighting";
			volumetricPass.setLayers(volumetricLayer);
			volumetricPass.setResolution(0.75);

			const uBlurStrength = uniform(this.blurStrength);
			uBlurStrength.onObjectUpdate(({ object }) => this.blurStrength);

			const blurredVolumetricPass = gaussianBlur(volumetricPass, uBlurStrength, 0.1);

			this.volumetricPass = volumetricPass;

			const uBlurEnabled = uniform(this.config.blurStrength);
			uBlurEnabled.onObjectUpdate(({ object }) => {
				uBlurEnabled.value = this.config.blurStrength;
			});

			//return blurredVolumetricPass;
			return Fn(() => {
				const useBlur = uBlurEnabled.greaterThan(0);
				return select(useBlur, blurredVolumetricPass, volumetricPass);
			})();
		};

		this.getFireFor = (id, options?: EmitterOptions) => {
			return this.objectsManager.getFireFor(id, options); // fallback to empty object if not found
		};

		//--------------------------------------------------------------------------------------------------------------------------------------------

		this.initialize = async () => {
			if (this.update) {
				console.warn("This fire object was already initialized");
				return;
			}

			// Precompute curl noise on the GPU
			await renderer.computeAsync(computeShaders.curlPassCompute);

			let frame = 0;
			let simulationTime = 0;
			let lastTime = performance.now();
			let simAccumulator = 0;
			let simDelta = 0;
			const stepTime = 1 / 30;

			let inv: Matrix4 = this.matrixWorld.clone();

			//@ts-ignore
			this.update = (dt) => {
				this.updateWorldMatrix(true, true);

				dt = Math.min(dt, 1 / 60);

				if (this._curlNoiseUpdated) {
					renderer.compute(computeShaders.curlPassCompute);
					this._curlNoiseUpdated = false;
				}

				if (this.config.debug.noise) return;

				this.shaderContext.worldMatrix.value = this.matrixWorld;

				/*/
				this.shaderContext.invWorldMatrix.value = this.matrixWorld.clone().invert();
				/*/
				inv.copy(this.matrixWorld).invert();
				this.shaderContext.invWorldMatrix.value = inv;
				//*/

				this.objectsManager.update(dt);
				this.collisions.update(dt);

				const currentTime = performance.now();
				const delta = Math.min((currentTime - lastTime) * 0.001, 1 / 30);
				lastTime = currentTime;

				if (this.simulate && this.simulationSpeed > 0) {
					simDelta = delta * this.simulationSpeed;
					simAccumulator += simDelta;

					const simStep = stepTime * this.simulationSpeed;
					const maxAccumulator = simStep * 2;

					if (simAccumulator > maxAccumulator) {
						simAccumulator = maxAccumulator;
					}

					this.shaderContext.uDt.value = simStep;

					// // bake colliders into sdf texture
					renderer.compute(computeShaders.bakeColliders);

					while (simAccumulator >= simStep) {
						simulationTime += simStep;

						this.shaderContext.uTime.value = simulationTime;

						renderer.compute(computeShaders.vorticityPass);

						renderer.compute(computeShaders.advectPassCompute); // read vel.A(RGB) & dye.A(RGB) & curlNoise(RGB) --> vel.B(RGB)

						renderer.compute(computeShaders.divPassCompute); // read vel.B(RGB) -> divergence(R)

						for (let i = 0; i < cfg.pressureIterations; i++) {
							renderer.compute(
								i % 2 === 0
									? computeShaders.jacobiPassABCompute // read pressureA(R) + divergence(R) -> write pressureB(R)
									: computeShaders.jacobiPassBACompute, // read pressureB(R) + divergence(R) -> write pressureA(R)
							);
						}

						renderer.compute(computeShaders.projectCompute); // read vel.B(RGB) + pressureA(R) -> vel.A(RGB)
						renderer.compute(computeShaders.advectDyeCompute); // read: vel.A(RGB) + dye.A(RGBA) -> dye.B(RGBA)
						renderer.compute(computeShaders.objectsPassCompute); // read: dye.A(RGBA) -> dye.B(RGBA)

						this.shaderContext.texture.dye.swap();

						simAccumulator -= simStep;
					}
				}
			};
		};
	}

	get vorticityConfinementStrength() {
		return this.shaderContext.uVorticityConfinementStrength.value;
	}

	set vorticityConfinementStrength(value: number) {
		this.shaderContext.uVorticityConfinementStrength.value = value;
	}

	get temperature() {
		return this.shaderContext.uEmitTemperature.value;
	}

	set temperature(value: number) {
		this.shaderContext.uEmitTemperature.value = value;
	}

	get fireDensity() {
		return this.shaderContext.uEmitDensity.value;
	}

	set fireDensity(value: number) {
		this.shaderContext.uEmitDensity.value = value;
	}

	get turbulenceFrecuency() {
		return this.shaderContext.uTurbFrequency.value;
	}

	set turbulenceFrecuency(value: number) {
		this.shaderContext.uTurbFrequency.value = value;
		this._curlNoiseUpdated = true;
	}

	get turbulenceDecay() {
		return this.shaderContext.uTurbulenceDecay.value;
	}

	set turbulenceDecay(value: number) {
		this.shaderContext.uTurbulenceDecay.value = value;
	}

	get turbulence() {
		return this.shaderContext.uTurbulence.value;
	}

	set turbulence(value: number) {
		this.shaderContext.uTurbulence.value = value;
		this._curlNoiseUpdated = true;
	}

	get densityDissipation() {
		return this.shaderContext.uDissipation.value;
	}

	set densityDissipation(value: number) {
		this.shaderContext.uDissipation.value = value;
	}

	get cooling() {
		return this.shaderContext.uCooling.value;
	}

	set cooling(value: number) {
		this.shaderContext.uCooling.value = value;
	}

	get velocityDamping() {
		return this.shaderContext.uVelDamping.value;
	}

	set velocityDamping(value: number) {
		this.shaderContext.uVelDamping.value = value;
	}

	get buoyancy() {
		return this.shaderContext.uBuoyancy.value;
	}

	set buoyancy(value: number) {
		this.shaderContext.uBuoyancy.value = value;
	}

	get smokeWeight() {
		return this.shaderContext.uWeight.value;
	}

	set smokeWeight(value: number) {
		this.shaderContext.uWeight.value = value;
	}

	get pressureIterations() {
		return this.config.pressureIterations;
	}

	set pressureIterations(value: number) {
		this.config.pressureIterations = value;
	}

	get curlNoiseMultiplier() {
		return this.shaderContext.uCurlNoiseMultiplier.value;
	}

	set curlNoiseMultiplier(value: number) {
		this.shaderContext.uCurlNoiseMultiplier.value = value;
		this._curlNoiseUpdated = true;
	}

	get keyLightPosition(): Vector3 {
		return this._keyLightPosition;
	}

	set keyLightPosition(value: Vector3) {
		this._keyLightPosition.copy(value);
		this.uKeyLightPosition.value = this._keyLightPosition;
	}

	get blurStrength() {
		return this.config.blurStrength;
	}

	set blurStrength(value: number) {
		this.config.blurStrength = value;
	}

	get temperatureAtMaxColor() {
		return this.config.colors.temperatureAtMaxColor;
	}

	set temperatureAtMaxColor(value: number) {
		this.config.colors.temperatureAtMaxColor = value;
		this.uTemperatureAtMaxColor.value = value;
	}

	get vertexEmissionRadius() {
		return this.config.vertexEmissionWorldRadius;
	}

	set vertexEmissionRadius(value: number) {
		this.config.vertexEmissionWorldRadius = value;

		const k = new Vector3(13, 13, 13); // new Vector3(value, value, value).divide(this.shaderContext.dyeVoxelSizeWorld).ceil(); //Math.ceil(value / this.shaderContext.dyeVoxelSizeWorld);
		//const k = new Vector3(value, value, value).divide(this.shaderContext.dyeVoxelSizeWorld).ceil(); //Math.ceil(value / this.shaderContext.dyeVoxelSizeWorld);
		const radiusSq = k.lengthSq();
		const offsets: [number, number, number, number][] = [];

		// console.log(k);
		// return;

		for (let dx = -k.x; dx <= k.x; dx++)
			for (let dy = -k.y; dy <= k.y; dy++)
				for (let dz = -k.z; dz <= k.z; dz++) {
					const _radiussq = dx * dx + dy * dy + dz * dz;
					offsets.push([dx, dy, dz, 1.0 - _radiussq / radiusSq]);
				}

		this.shaderContext.uEmitRadiusWorld.value = value; // not used
		this.shaderContext.uVertexSplatBrushOffsetsCount.value = offsets.length;
		this.shaderContext.uVertexSplatBrushOffsets.array = offsets.map(([x, y, z, w]) => new Vector4(x, y, z, w));
	}

	get friction() {
		return this.collisions.uFriction.value;
	}

	set friction(value: number) {
		this.collisions.uFriction.value = value;
	}

	get angularVelocityMultiplier() {
		return this.collisions.config.angularVelocityMultiplier;
	}

	set angularVelocityMultiplier(value: number) {
		this.collisions.config.angularVelocityMultiplier = value;
	}

	get collisionMargin() {
		return this.collisions.collisionMargin;
	}
	set collisionMargin(v: number) {
		this.collisions.collisionMargin = v;
	}

	get colorRadianceMultiplier() {
		return this.uRadianceMultiplier.value;
	}

	set colorRadianceMultiplier(v: number) {
		this.uRadianceMultiplier.value = v;
	}

	getColor(type: FireColorType) {
		switch (type) {
			case "base":
				return this.config.colors.baseColor;
			case "tier1":
				return this.config.colors.byTemperature.tier1.color;
			case "tier2":
				return this.config.colors.byTemperature.tier2.color;
			case "tier3":
				return this.config.colors.byTemperature.tier3.color;
			case "special":
				return this.config.colors.specialColor;
		}
	}

	setColor(type: FireColorType, value: Color) {
		const colors = this.uTemperatureColors.array as unknown as Color[];

		switch (type) {
			case "base":
				this.config.colors.baseColor = value;
				colors[0] = value;
				break;
			case "tier1":
				this.config.colors.byTemperature.tier1.color = value;
				colors[1] = value;
				break;
			case "tier2":
				this.config.colors.byTemperature.tier2.color = value;
				colors[2] = value;
				break;
			case "tier3":
				this.config.colors.byTemperature.tier3.color = value;
				colors[3] = value;
				break;
			case "special":
				this.config.colors.specialColor = value;
				colors[4] = value;
				break;
		}
	}

	getColorStop(tier: FireColorStopType) {
		switch (tier) {
			case "tier1":
				return this.config.colors.byTemperature.tier1.transition;
			case "tier2":
				return this.config.colors.byTemperature.tier2.transition;
			case "tier3":
				return this.config.colors.byTemperature.tier3.transition;
		}
	}

	setColorStop(tier: FireColorStopType, transition: { from: number; to: number }) {
		const stops = this.uTemperatureColorStops.array as Vector2[];
		const palette = this.config.colors.byTemperature;

		switch (tier) {
			case "tier1":
				palette.tier1.transition = transition;
				stops[0].x = transition.from;
				stops[0].y = transition.to;
				break;
			case "tier2":
				palette.tier2.transition = transition;
				stops[1].x = transition.from;
				stops[1].y = transition.to;
				break;
			case "tier3":
				palette.tier3.transition = transition;
				stops[2].x = transition.from;
				stops[2].y = transition.to;
				break;
		}
	}

	// private _blurIterations = 1;
	// get blurIterations() {
	// 	return this._blurIterations;
	// }
	// set blurIterations(value: number) {
	// 	this._blurIterations = value;
	// }

	/**
	 * Get the current settings of the fire simulation as a snapshot
	 */
	getSettingsSnapshot() {
		return {
			resolution: this.volumetricPass!.getResolution(),
			vorticityConfinementStrength: this.vorticityConfinementStrength,
			vertexEmissionRadius: this.vertexEmissionRadius,
			blurStrength: this.blurStrength,
			steps: this.config.steps,
			simulationSpeed: this.simulationSpeed,
			temperature: this.temperature,
			fireDensity: this.fireDensity,
			turbulenceFrecuency: this.turbulenceFrecuency,
			turbulenceDecay: this.turbulenceDecay,
			turbulence: this.turbulence,
			friction: this.friction,
			angularVelocityMultiplier: this.angularVelocityMultiplier,
			collisionMargin: this.collisionMargin,
			densityDissipation: this.densityDissipation,
			cooling: this.cooling,
			velocityDamping: this.velocityDamping,
			buoyancy: this.buoyancy,
			smokeWeight: this.smokeWeight,
			pressureIterations: this.pressureIterations,
			curlNoiseMultiplier: this.curlNoiseMultiplier,
			colorBase: this.getColor("base").toJSON(),
			colorTier1: this.getColor("tier1").toJSON(),
			colorTier2: this.getColor("tier2").toJSON(),
			colorTier3: this.getColor("tier3").toJSON(),
			colorSpecial: this.getColor("special").toJSON(),

			colorRadianceMultiplier: this.colorRadianceMultiplier,

			tier1Stop: this.getColorStop("tier1"),
			tier2Stop: this.getColorStop("tier2"),
			tier3Stop: this.getColorStop("tier3"),

			temperatureAtMaxColor: this.temperatureAtMaxColor,

			timestamp: new Date().toISOString(),
		};
	}

	/**
	 * Apply a settings snapshot to the fire simulation
	 */
	applySettingsSnapshot(snapshot: ReturnType<typeof this.getSettingsSnapshot>) {
		this.vorticityConfinementStrength = snapshot.vorticityConfinementStrength;
		this.volumetricPass!.setResolution(snapshot.resolution);
		this.vertexEmissionRadius = snapshot.vertexEmissionRadius;
		this.config.steps = snapshot.steps;
		this.volumetricMaterial.steps = snapshot.steps;
		this.simulationSpeed = snapshot.simulationSpeed;
		this.temperature = snapshot.temperature;
		this.fireDensity = snapshot.fireDensity;
		this.turbulenceFrecuency = snapshot.turbulenceFrecuency;
		this.turbulenceDecay = snapshot.turbulenceDecay;
		this.turbulence = snapshot.turbulence;
		this.collisionMargin = snapshot.collisionMargin;
		this.friction = snapshot.friction;
		this.densityDissipation = snapshot.densityDissipation;
		this.cooling = snapshot.cooling;
		this.velocityDamping = snapshot.velocityDamping;
		this.buoyancy = snapshot.buoyancy;
		this.smokeWeight = snapshot.smokeWeight;
		this.pressureIterations = snapshot.pressureIterations;
		this.curlNoiseMultiplier = snapshot.curlNoiseMultiplier;
		this.blurStrength = snapshot.blurStrength;
		this.angularVelocityMultiplier = snapshot.angularVelocityMultiplier;
		this.setColor("base", new Color().setHex(snapshot.colorBase));
		this.setColor("tier1", new Color().setHex(snapshot.colorTier1));
		this.setColor("tier2", new Color().setHex(snapshot.colorTier2));
		this.setColor("tier3", new Color().setHex(snapshot.colorTier3));
		this.setColor("special", new Color().setHex(snapshot.colorSpecial));
		this.setColorStop("tier1", snapshot.tier1Stop);
		this.setColorStop("tier2", snapshot.tier2Stop);
		this.setColorStop("tier3", snapshot.tier3Stop);
		this.colorRadianceMultiplier = snapshot.colorRadianceMultiplier;

		this.temperatureAtMaxColor = snapshot.temperatureAtMaxColor;
	}

	setDebugMode(mode: VolumetricFluidFireDebugMode) {
		this.uDebugMode.value = DEBUG_MODE_IDS[mode] ?? DEBUG_MODE_IDS.final;
	}

	/**
	 * Use the object as a proxy to control a collider in the simulation.
	 *
	 * @param obj This object will be used to position and transform the collider in the simulation. You can movie it around and the simulation will sync.
	 * @param colliderType
	 */
	makeObjectCollidable(obj: Object3D, colliderType: BasicShapes) {
		this.collisions.makeObjectCollidable(obj, colliderType);
	}
}
