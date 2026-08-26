import { Matrix4, Node, Object3D, Quaternion, UniformNode, Vector3 } from "three/webgpu";
import { DataTexture, FluidFireShaderContext, VoxelGrid } from "../FluidFireShaderContext";
import { cross, dot, float, If, Loop, mat4, uint, uniform, uniformArray, vec3, vec4, normalize, mix } from "three/tsl";
import { sdfSampler, SDFSampler } from "./sdfSampler";
import { BasicShapes, SDFShape, SDFShapeContext } from "./shape/SDFShape";
import { SDFBox } from "./shape/SDFBox";
import { SDFEllipsoid } from "./shape/SDFEllipsoid";

export type CollisionHandlerConfig = {
	disabled?: boolean;

	/**
	 * how sticky the surface of a collider is...
	 */
	friction: number;

	/**
	 * a multiplier of the angular velocity of the collider. Sometimes increasing this visually produces a more aestetic result...
	 */
	angularVelocityMultiplier: number;

	/**
	 * will give some air between the surface of the collider and the fire/smoke
	 */
	collisionMargin: number;

	/**
	 * max number of collision shapes. If you need more, increase this value.
	 */
	maxCollisionShapes: {
		total: number;
		boxes: number;
		ellipsoids: number;
	};

	/**
	 * custom SDF collision shapes. If their names coincides with the default ones, they will replace the default ones.
	 */
	sdfShapes: SDFShape[];
};

type MatrixBinding = {
	index: number;
	object: Object3D | undefined;
	initialized: boolean;
	previousRotation: Quaternion;
};

const v = new Vector3();
const q = new Quaternion();
const deltaQ = new Quaternion();
const invertedQ = new Quaternion();
const UNIFORM_SCALE = new Vector3(1, 1, 1);
const tempScale = new Vector3();

/**
 * This class is in charge with everything related to correcting the flow of the fire to respect the colliders.
 * This is done by sampling the SDF of the scene at each time step.
 */
export class CollisionHandler {
	/**
	 * Uniforms used to store data relative to the colliders such as their position, velocity, inverse matrix, etc...
	 */
	private context: SDFShapeContext;

	private uCollisionMargin: UniformNode<"float", number>;
	get collisionMargin() {
		return this.uCollisionMargin.value;
	}
	set collisionMargin(v: number) {
		this.uCollisionMargin.value = v;
	}

	// private uBoxes: UniformArrayNode<"uint">; // [ dataIndex]
	// private uBoxCount: UniformNode<"uint", number>;

	/**
	 * Base Surface friction coefficient of surfaces
	 */
	readonly uFriction = uniform(0.8, "float");

	/**
	 * Inverse matrices
	 */
	private readonly dataBindings: MatrixBinding[] = [];
	readonly config: CollisionHandlerConfig;

	private obj2Collider = new WeakMap<Object3D, SDFShape>();
	private removeCollider: Map<Object3D, VoidFunction> = new Map();

	/**
	 * scans all the colliding sdf shapes and returns the distance
	 */
	private mapSDF: SDFSampler;

	private bakeTexture!: DataTexture; // [ vec3(normal), distance(float) ]
	private bakeVelocityTexture!: DataTexture; // [ vec3(vx,vy,vz), --- ]

	constructor(config: Partial<CollisionHandlerConfig> = {}) {
		const customShapes = config.sdfShapes ?? [];

		delete config.sdfShapes;

		const cfg: CollisionHandlerConfig = {
			friction: 0.8,
			collisionMargin: 0,
			angularVelocityMultiplier: 1,

			maxCollisionShapes: {
				total: 64,
				boxes: 12,
				ellipsoids: 12,
			},
			sdfShapes: [],
			...config,
		};

		cfg.sdfShapes = [
			new SDFBox(cfg.maxCollisionShapes.boxes, "box"),
			new SDFEllipsoid(cfg.maxCollisionShapes.boxes, "ellipsoid"),
		];

		//
		// allow user to override the default shapes...
		//
		customShapes.forEach((custom) => {
			const existingIndex = cfg.sdfShapes.findIndex((shape) => shape.name == custom.name);
			if (existingIndex > -1) {
				cfg.sdfShapes[existingIndex] = custom;
			} else {
				cfg.sdfShapes.push(custom);
			}
		});

		this.config = cfg;

		this.uCollisionMargin = uniform(cfg.collisionMargin);
		this.uFriction.value = cfg.friction;

		const totalObjects = cfg.sdfShapes.reduce((total, shape) => total + shape.maxCount, 0);

		if (totalObjects > cfg.maxCollisionShapes.total) {
			throw new Error(
				`Too many collision shapes, max is set at ${cfg.maxCollisionShapes.total} but ${totalObjects} shapes are defined.`,
			);
		}

		// this.uBoxes = uniformArray(
		// 	Array.from({ length: cfg.maxBoxes }, () => new Vector2()),
		// 	"uvec2",
		// );
		//this.uBoxCount = uniform(cfg.maxBoxes, "uint");

		this.context = {
			//
			// create buffer data for all colliders...
			//
			uHalfExtents: uniformArray(
				Array.from({ length: totalObjects }, () => new Vector3()),
				"vec3",
			),

			uInverseMatrices: uniformArray(
				Array.from({ length: totalObjects }, () => new Matrix4()),
				"mat4",
			),

			uWorldPositions: uniformArray(
				Array.from({ length: totalObjects }, () => new Vector3()),
				"vec3",
			),

			uVelocities: uniformArray(
				Array.from({ length: totalObjects }, () => new Vector3()),
				"vec3",
			),

			uAngularVelocities: uniformArray(
				Array.from({ length: totalObjects }, () => new Vector3()),
				"vec3",
			),

			uIsActive: uniformArray(
				Array.from({ length: totalObjects }, () => false),
				"uint",
			),
		};

		this.dataBindings = Array.from({ length: totalObjects }, (_, i) => ({
			index: i,
			object: undefined,
			previousRotation: new Quaternion(),
			initialized: false,
		}));

		this.mapSDF = sdfSampler((worldPos, outVelocity, outNormal) => {
			const closestVelocity = vec3(0.0).toVar();
			const closestNormal = vec3(0.0).toVar();

			// We will store the matrix of whoever "wins" the distance check
			const winningInvMatrix = mat4().toVar();
			const winningHalfExtents = vec3().toVar();
			const foundCollider = float(0.0).toVar(); // Boolean flag
			const shapeType = uint(0).toVar();
			const margin = this.uCollisionMargin; //float
			const minDistance = float(999.9).toVar();

			this.config.sdfShapes.forEach((shape) => {
				Loop({ start: 0, end: shape.maxCount }, ({ i }) => {
					const shapeDataIndex = shape.uDataIndex.element(i);
					const realDataIndex = shapeDataIndex.sub(1).setName("realIndex"); //<--- because we use the 0 as sentinel value for "not used"

					const isActive = this.context.uIsActive.element(realDataIndex).greaterThan(0.0);

					If(shapeDataIndex.greaterThan(0).and(isActive), () => {
						const invMatrix = this.context.uInverseMatrices.element(realDataIndex);
						const hExtents = this.context.uHalfExtents.element(realDataIndex);
						const sdf = shape.sdf(invMatrix.mul(vec4(worldPos, 1.0)).xyz, hExtents).mul(margin.oneMinus());

						If(sdf.lessThan(minDistance), () => {
							minDistance.assign(sdf);

							winningInvMatrix.assign(invMatrix);
							winningHalfExtents.assign(hExtents);
							foundCollider.assign(1.0);

							const center = this.context.uWorldPositions.element(realDataIndex);
							const linVel = this.context.uVelocities.element(realDataIndex);
							const angVel = this.context.uAngularVelocities.element(realDataIndex);
							const rotVel = cross(angVel, worldPos.sub(center));

							closestVelocity.assign(linVel.add(rotVel));

							shapeType.assign(uint(shape.shapeTypeIndex)); //default
						});
					});
				});
			});

			If(foundCollider.greaterThan(0.0).and(minDistance.lessThan(margin)), () => {
				const e = float(0.1);
				const eX = vec3(e, 0.0, 0.0);
				const eY = vec3(0.0, e, 0.0);
				const eZ = vec3(0.0, 0.0, e);

				const pRight = winningInvMatrix.mul(vec4(worldPos.add(eX), 1.0)).xyz;
				const pLeft = winningInvMatrix.mul(vec4(worldPos.sub(eX), 1.0)).xyz;
				const pUp = winningInvMatrix.mul(vec4(worldPos.add(eY), 1.0)).xyz;
				const pDown = winningInvMatrix.mul(vec4(worldPos.sub(eY), 1.0)).xyz;
				const pForward = winningInvMatrix.mul(vec4(worldPos.add(eZ), 1.0)).xyz;
				const pBack = winningInvMatrix.mul(vec4(worldPos.sub(eZ), 1.0)).xyz;

				const dx = float(0).toVar();
				const dy = float(0).toVar();
				const dz = float(0).toVar();
				const extents = winningHalfExtents;

				this.config.sdfShapes.forEach((shape) => {
					If(shapeType.equal(uint(shape.shapeTypeIndex)), () => {
						dx.assign(shape.sdf(pRight, extents).sub(shape.sdf(pLeft, extents)));
						dy.assign(shape.sdf(pUp, extents).sub(shape.sdf(pDown, extents)));
						dz.assign(shape.sdf(pForward, extents).sub(shape.sdf(pBack, extents)));
					});
				});

				closestNormal.assign(normalize(vec3(dx, dy, dz)));
			});

			outVelocity.assign(closestVelocity);
			outNormal.assign(closestNormal);

			return minDistance;
		});
	}

	/**
	 * Use the object as a proxy to control a collider in the simulation.
	 *
	 * @param obj This object will be used to position and transform the collider in the simulation. You can movie it around and the simulation will sync.
	 * @param colliderType
	 */
	makeObjectCollidable(obj: Object3D, type: BasicShapes, colliderConfig: any = {}) {
		const shape = this.config.sdfShapes.find((shapeDef) => shapeDef.name == type);
		if (!shape) {
			throw new Error(
				`Collider type "${type}" not found on: ${this.config.sdfShapes.map((shape) => shape.name)}`,
			);
		}

		const dataIndex = this.bindMatrix(obj) + 1;

		shape.createColliderOn(obj, dataIndex, colliderConfig);

		const removeFn = () => {
			shape.destroyColliderFrom(obj, dataIndex, colliderConfig);
			this.unbindMatrix(obj);
			this.removeCollider.delete(obj);
			this.obj2Collider.delete(obj);
		};

		this.obj2Collider.set(obj, shape);
		this.removeCollider.set(obj, removeFn);
	}

	/**
	 * Finds an "empty data slot" to assotiate that index with the data that this collider will use.
	 * @param target
	 * @returns
	 */
	private bindMatrix(target: Object3D): number {
		const freeBinding = this.dataBindings.find((b) => !b.object);
		if (!freeBinding) {
			throw new RangeError(`Too many colliders, only ${this.config.maxCollisionShapes} supported.`);
		}

		freeBinding.object = target;
		freeBinding.initialized = false;
		this.context.uIsActive.array[freeBinding.index] = 1;
		return freeBinding.index;
	}

	private unbindMatrix(from: Object3D) {
		for (const binding of this.dataBindings) {
			if (binding.object === from) {
				binding.object = undefined;
				this.context.uIsActive.array[binding.index] = 0;
			}
		}
	}

	// private createBoxCollider(obj: Object3D, halfExtents: Vector3Like = { x: 0.5, y: 0.5, z: 0.5 }) {
	// 	const boxes = this.uBoxes.array as Vector2[];
	// 	const freeBoxIndex = boxes.findIndex((slot) => slot.x === 0);

	// 	if (freeBoxIndex === -1) {
	// 		throw new RangeError(`Too many colliders of type box, only ${this.config.maxBoxes} supported`);
	// 	}

	// 	const matrixIndex = this.bindMatrix(obj);

	// 	boxes[freeBoxIndex].set(1, matrixIndex);

	// 	const removeFn = () => {
	// 		boxes[freeBoxIndex].set(0, 0);
	// 		this.unbindMatrix(obj);
	// 		this.removeCollider.delete(obj);
	// 	};

	// 	this.removeCollider.set(obj, removeFn);
	// }

	clearObjectAsCollidable(obj: Object3D) {
		const removeFn = this.removeCollider.get(obj);
		if (removeFn) {
			this.removeCollider.delete(obj);
			removeFn();
		}
	}

	update(delta: number) {
		if (this.config.disabled) return;

		//
		// for each collider, syn the inverse matrix, position, velocity and angular velocity uniforms
		//
		for (const binding of this.dataBindings) {
			if (binding.object) {
				const dataIndex = binding.index;

				binding.object.updateWorldMatrix(true, false);
				binding.object.getWorldPosition(v);
				binding.object.getWorldQuaternion(q);

				binding.object.getWorldScale(tempScale);

				// inverse matrix
				const matrix = this.context.uInverseMatrices.array[dataIndex] as Matrix4;
				//matrix.copy(binding.object.matrixWorld).invert();
				matrix.compose(v, q, UNIFORM_SCALE).invert();

				const worldPos = this.context.uWorldPositions.array[dataIndex] as Vector3;
				const velocity = this.context.uVelocities.array[dataIndex] as Vector3;
				const angularVel = this.context.uAngularVelocities.array[dataIndex] as Vector3;
				const halfExtents = this.context.uHalfExtents.array[dataIndex] as Vector3;

				if (binding.initialized) {
					velocity.subVectors(v, worldPos).divideScalar(delta);

					// -- Prevent the massive rotation spike ---
					// If quaternions are on opposite hemispheres, flip one to take the shortest path
					if (q.dot(binding.previousRotation) < 0) {
						q.set(-q.x, -q.y, -q.z, -q.w);
					}
					// -----------------------------------------------

					invertedQ.copy(binding.previousRotation).invert();
					deltaQ.copy(q).multiply(invertedQ);

					// Convert quaternion difference to axis-angle
					const angle = 2 * Math.acos(Math.max(-1, Math.min(1, deltaQ.w)));
					const s = Math.sqrt(1 - deltaQ.w * deltaQ.w);

					if (s > 0.001) {
						// axis * (angle / dt)
						angularVel
							.set(deltaQ.x, deltaQ.y, deltaQ.z)
							.divideScalar(s)
							.multiplyScalar(angle / delta)
							.multiplyScalar(this.config.angularVelocityMultiplier);
					} else {
						angularVel.set(0, 0, 0);
					}
				} else {
					velocity.set(0, 0, 0);
					angularVel.set(0, 0, 0);
					binding.initialized = true;
				}

				worldPos.copy(v);
				halfExtents.copy(tempScale);
				binding.previousRotation.copy(q);
				this.obj2Collider.get(binding.object)?.update(binding.object, dataIndex, delta);
			}
		}
	}

	drawDebugShapes(out: Node<"vec3">, uvw: Node<"vec3">) {
		// Transform voxel into the box's local space

		//const uvw = invWorldMatrix.mul(vec4(samplePoint, 1.0)).xyz.div( this.config.);
		const d = this.distanceAtPoint(uvw);
		If(d.lessThan(0), () => {
			out.assign(vec3(111, 0, 0));
		});
	}

	distanceAtPoint(uvw: Node<"vec3">) {
		return this.bakeTexture.sample(uvw).w;
	}

	normalAtPoint(uvw: Node<"vec3">) {
		return this.bakeTexture.sample(uvw).xyz;
	}

	/**
	 * use this texture to store baked colliders
	 */
	setBakeTexture(sdfTexture: DataTexture, sdfVelocityTexture: DataTexture) {
		this.bakeTexture = sdfTexture;
		this.bakeVelocityTexture = sdfVelocityTexture;
	}

	/**
	 * This is the compute that will bake the colliders into the `sdfTexture` you set on `setBakeTexture`.
	 */
	bakeCollidersPass(context: FluidFireShaderContext) {
		return () => {
			const coord = context.grid.phy.coord;
			const uvw = context.grid.phy.uvw;

			// 1. Get world pos
			const localPos = uvw.sub(0.5).mul(context.uVolumeWorldSize);
			const worldPos = context.worldMatrix.mul(vec4(localPos, 1.0)).xyz;

			const closestNormal = vec3(0.0).toVar();
			const closestVelocity = vec3(0.0).toVar();

			const minDistance = this.mapSDF(worldPos, closestVelocity, closestNormal);

			// Write Normal and Distance to your first texture
			this.bakeTexture.write(coord, vec4(closestNormal, minDistance));
			// Write Surface Velocity to your NEW texture
			this.bakeVelocityTexture.write(coord, vec4(closestVelocity, 0.0));
		};
	}

	makeVelocityAvoidColliders(vel: Node<"vec3">, uvw: Node<"vec3">) {
		if (this.config.disabled) return;

		// const minDistance = this.mapSDF(worldPosition);

		// If(minDistance.lessThanEqual(1), () => {
		// 	const normal = calcSdfNormal(worldPosition, this.mapSDF);
		// 	const velDotN = dot(vel, normal);
		// 	If(velDotN.lessThan(0.0), () => {
		// 		vel.subAssign(normal.mul(velDotN).mul(4));
		// 	});
		// });
		// Look up data instantly from the texture
		const sdfData = this.bakeTexture.sample(uvw);
		const minDistance = sdfData.w;
		const normal = sdfData.xyz;
		const objVel = this.bakeVelocityTexture.sample(uvw).xyz;

		const margin = float(0.1); // ~ 1.5x voxel size

		If(minDistance.lessThanEqual(margin), () => {
			// 1. EJECTION (Fluid is trapped inside)
			If(minDistance.lessThan(0.0), () => {
				const ejectionSpeed = minDistance.abs().mul(20.0);
				// Push it out, AND force it to match object velocity
				vel.assign(objVel.add(normal.mul(ejectionSpeed)));
			}).Else(() => {
				// 2. FRICTION / BOUNDARY LAYER (Fluid is near surface)
				// Calculate how close we are to the surface (0.0 at margin, 1.0 at surface)
				const proximity = margin.sub(minDistance).div(margin);

				// Friction coefficient (0.0 = frictionless slip, 1.0 = sticky like molasses)
				// Tune this! ~0.5 to 0.8 is great for generating vortices.
				const friction = this.uFriction;

				// Blend fluid velocity towards the object's velocity based on proximity
				const dragFactor = proximity.mul(friction);
				vel.assign(mix(vel, objVel, dragFactor));

				// 3. PREVENT PENETRATION (Calculate Relative Velocity)
				// After dragging, make sure the fluid isn't still pushing INTO the wall
				const relativeVel = vel.sub(objVel);
				const relDotN = dot(relativeVel, normal);

				If(relDotN.lessThan(0.0), () => {
					// Remove the inward momentum relative to the moving object
					vel.subAssign(normal.mul(relDotN));
				});
			});
		});
	}

	/**
	 * Call this when you want to sample a voxel from the perspective of `uvw` to know if that sampled point landed on a solid object and if so what normal direction does it have
	 * relative to us...
	 *
	 * @param grid the size of the 3d texture we are sampling
	 * @param worldSize the size of the simulation space in world units
	 * @param worldMatrix the world matrix to use to convert world units to the local space of the simulation box
	 * @param fromWorldPos world position from where we are sampling
	 * @param uvw uvw coordinate of the voxel doing the sampling
	 * @param texelOffset offset relative to uvw from which to do the actual sampling
	 * @param calculateNormal if you want to get the normal vector of the SDF surface
	 * @param onHit called if there's a hit
	 * @param onMiss called if nothing was hit
	 */
	checkCollisionAt(
		grid: VoxelGrid,
		worldSize: Node<"vec3">,
		worldMatrix: Node<"mat4">,
		voxelLocalPos: Node<"vec3">,
		uvw: Node<"vec3">,
		texelOffset: Node<"vec3">,
		calculateNormal: boolean,
		onHit: (uvw: Node<"vec3">, hitDist: Node<"float">, normal?: Node<"vec3">) => void,
		onMiss: (uvw: Node<"vec3">) => void,
	) {
		const offset = vec3(grid.texel.x, grid.texel.y, grid.texel.z).mul(texelOffset);
		const otherUVW = uvw.add(offset);

		// 2. Instantly look up the pre-calculated math!
		const sdfData = this.bakeTexture.sample(otherUVW);
		const hitDistance = sdfData.w;
		const normal = sdfData.xyz;

		// 3. Execute logic
		If(hitDistance.lessThanEqual(0.0), () => {
			onHit(otherUVW, hitDistance, normal);
		}).Else(() => {
			onMiss(otherUVW);
		});
	}
}
