/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-02-26 18:58:32
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2024-04-03 14:43:26
 */
import { Camera, Frustum, Matrix4, Object3D, Vector3, BufferGeometry, Mesh } from 'three';
import { Provider } from './Providers/Provider';
import { Tile } from './Tile';
import { bboxToTile, getChildren } from '@mapbox/tilebelt';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'

/**
 * 地图对象
 */
class Map extends Object3D {
    provider: Provider<Object3D>;
    bbox = [74.390592, 6.900905, 134.071423, 54.318199];
    maxZoom = 20;
    rootForward = 0;
    camera: Camera;

    cameraFrustum = new Frustum();
    cameraWorldPosition = new Vector3();
    cameraProjectionMatrix = new Matrix4();

    lastCameraProjectionMatrix = new Matrix4();
    lastCameraWorldPosition = new Vector3();

    rootTiles: Tile[] = [];
    lastUpdateTime = 0;
    private isDisposed = false;

    constructor() {
        super()
        if (!BufferGeometry.prototype.computeBoundsTree) {
            BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
        }
        if (!BufferGeometry.prototype.disposeBoundsTree) {
            BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
        }
        Mesh.prototype.raycast = acceleratedRaycast
    }

    private initRootTiles() {
        if (this.rootForward > 3) {
            console.warn('rootForward needs to be 0 - 3.');
            this.rootForward = 3;
        }
        if (this.rootForward < 0) {
            console.warn('rootForward needs to be 0 - 3.');
            this.rootForward = 0;
        }
        const rootTileNos = [];
        let tileNos = [bboxToTile(this.bbox)];
        let rootForward = this.rootForward;
        while (rootForward > 0) {
            const tileNosCopy = [...tileNos];
            tileNos = [];
            tileNosCopy.forEach(t => {
                const children = getChildren(t);
                tileNos.push(...children);
            });
            rootForward--;
        }
        rootTileNos.push(...tileNos);

        rootTileNos.forEach(no => {
            const tile = new Tile();
            tile.init(no, this);
            this.rootTiles.push(tile);
        });
    }

    update() {
        if (this.isDisposed || !this.visible || !this.camera) {
            return;
        }

        const now = Date.now();
        if (now - this.lastUpdateTime < 300) {
            return;
        }

        if (this.rootTiles.length === 0) {
            this.initRootTiles()
            return;
        }

        this.camera.getWorldPosition(this.cameraWorldPosition);
        this.cameraProjectionMatrix.multiplyMatrices(this.camera.projectionMatrix,
            this.camera.matrixWorldInverse);

        if (this.cameraWorldPosition.equals(this.lastCameraWorldPosition)
            && this.cameraProjectionMatrix.equals(this.lastCameraProjectionMatrix)) {
            return;
        }

        this.cameraFrustum.setFromProjectionMatrix(this.cameraProjectionMatrix);
        this.rootTiles.forEach(tile => tile.update());
        this.lastCameraProjectionMatrix.copy(this.cameraProjectionMatrix);
        this.lastCameraWorldPosition.copy(this.cameraWorldPosition);
        this.lastUpdateTime = now;
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.rootTiles.forEach(tile => tile.dispose());
        this.rootTiles = [];
    }

    regenerate() {
        throw new Error('[Map.regenerate] Method not implemented.');
    }
}

export { Map };
