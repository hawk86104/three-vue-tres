import * as THREE from "three/webgpu";
import {
  createPhysicalDiffractionGrating,
} from "./physical-diffraction-grating.js";

export default {
  backend: "webgpu",
  assetBase: "/plugins/basic/materials/physicalDiffractionGrating/",
  async setup({ scene, resolveAsset }) {
    scene.background = new THREE.Color(0x050507);
    const artTexture = await new THREE.TextureLoader().loadAsync(resolveAsset("card-art.png"));
    const grating = createPhysicalDiffractionGrating({ artTexture });
    scene.add(grating.group);

    const hemisphere = new THREE.HemisphereLight(0xc8c9d8, 0x19131a, 0.86);
    const rim = new THREE.DirectionalLight(0xcbd6ff, 1.6);
    rim.position.set(-3, 5, 6);
    scene.add(hemisphere, rim);

    const lampGeometry = new THREE.PlaneGeometry(grating.uniforms.lightHalfLength.value * 2, 0.11);
    const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xf8f3e8, side: THREE.DoubleSide });
    const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
    lamp.position.copy(grating.uniforms.lightCenter.value);
    const xAxis = grating.uniforms.lightAxis.value.clone().normalize();
    const zAxis = grating.uniforms.lightNormal.value.clone().normalize();
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
    lamp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    lamp.visible = false;
    scene.add(lamp);

    return {
      setParameters(value) {
        const { uniforms } = grating;
        uniforms.pitchNm.value = value.pitchNm;
        uniforms.reliefNm.value = value.reliefNm;
        uniforms.coherenceUm.value = value.coherenceUm;
        uniforms.azimuthSigma.value = value.azimuthSigma;
        uniforms.grooveAngle.value = THREE.MathUtils.degToRad(value.grooveAngle);
        uniforms.gain.value = value.gain;
        uniforms.starsEnabled.value = value.stars ? 1 : 0;
        uniforms.lightTemperatureK.value = value.lightTemperature;
        uniforms.lightPower.value = value.lightPower;
      },
      update() {
        grating.updateObjectFrame();
      },
      dispose() {
        scene.remove(grating.group, hemisphere, rim, lamp);
        grating.dispose();
        artTexture.dispose();
        lampGeometry.dispose();
        lampMaterial.dispose();
      },
    };
  },
};
