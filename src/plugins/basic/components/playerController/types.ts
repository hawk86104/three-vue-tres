import * as THREE from "three";

export type MobileControlsOptions = {
    joystick?: boolean;
    jump?: boolean;
    fly?: boolean;
    view?: boolean;
};

export type PlayerControllerInput = {
    moveX: 1 | 0 | -1;
    moveY: 1 | 0 | -1;
    lookDeltaX: number;
    lookDeltaY: number;
    jump: boolean;
    shift: boolean;
    toggleView: boolean;
    toggleFly: boolean;
};

export type PlayerModelOptions = {
    url: string;
    scale: number;
    idleAnim: string;
    walkAnim: string;
    runAnim: string;
    jumpAnim: string;
    leftWalkAnim?: string;
    rightWalkAnim?: string;
    backwardAnim?: string;
    flyAnim?: string;
    flyIdleAnim?: string;
    gravity?: number;
    jumpHeight?: number;
    speed?: number;
    flySpeed?: number;
    rotateY?: number;
    headObjName?: string;
    flyEnabled?: boolean;
    capsuleRadiusRatio?: number;
};

export type PlayerControllerOptions = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: any;
    playerModel: PlayerModelOptions;
    initPos?: THREE.Vector3;
    mouseSensitivity?: number;
    minCamDistance?: number;
    maxCamDistance?: number;
    colliderMeshUrl?: string;
    isShowMobileControls?: boolean;
    mobileControls?: MobileControlsOptions;
    thirdMouseMode?: 0 | 1 | 2 | 3;
    enableZoom?: boolean;
    enableOverShoulderView?: boolean;
};

export type VehicleAnimationOptions = {
    openDoorAnim?: string;
    wheelsTurnAnim?: string;
    turnLeftAnim?: string;
    turnRightAnim?: string;
};

export type VehicleModelOptions = {
    url: string;
    position: THREE.Vector3;
    scale?: number;
    animations?: VehicleAnimationOptions;
};
