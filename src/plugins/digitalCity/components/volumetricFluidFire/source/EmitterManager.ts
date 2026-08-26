import { Fn, If, instanceIndex, int, Loop, Return, storage, vec3, vec4 } from "three/tsl";
import * as THREE from "three/webgpu";

// ---------------------------------------------------------------
// Multi-Object Emitter System
// ---------------------------------------------------------------

export interface EmitterOptions {
	tintFactor?: number;
	emitMultiplier?: number;
}

export type EmitterObjectDef = {
	maxCount: number;
	geometriesInsideOf: THREE.Object3D;
	id: string;
};

interface EmitterData {
	object: THREE.Object3D;
	options: Required<EmitterOptions>;
	id: number;
	prevPosition: THREE.Vector3;
	currentPosition: THREE.Vector3;
	velocity: THREE.Vector3;
	active: boolean; // Flag to indicate if this instance is actively used
}

interface DefPool {
	instances: EmitterData[]; // Pre-allocated instances for this definition
}

export type ComputeNodeHook = (
	vertexPos: THREE.Node<"vec3">,
	worldPos: THREE.Node<"vec3">,
	emitMultiplier: THREE.Node<"float">,
	worldMatrix: THREE.Node<"mat4">,
	objVelData: THREE.Node<"vec4">,
	tintFactor: THREE.Node<"float">,
) => void;

/**
 * This class is in charge of handling the "objects" in a way that they are easily consumed by the compute shaders.
 * Usually you will assosiate some data to some objects, and they will be packed in several data arrays as to be read as fast as possible.
 */
export class EmitterManager {
	readonly maxObjects: number;
	private emitters: EmitterData[] = [];
	private objectMap: WeakMap<THREE.Object3D, EmitterData>;
	private defPools: Map<string, DefPool> = new Map();

	// CPU Arrays
	private matrixData: Float32Array;
	private propData: Float32Array; // (r, g, b, emitMultiplier)
	private velData: Float32Array; // (vx, vy, vz, speed)

	/**
	 * for each vertex for each instance: [ vertexPositionOffset, instanceIndex, 0, 0 ]
	 */
	private instanceInfoData: Uint32Array;

	// Storage Attributes
	public matrixAttr: THREE.StorageBufferAttribute;
	public propAttr: THREE.StorageBufferAttribute;
	public velAttr: THREE.StorageBufferAttribute;
	public instanceInfoAttr: THREE.StorageBufferAttribute; // NEW

	// TSL Storage Nodes
	public matricesStorageNode: THREE.StorageBufferNode<"mat4">;
	public propsStorageNode: THREE.StorageBufferNode<"vec4">;
	public velocitiesStorageNode: THREE.StorageBufferNode<"vec4">;
	public instanceInfoStorageNode: any; // NEW

	public combinedVertexAttr!: THREE.StorageBufferAttribute;
	public verticesStorageNode!: THREE.StorageBufferNode<"vec4">;
	public totalUniqueVertexCount: number;

	private readonly uploadAllThreshold: number;

	readonly totalInstancesVertices: number;

	constructor(emitterBuffer: EmitterObjectDef[]) {
		this.maxObjects = emitterBuffer.reduce((acc, obj) => acc + obj.maxCount, 0);
		this.emitters = [];
		this.objectMap = new WeakMap();

		// CPU Arrays
		this.matrixData = new Float32Array(this.maxObjects * 16);
		this.propData = new Float32Array(this.maxObjects * 4); // (enabled, emitMultiplier, tintFactor, 0)
		this.velData = new Float32Array(this.maxObjects * 4); // (vx, vy, vz, speed)
		//this.instanceInfoData = new Uint32Array(this.maxObjects * 4); // NEW

		const vertexInstanceData: number[] = [];

		// Storage Attributes
		this.matrixAttr = new THREE.StorageBufferAttribute(this.matrixData, 16);
		this.propAttr = new THREE.StorageBufferAttribute(this.propData, 4);
		this.velAttr = new THREE.StorageBufferAttribute(this.velData, 4);

		// TSL Storage Nodes
		this.matricesStorageNode = storage(this.matrixAttr, "mat4", this.maxObjects);
		this.propsStorageNode = storage(this.propAttr, "vec4", this.maxObjects);
		this.velocitiesStorageNode = storage(this.velAttr, "vec4", this.maxObjects).toReadOnly();

		//-------------------------

		/**
		 * This is is used to later find the packed data of each object id. Since their data is packed contiguously in memory, we can find the offset and size
		 * of each object's data in the storage buffer.
		 */
		let globalId = 0;
		let vertexOffset = 0;
		const allVertices: number[] = [];

		for (const def of emitterBuffer) {
			const pool: DefPool = { instances: [] };
			this.defPools.set(def.id, pool);

			// 1. Traverse and extract unique geometries for this definition once
			def.geometriesInsideOf.updateWorldMatrix(true, true);
			const rootInverse = new THREE.Matrix4().copy(def.geometriesInsideOf.matrixWorld).invert();
			const localMatrix = new THREE.Matrix4();
			const basePositions: number[] = [];
			const vec3 = new THREE.Vector3();

			// find all the meshes inside of this object and extract their vertices relative to the object's local space.
			// they are then used to later fill up a buffer where the fire will be emitted from for this particular object.
			def.geometriesInsideOf.traverse((child: THREE.Object3D) => {
				if ((child as THREE.Mesh).isMesh) {
					const mesh = child as THREE.Mesh;
					const geometry = mesh.geometry;
					if (!geometry || !geometry.attributes.position) return;

					localMatrix.multiplyMatrices(rootInverse, mesh.matrixWorld);
					const posAttr = geometry.attributes.position;

					for (let i = 0; i < posAttr.count; i++) {
						vec3.fromBufferAttribute(posAttr, i);
						vec3.applyMatrix4(localMatrix);
						basePositions.push(vec3.x, vec3.y, vec3.z);
					}
				}
			});

			const defVertexCount = basePositions.length / 3;

			// 2. Append to master vertex array (padded to vec4 for GPU alignment)
			for (let v = 0; v < basePositions.length; v += 3) {
				allVertices.push(basePositions[v], basePositions[v + 1], basePositions[v + 2], 0);
			}

			// 3. Create instances and assign them the offset/count data
			for (let i = 0; i < def.maxCount; i++) {
				const id = globalId++;
				const proxyObj = new THREE.Object3D();
				proxyObj.name = `${def.id}_proxy_${i}`;

				// Link this instance to the shared vertex block in the buffer

				//
				// for each vertex of the base mesh that this instance will use...
				// we do this because on a compute shader it will be faster to run over all vertices to
				// take advantage of better cache coherency and paralalelism
				//
				for (let j = 0; j < defVertexCount; j++) {
					vertexInstanceData.push(vertexOffset + j, id, 0, 0);
				}

				const emitterData: EmitterData = {
					object: proxyObj,
					options: {
						tintFactor: 0,
						emitMultiplier: 0.0,
					},
					id,
					prevPosition: new THREE.Vector3(),
					currentPosition: new THREE.Vector3(),
					velocity: new THREE.Vector3(),
					active: false,
				};

				pool.instances.push(emitterData);
				this.emitters.push(emitterData);
				this.objectMap.set(proxyObj, emitterData);
			}

			// Advance the offset for the next definition
			vertexOffset += defVertexCount * def.maxCount;
		}

		this.instanceInfoData = new Uint32Array(vertexInstanceData); // NEW

		// Create GPU buffer for vertices once
		this.totalUniqueVertexCount = allVertices.length / 4;
		// console.log("Total vertex count: ", this.totalUniqueVertexCount);
		// console.log("unique instances", globalId);
		// console.log("Instance info data", this.instanceInfoData);

		this.instanceInfoAttr = new THREE.StorageBufferAttribute(this.instanceInfoData, 4);
		this.totalInstancesVertices = vertexOffset;

		this.instanceInfoStorageNode = storage(
			this.instanceInfoAttr,
			"uvec4",
			this.totalInstancesVertices,
		).toReadOnly();

		const vertexData = new Float32Array(allVertices);
		this.combinedVertexAttr = new THREE.StorageBufferAttribute(vertexData, 4);
		this.verticesStorageNode = storage(this.combinedVertexAttr, "vec4", this.totalUniqueVertexCount).toReadOnly();

		this.uploadAllThreshold = Math.floor(this.maxObjects * 0.25);
		//console.log("Vertex data: ", vertexData.length / 4);
	}

	public getFireFor(defId: string, options: EmitterOptions = {}): THREE.Object3D | null {
		const pool = this.defPools.get(defId);
		if (!pool) {
			console.warn(`EmitterManager: Definition ID '${defId}' not found.`);
			return null;
		}

		const inactiveInstance = pool.instances.find((inst) => !inst.active);
		if (!inactiveInstance) {
			console.warn(`EmitterManager: Max emitters reached for definition '${defId}'.`);
			return null;
		}

		inactiveInstance.active = true;
		inactiveInstance.options.tintFactor = options.tintFactor ?? 0;
		inactiveInstance.options.emitMultiplier = options.emitMultiplier ?? 1.0;
		inactiveInstance.object.getWorldPosition(inactiveInstance.prevPosition);

		return inactiveInstance.object;
	}

	public releaseFire(proxy: THREE.Object3D): void {
		const emitterData = this.objectMap.get(proxy);

		if (!emitterData) {
			console.warn("EmitterManager: Object not found in registry.");
			return;
		}

		emitterData.active = false;
		emitterData.options.emitMultiplier = 0.0;

		// Zero out data in GPU buffers for cleanliness
		const { id } = emitterData;
		this.matrixData.fill(0, id * 16, id * 16 + 16);
		this.propData.fill(0, id * 4, id * 4 + 4);
		this.velData.fill(0, id * 4, id * 4 + 4);

		this.matrixAttr.addUpdateRange(id * 16, 16);
		this.propAttr.addUpdateRange(id * 4, 4);
		this.velAttr.addUpdateRange(id * 4, 4);

		this.matrixAttr.needsUpdate = true;
		this.propAttr.needsUpdate = true;
		this.velAttr.needsUpdate = true;
	}

	/**
	 * extract the data from the proxy object and pass it to the GPU
	 * @param deltaTime
	 */
	public update(deltaTime: number): void {
		const dt = Math.max(deltaTime, 0.001); // Prevent division by zero

		this.matrixAttr.clearUpdateRanges();
		this.propAttr.clearUpdateRanges();
		this.velAttr.clearUpdateRanges();

		let matrixBufferChanged = 0;
		let propBufferChanged = 0;
		let velBufferChanged = 0;

		for (const emitter of this.emitters) {
			const { object, options, id, prevPosition, currentPosition, velocity, active } = emitter;

			const propOffset = id * 4;
			const currentActive = this.propData[propOffset];
			const activeChanged = Number(active) !== currentActive;

			if (activeChanged) {
				if (!active) {
					this.propData[propOffset] = 0;
					this.propAttr.addUpdateRange(propOffset, 1);
					propBufferChanged++;
					continue;
				}
			}

			// 1. Update transforms
			object.updateMatrixWorld();
			// object.matrixWorld.toArray(this.matrixData, id * 16);
			let matrixChanged = false;
			const matrixOffset = id * 16;
			const elements = object.matrixWorld.elements;

			// Comprobar mutación
			for (let i = 0; i < 16; i++) {
				if (this.matrixData[matrixOffset + i] !== elements[i]) {
					this.matrixData[matrixOffset + i] = elements[i];
					matrixChanged = true;
				}
			}

			if (matrixChanged) {
				this.matrixAttr.addUpdateRange(matrixOffset, 16);
				matrixBufferChanged++;
			}

			// 2. Compute World-Space Velocity
			object.getWorldPosition(currentPosition);
			velocity.subVectors(currentPosition, prevPosition).divideScalar(dt);
			const speed = velocity.length();

			// Save current position for next frame
			prevPosition.copy(currentPosition);

			if (
				activeChanged ||
				this.propData[propOffset + 1] !== options.emitMultiplier ||
				this.propData[propOffset + 2] !== options.tintFactor
			) {
				// Si un solo valor cambió, sobrescribimos los 4 componentes en memoria.
				// Asignar floats secuencialmente es más rápido que evaluar múltiples condicionales.
				this.propData[propOffset] = Number(active);
				this.propData[propOffset + 1] = options.emitMultiplier;
				this.propData[propOffset + 2] = options.tintFactor;

				this.propAttr.addUpdateRange(propOffset, 4);
				propBufferChanged++;
			}

			const velOffset = id * 4;

			if (
				this.velData[velOffset + 0] !== velocity.x ||
				this.velData[velOffset + 1] !== velocity.y ||
				this.velData[velOffset + 2] !== velocity.z ||
				this.velData[velOffset + 3] !== speed
			) {
				this.velData[velOffset + 0] = velocity.x;
				this.velData[velOffset + 1] = velocity.y;
				this.velData[velOffset + 2] = velocity.z;
				this.velData[velOffset + 3] = speed;

				this.velAttr.addUpdateRange(velOffset, 4);
				velBufferChanged++;
			}
		}

		if (matrixBufferChanged > this.uploadAllThreshold) {
			this.matrixAttr.clearUpdateRanges();
		}

		if (propBufferChanged > this.uploadAllThreshold) {
			this.propAttr.clearUpdateRanges();
		}

		if (velBufferChanged > this.uploadAllThreshold) {
			this.velAttr.clearUpdateRanges();
		}

		// Send updated buffers to GPU
		if (matrixBufferChanged) this.matrixAttr.needsUpdate = true;
		if (propBufferChanged) this.propAttr.needsUpdate = true;
		if (velBufferChanged) this.velAttr.needsUpdate = true;
	}

	/**
	 * Returns a node that will dispatch a compute shader for each vertex of each active emitter.
	 * @param forEachInstanceVertex A function that will be called for each vertex of each active emitter.
	 * @returns A node that will dispatch a compute shader for each vertex of each active emitter.
	 */
	computeNodePerVertex(forEachInstanceVertex: ComputeNodeHook) {
		return Fn(() => {
			If(instanceIndex.greaterThanEqual(this.totalInstancesVertices), () => {
				Return();
			});

			const pointer = this.instanceInfoStorageNode.element(instanceIndex);
			const vertexOffset = pointer.x;
			const instanceId = pointer.y;

			const localPos = this.verticesStorageNode.element(vertexOffset).xyz;
			const props = this.propsStorageNode.element(instanceId);
			const active = props.r.greaterThan(0);
			const emitMultiplier = props.g;
			const tintFactor = props.b;

			If(active.and(emitMultiplier.greaterThan(0.0)), () => {
				const transformMat = this.matricesStorageNode.element(instanceId);
				const worldPos = transformMat.mul(vec4(localPos, 1.0)).xyz;

				forEachInstanceVertex(
					localPos,
					worldPos,
					emitMultiplier,
					transformMat,
					this.velocitiesStorageNode.element(instanceId),
					tintFactor,
				);
			});
		})().compute(this.totalInstancesVertices);
	}
}
