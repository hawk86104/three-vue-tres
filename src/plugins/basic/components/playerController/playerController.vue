<template>
</template>

<script setup lang="ts">
import * as THREE from "three";
import { computed, onBeforeUnmount, watch } from "vue";
import { useLoop, useTres } from "@tresjs/core";
import { playerController } from "./playerController";
import type { MobileControlsOptions, PlayerControllerApi, PlayerModelOptions } from "./playerController";

type Vec3Like = THREE.Vector3 | [number, number, number] | { x: number; y: number; z: number };

type PlayerControllerProps = {
    position?: Vec3Like;
    scale?: number;
    rotationY?: number;
    modelUrl?: string;
    idleAnim?: string;
    walkAnim?: string;
    runAnim?: string;
    jumpAnim?: string;
    leftWalkAnim?: string;
    rightWalkAnim?: string;
    backwardAnim?: string;
    flyAnim?: string;
    flyIdleAnim?: string;
    headObjName?: string;
    flyEnabled?: boolean;
    capsuleRadiusRatio?: number;
    gravity?: number;
    jumpHeight?: number;
    speed?: number;
    flySpeed?: number;
    mouseSensitivity?: number;
    mouseSensity?: number;
    minCamDistance?: number;
    maxCamDistance?: number;
    colliderMeshUrl?: string;
    isShowMobileControls?: boolean;
    mobileControls?: MobileControlsOptions;
    thirdMouseMode?: 0 | 1 | 2 | 3;
    enableZoom?: boolean;
    enableOverShoulderView?: boolean;
    debug?: boolean;
};

const DEFAULT_MODEL_URL = `${process.env.NODE_ENV === "development" ? "resource.cos" : "https://opensource.cdn.icegl.cn"}/model/basic/person.glb`;

const props = withDefaults(defineProps<PlayerControllerProps>(), {
    position: () => [0, 0, 0],
    scale: 0.001,
    rotationY: 0,
    idleAnim: "idle",
    walkAnim: "walk",
    runAnim: "run",
    jumpAnim: "jump",
    flyAnim: "flying",
    flyIdleAnim: "flyidle",
    flyEnabled: true,
    capsuleRadiusRatio: 1,
    minCamDistance: 100,
    maxCamDistance: 440,
    isShowMobileControls: true,
    mobileControls: () => ({ joystick: true, jump: true, fly: true, view: true }),
    thirdMouseMode: 1,
    enableZoom: false,
    enableOverShoulderView: false,
    debug: false,
});

const emit = defineEmits<{
    ready: [api: PlayerControllerApi];
}>();

const { camera, scene, controls } = useTres();
const controller = playerController();

let isReady = false;
let isInitializing = false;
let lastScene: THREE.Scene | null = null;
let lastCamera: THREE.PerspectiveCamera | null = null;
let lastControls: any = null;

const resolvedMouseSensitivity = computed(() => props.mouseSensitivity ?? props.mouseSensity ?? 5);

const positionTuple = computed<[number, number, number]>(() => {
    const value = props.position;
    if (value instanceof THREE.Vector3) return [value.x, value.y, value.z];
    if (Array.isArray(value)) return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
    return [value?.x ?? 0, value?.y ?? 0, value?.z ?? 0];
});

const buildPlayerModel = (): PlayerModelOptions => ({
    url: props.modelUrl ?? DEFAULT_MODEL_URL,
    scale: props.scale,
    idleAnim: props.idleAnim,
    walkAnim: props.walkAnim,
    runAnim: props.runAnim,
    jumpAnim: props.jumpAnim,
    leftWalkAnim: props.leftWalkAnim,
    rightWalkAnim: props.rightWalkAnim,
    backwardAnim: props.backwardAnim,
    flyAnim: props.flyAnim,
    flyIdleAnim: props.flyIdleAnim,
    gravity: props.gravity,
    jumpHeight: props.jumpHeight,
    speed: props.speed,
    flySpeed: props.flySpeed,
    rotateY: props.rotationY,
    headObjName: props.headObjName,
    flyEnabled: props.flyEnabled,
    capsuleRadiusRatio: props.capsuleRadiusRatio,
});

const buildPosition = () => new THREE.Vector3(...positionTuple.value);

const modelReloadKey = computed(() => JSON.stringify({
    modelUrl: props.modelUrl ?? DEFAULT_MODEL_URL,
    idleAnim: props.idleAnim,
    walkAnim: props.walkAnim,
    runAnim: props.runAnim,
    jumpAnim: props.jumpAnim,
    leftWalkAnim: props.leftWalkAnim,
    rightWalkAnim: props.rightWalkAnim,
    backwardAnim: props.backwardAnim,
    flyAnim: props.flyAnim,
    flyIdleAnim: props.flyIdleAnim,
    rotationY: props.rotationY,
    headObjName: props.headObjName,
    flyEnabled: props.flyEnabled,
    capsuleRadiusRatio: props.capsuleRadiusRatio,
}));

const initController = async () => {
    if (!scene.value || !camera.value || !controls.value || isInitializing) return;
    if (isReady && lastScene === scene.value && lastCamera === camera.value && lastControls === controls.value) return;

    isInitializing = true;

    try {
        if (isReady) {
            controller.destroy();
            isReady = false;
        }

        await controller.init({
            scene: scene.value,
            camera: camera.value as THREE.PerspectiveCamera,
            controls: controls.value,
            playerModel: buildPlayerModel(),
            initPos: buildPosition(),
            mouseSensitivity: resolvedMouseSensitivity.value,
            minCamDistance: props.minCamDistance,
            maxCamDistance: props.maxCamDistance,
            colliderMeshUrl: props.colliderMeshUrl,
            isShowMobileControls: props.isShowMobileControls,
            mobileControls: props.mobileControls,
            thirdMouseMode: props.thirdMouseMode,
            enableZoom: props.enableZoom,
            enableOverShoulderView: props.enableOverShoulderView,
        });

        controller.setDebug(props.debug);
        controller.setPlayerFlyEnabled(props.flyEnabled);

        isReady = true;
        lastScene = scene.value;
        lastCamera = camera.value as THREE.PerspectiveCamera;
        lastControls = controls.value;
        emit("ready", controller);
    } finally {
        isInitializing = false;
    }
};

watch(
    () => [scene.value, camera.value, controls.value],
    () => {
        void initController();
    },
    { immediate: true },
);

watch(modelReloadKey, async () => {
    if (!isReady || isInitializing) return;
    await controller.switchPlayerModel(buildPlayerModel());
    controller.setDebug(props.debug);
});

watch(
    () => props.scale,
    (value) => {
        if (!isReady) return;
        controller.setPlayerScale(value);
    },
);

watch(
    positionTuple,
    (value) => {
        if (!isReady) return;
        controller.reset(new THREE.Vector3(...value));
    },
    { deep: true },
);

watch(
    resolvedMouseSensitivity,
    (value) => {
        if (!isReady) return;
        controller.setMouseSensitivity(value);
    },
);

watch(
    () => props.gravity,
    (value) => {
        if (!isReady || value == null) return;
        controller.setGravity(value);
    },
);

watch(
    () => props.jumpHeight,
    (value) => {
        if (!isReady || value == null) return;
        controller.setJumpHeight(value);
    },
);

watch(
    () => props.speed,
    (value) => {
        if (!isReady || value == null) return;
        controller.setPlayerSpeed(value);
    },
);

watch(
    () => props.flySpeed,
    (value) => {
        if (!isReady || value == null) return;
        controller.setPlayerFlySpeed(value);
    },
);

watch(
    () => props.flyEnabled,
    (value) => {
        if (!isReady) return;
        controller.setPlayerFlyEnabled(value);
    },
);

watch(
    () => props.minCamDistance,
    (value) => {
        if (!isReady || value == null) return;
        controller.setMinCamDistance(value);
    },
);

watch(
    () => props.maxCamDistance,
    (value) => {
        if (!isReady || value == null) return;
        controller.setMaxCamDistance(value);
    },
);

watch(
    () => props.thirdMouseMode,
    (value) => {
        if (!isReady) return;
        controller.setThirdMouseMode(value);
    },
);

watch(
    () => props.enableZoom,
    (value) => {
        if (!isReady) return;
        controller.setEnableZoom(value);
    },
);

watch(
    () => props.enableOverShoulderView,
    (value) => {
        if (!isReady) return;
        controller.setOverShoulderView(value);
    },
);

watch(
    () => props.debug,
    (value) => {
        if (!isReady) return;
        controller.setDebug(value);
    },
);

const { onBeforeRender } = useLoop();
onBeforeRender(({ delta }: { delta: number }) => {
    if (!isReady) return;
    controller.update(delta);
});

onBeforeUnmount(() => {
    controller.destroy();
    isReady = false;
    lastScene = null;
    lastCamera = null;
    lastControls = null;
});

defineExpose({
    controller,
    reset: (position?: Vec3Like) => {
        if (!position) {
            controller.reset();
            return;
        }

        if (position instanceof THREE.Vector3) {
            controller.reset(position);
            return;
        }

        if (Array.isArray(position)) {
            controller.reset(new THREE.Vector3(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0));
            return;
        }

        controller.reset(new THREE.Vector3(position.x ?? 0, position.y ?? 0, position.z ?? 0));
    },
    setInput: controller.setInput,
    changeView: controller.changeView,
    getPosition: controller.getPosition,
    getPerson: controller.getPerson,
    getCurrentPersonAnimationName: controller.getCurrentPersonAnimationName,
    switchPlayerModel: controller.switchPlayerModel,
    setPlayerScale: controller.setPlayerScale,
    setMouseSensitivity: controller.setMouseSensitivity,
    setGravity: controller.setGravity,
    setJumpHeight: controller.setJumpHeight,
    setPlayerSpeed: controller.setPlayerSpeed,
    setPlayerFlySpeed: controller.setPlayerFlySpeed,
    setPlayerFlyEnabled: controller.setPlayerFlyEnabled,
    setMinCamDistance: controller.setMinCamDistance,
    setMaxCamDistance: controller.setMaxCamDistance,
    setThirdMouseMode: controller.setThirdMouseMode,
    setEnableZoom: controller.setEnableZoom,
    setOverShoulderView: controller.setOverShoulderView,
    setDebug: controller.setDebug,
});
</script>
