import type { SparkRenderer, SplatMesh } from '@sparkjsdev/spark'
import { Group, Mesh, MeshBasicMaterial, Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader'

export type HunyuanSpzColliderOptions = {
    useColliderUrl?: boolean
    colliderUrl?: string
}

export type ColliderScene = {
    object: Object3D
    dispose: () => void
}

export type HunyuanSpzColliderBinding = {
    sync: (options: HunyuanSpzColliderOptions) => Promise<void>
    dispose: () => void
}

const gltfLoader = new GLTFLoader()
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('./draco/')
dracoLoader.setDecoderConfig({ type: 'js' })
gltfLoader.setDRACOLoader(dracoLoader)

const plyLoader = new PLYLoader()

const normalizeColliderUrl = (value?: string) => value?.trim() ?? ''

const resolveColliderKind = (url: string) => {
    const pureUrl = url.split('#')[0].split('?')[0].toLowerCase()
    if (pureUrl.endsWith('.ply')) {
        return 'ply'
    }
    if (pureUrl.endsWith('.glb') || pureUrl.endsWith('.gltf')) {
        return 'gltf'
    }
    return ''
}

const applyCharacterRoamCollisionMode = (
    sparkRenderer: SparkRenderer,
    splatMesh: SplatMesh,
    useExternalCollider: boolean,
) => {
    sparkRenderer.userData.playerControllerIgnoreCollider = true
    splatMesh.userData.playerControllerIgnoreCollider = true
    splatMesh.userData.playerControllerRaycastOnly = !useExternalCollider
}

const disposeColliderScene = (colliderScene: ColliderScene | null) => {
    if (!colliderScene) {
        return
    }

    colliderScene.object.removeFromParent()
    colliderScene.dispose()
}

const loadColliderScene = async (url: string): Promise<ColliderScene | null> => {
    const colliderKind = resolveColliderKind(url)

    if (colliderKind === 'gltf') {
        const gltf = await gltfLoader.loadAsync(url)
        const object = gltf.scene
        object.visible = false

        return {
            object,
            dispose: () => {
                object.traverse((child: any) => {
                    if (!child?.isMesh) {
                        return
                    }

                    child.geometry?.dispose?.()
                    if (Array.isArray(child.material)) {
                        child.material.forEach((material: any) => material?.dispose?.())
                    } else {
                        child.material?.dispose?.()
                    }
                })
            },
        }
    }

    if (colliderKind === 'ply') {
        const geometry = await plyLoader.loadAsync(url)
        if (!geometry.attributes.normal) {
            geometry.computeVertexNormals()
        }

        const material = new MeshBasicMaterial()
        const object = new Mesh(geometry, material)
        object.visible = false

        return {
            object,
            dispose: () => {
                geometry.dispose()
                material.dispose()
            },
        }
    }

    console.warn(`[hunyuanSpz] 暂不支持的 colliderUrl 格式: ${url}`)
    return null
}

export function createHunyuanSpzColliderBinding({
    root,
    sparkRenderer,
    splatMesh,
}: {
    root: Group
    sparkRenderer: SparkRenderer
    splatMesh: SplatMesh
}): HunyuanSpzColliderBinding {
    let colliderScene: ColliderScene | null = null
    let syncVersion = 0
    let disposed = false

    const applyCollisionMode = () => {
        applyCharacterRoamCollisionMode(sparkRenderer, splatMesh, Boolean(colliderScene))
    }

    const replaceColliderScene = (nextColliderScene: ColliderScene | null) => {
        disposeColliderScene(colliderScene)
        colliderScene = nextColliderScene
        if (colliderScene) {
            root.add(colliderScene.object)
        }
        applyCollisionMode()
    }

    applyCollisionMode()

    return {
        sync: async ({ useColliderUrl, colliderUrl }) => {
            const currentVersion = ++syncVersion
            const normalizedColliderUrl = normalizeColliderUrl(colliderUrl)
            const shouldUseExternalCollider = Boolean(useColliderUrl && normalizedColliderUrl)
            let nextColliderScene: ColliderScene | null = null

            if (shouldUseExternalCollider) {
                try {
                    nextColliderScene = await loadColliderScene(normalizedColliderUrl)
                } catch (error) {
                    console.error(`[hunyuanSpz] 代理碰撞加载失败: ${normalizedColliderUrl}`, error)
                }
            }

            if (disposed || currentVersion !== syncVersion) {
                disposeColliderScene(nextColliderScene)
                return
            }

            replaceColliderScene(nextColliderScene)
        },
        dispose: () => {
            disposed = true
            syncVersion++
            replaceColliderScene(null)
        },
    }
}
