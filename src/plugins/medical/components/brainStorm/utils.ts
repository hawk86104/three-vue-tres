import * as THREE from 'three'

export const createSeededRandom = (seed = 1) => {
    let value = (seed >>> 0) || 1

    return () => {
        value = (value * 1664525 + 1013904223) >>> 0
        return value / 4294967296
    }
}

export const randomRange = (random: () => number, min: number, max: number) =>
    min + (max - min) * random()

export const getPrimaryMesh = (root: THREE.Object3D) => {
    let primaryMesh: THREE.Mesh | null = null

    root.traverse((child) => {
        if (!primaryMesh && child instanceof THREE.Mesh) {
            primaryMesh = child
        }
    })

    return primaryMesh
}

export const buildTangentBasis = (normal: THREE.Vector3) => {
    const tangent = new THREE.Vector3()

    if (Math.abs(normal.y) < 0.99) {
        tangent.set(0, 1, 0).cross(normal).normalize()
    } else {
        tangent.set(1, 0, 0).cross(normal).normalize()
    }

    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize()
    return { tangent, bitangent }
}
