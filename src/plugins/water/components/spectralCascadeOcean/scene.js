import { SpectralOceanSystem } from
  "./ocean-system.js";
import { validateFragmentIFFT } from
  "./fft-pipeline.js";
import { createOceanDetailTexture } from
  "./detail-texture.js";
import {
  createOceanMaterial,
  createSkyMaterial,
  updateOceanMaterialTextures,
} from "./ocean-material.js";

export default {
  assetBase: "/plugins/water/spectralCascadeOcean/",
  initialTime: 18.5,
  async setup({ THREE, renderer, scene }) {
    const fftValidation = validateFragmentIFFT(renderer);
    if (!fftValidation.pass) {
      throw new Error(
        `IFFT validation failed: impulse=${fftValidation.impulseError}, ` +
        `frequency=${fftValidation.frequencyError}`,
      );
    }

    const sunAzimuth = THREE.MathUtils.degToRad(135);
    const sunElevation = THREE.MathUtils.degToRad(28);
    const sunDirection = new THREE.Vector3(
      Math.cos(sunElevation) * Math.sin(sunAzimuth),
      Math.sin(sunElevation),
      Math.cos(sunElevation) * Math.cos(sunAzimuth),
    ).normalize();
    const detailTexture = createOceanDetailTexture();
    const options = {
      resolution: 256,
      patchLengths: [250, 17, 5],
      boundaryFactor: 6,
      gravity: 9.81,
      depth: 500,
      choppiness: 1.3,
      foamRecovery: 0.4,
      amplitude: 1,
      seed: 481516,
      sunDirection,
      detailTexture,
      local: {
        scale: 1,
        windSpeed: 16,
        directionDegrees: 45,
        fetchMeters: 100000,
        directionality: 1,
        swell: 0.2,
        peakEnhancement: 3.3,
        shortWaveFade: 0.02,
      },
      swell: {
        scale: 0.8,
        windSpeed: 2,
        directionDegrees: 70,
        fetchMeters: 300000,
        directionality: 1,
        swell: 1,
        peakEnhancement: 3.3,
        shortWaveFade: 0.01,
      },
    };

    const ocean = new SpectralOceanSystem(renderer, options);
    scene.fog = new THREE.FogExp2(0x9fb8cc, 0.0045);

    const oceanMaterial = createOceanMaterial(ocean.cascades, options);
    const oceanGeometry = new THREE.PlaneGeometry(400, 400, 900, 900);
    oceanGeometry.rotateX(-Math.PI * 0.5);
    const oceanMesh = new THREE.Mesh(oceanGeometry, oceanMaterial);
    oceanMesh.frustumCulled = false;
    scene.add(oceanMesh);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(12000, 48, 24),
      createSkyMaterial(options),
    );
    scene.add(sky);

    let timeScale = 1;

    return {
      setParameters(value) {
        timeScale = value.timeScale;
        oceanMesh.scale.y = value.waveHeight;
        oceanMaterial.uniforms.foamThreshold.value = value.foamThreshold;
        oceanMaterial.uniforms.foamScale.value = value.foamScale;
        oceanMaterial.uniforms.detailStrength.value = value.detailStrength;
        oceanMaterial.uniforms.fogDensity.value = value.fogDensity;
        scene.fog.density = value.fogDensity;
      },
      update({ delta, elapsed }) {
        ocean.update(elapsed * timeScale, Math.max(delta * timeScale, 1 / 120));
        updateOceanMaterialTextures(oceanMaterial, ocean.cascades);
        oceanMaterial.uniforms.time.value = elapsed * timeScale;
      },
      dispose() {
        oceanGeometry.dispose();
        oceanMaterial.dispose();
        sky.geometry.dispose();
        sky.material.dispose();
        detailTexture.dispose();
      },
    };
  },
};
