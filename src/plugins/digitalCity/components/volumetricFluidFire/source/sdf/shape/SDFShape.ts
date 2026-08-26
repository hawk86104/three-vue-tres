import { uniform, uniformArray } from "three/tsl";
import { Node, Object3D, UniformArrayNode, UniformNode } from "three/webgpu";

export type SDFShapeContext = {
	uInverseMatrices: UniformArrayNode<"mat4">;
	uWorldPositions: UniformArrayNode<"vec3">;
	uVelocities: UniformArrayNode<"vec3">;
	uAngularVelocities: UniformArrayNode<"vec3">;
	uHalfExtents: UniformArrayNode<"vec3">;
	uIsActive: UniformArrayNode<"uint">;
};

let ShapeIndex = 0;

export type BasicShapes = "box" | "sphere" | "ellipsoid" | (string & {});

export abstract class SDFShape<T = any> {
	readonly shapeTypeIndex = ++ShapeIndex;
	readonly uDataIndex: UniformArrayNode<"uint">;
	//protected readonly uCount: UniformNode<"uint", number>;

	constructor(
		readonly maxCount: number,
		readonly name: BasicShapes,
	) {
		this.uDataIndex = uniformArray(
			Array.from({ length: maxCount }, () => 0),
			"uint",
		);
		//this.uCount = uniform(maxCount, "uint");
	}

	/**
	 * creates a collider on the given object. You can override this (but you must call this too super.createColliderOn ) to configure
	 * custom uniforms that your implementation may require. This must be called since it provides basic function.
	 *
	 * @param proxy object to add collider on. The user will be able to move, rotate, and scale this object, and the collider will follow.
	 * @param dataIndex index of the buffer data array where this collider will pull it's data from
	 * @param customColliderConfig Configuration for this specific collider.
	 * @returns true if successful
	 */
	createColliderOn(proxy: Object3D, dataIndex: number, customColliderConfig: T) {
		const slots = this.uDataIndex.array as number[];
		const freeIndex = slots.findIndex((slot) => slot === 0);
		if (freeIndex === -1) {
			throw new Error("No free index found for shape collider");
		}
		slots[freeIndex] = dataIndex;
		return true;
	}

	destroyColliderFrom(proxy: Object3D, oldDataIndex: number, oldConfig: T) {
		const slots = this.uDataIndex.array as number[];
		const index = slots.findIndex((slot) => slot === oldDataIndex);
		if (index !== -1) {
			slots[index] = 0;
		}
	}

	/**
	 * This is called once per frame, before running anything. THis is where you update your uniforms.
	 * @param proxy
	 * @param dataIndex
	 * @param delta
	 */
	update(proxy: Object3D, dataIndex: number, delta: number) {}

	/**
	 * @param localPos Position of the query in local space (center of the sdf)
	 * @param halfExtents Half extents of the sdf's world. The SDF is thought of as being contained in a box defined by these limits.
	 * @see https://en.wikipedia.org/wiki/Signed_distance_function
	 */
	sdf(localPos: Node<"vec3">, halfExtents: Node<"vec3">): Node<"float"> {
		throw new Error("Not implemented");
	}
}
