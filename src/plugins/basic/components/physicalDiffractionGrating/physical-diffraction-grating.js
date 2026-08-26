import * as THREE from "three/webgpu";
import {
  Fn, If, Loop, uv, positionWorld, normalWorld, cameraPosition, uniform,
  float, int, vec2, vec3, vec4, select, abs, atan, clamp, cos, cross, dot, exp,
  floor, fract, length, log, max, min, mix, normalize, pow, sin, smoothstep,
  sqrt, step,
} from "three/tsl";

function makeRoundedAlphaTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const r = size * 0.065;
  const w = size;
  const h = size;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export const DIFFRACTION_GRATING_DEFAULTS = Object.freeze({
  pitchNm: 1180,
  reliefNm: 86,
  coherenceUm: 14.5,
  azimuthSigma: 0.013,
  grooveAngleRadians: THREE.MathUtils.degToRad(31),
  gain: 5.1,
  lightHalfLength: 4.9,
  lightTemperatureK: 5250,
  lightPower: 128,
});

export function diffractionOrderWavelengthNm(pitchNm, qAcross, order) {
  return pitchNm * Math.abs(qAcross) / order;
}

export function diffractionEffectiveAzimuthSigma(lambdaNm, coherenceUm, azimuthSigma) {
  const sigmaCoherence = 0.376 * lambdaNm / (Math.max(coherenceUm, 0.1) * 1000);
  return Math.max(Math.hypot(azimuthSigma, sigmaCoherence), 0.0025);
}

export function createPhysicalDiffractionGrating({ artTexture }) {
  if (!artTexture) throw new Error("createPhysicalDiffractionGrating requires an artTexture.");
  const cardArtTexture = artTexture;
  cardArtTexture.colorSpace = THREE.SRGBColorSpace;
  cardArtTexture.minFilter = THREE.LinearMipmapLinearFilter;
  cardArtTexture.magFilter = THREE.LinearFilter;
  cardArtTexture.wrapS = THREE.ClampToEdgeWrapping;
  cardArtTexture.wrapT = THREE.ClampToEdgeWrapping;
  const roundedAlphaTexture = makeRoundedAlphaTexture(1024);

  // Physical parameters. Distances in the diffraction equations are nm.
  const uPitchNm       = uniform(1180.0);
  const uReliefNm      = uniform(86.0);
  const uCoherenceUm   = uniform(14.5);
  const uAzimuthSigma  = uniform(0.013);
  const uGrooveAngle   = uniform(THREE.MathUtils.degToRad(31));
  const uGain          = uniform(5.1);
  const uStarsEnabled  = uniform(1.0);

  // Fixed strip emitter in world space. It never changes after initialization.
  const uLightCenter   = uniform(new THREE.Vector3(-1.95, 3.75, 5.35));
  const uLightAxis     = uniform(new THREE.Vector3(0.94, -0.26, 0.0).normalize());
  const uLightNormal   = uniform(new THREE.Vector3(0.20, -0.54, -0.82).normalize());
  const uLightHalfLen  = uniform(4.9);
  const uLightTempK    = uniform(5250.0);
  const uLightPower    = uniform(128.0);

  // Local card tangent axes transformed to world space by JS whenever the
  // *object* rotates. The shader contains no time-dependent state.
  const uAxisX         = uniform(new THREE.Vector3(1,0,0));
  const uAxisY         = uniform(new THREE.Vector3(0,1,0));

  // ---------------------------------------------------------------------
  // PURE TSL WAVE-OPTICS GRAPH
  // ---------------------------------------------------------------------
  // Every equation, constant, diffraction order, and emitter sample lives in
  // the node graph. TSL compiles it for WebGPURenderer without shader strings.

  const hash21 = Fn( ( [ p ] ) => {
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ).mul( 43758.5453123 ) );
  } );

  // Only defines WHERE the foil was embossed with a different grating.
  // It never supplies a color. Star color still comes entirely from optics.
  const starMicrostructure = Fn( ( [ st ] ) => {
    const grid = st.mul( vec2( 8.5, 11.5 ) ).toVar();
    const cell = floor( grid ).toVar();
    const p = fract( grid ).sub( vec2( 0.5 ) ).toVar();

    const h0 = hash21( cell.add( vec2( 1.3, 7.9 ) ) ).toVar();
    const h1 = hash21( cell.add( vec2( 9.7, 2.1 ) ) ).toVar();
    const h2 = hash21( cell.add( vec2( 4.4, 17.2 ) ) ).toVar();
    const h3 = hash21( cell.add( vec2( 22.1, 5.6 ) ) ).toVar();

    p.subAssign( vec2( h1, h2 ).sub( vec2( 0.5 ) ).mul( 0.28 ) );
    p.divAssign( h3.mul( 0.48 ).add( 0.88 ) );

    const a = atan( p.y, p.x ).toVar();
    const r = length( p ).toVar();
    const sparkle4 = pow( cos( a.mul( 4.0 ) ).mul( 0.5 ).add( 0.5 ), 7.5 ).toVar();
    const star5 = pow( cos( a.mul( 5.0 ) ).mul( 0.5 ).add( 0.5 ), 5.2 ).toVar();
    const points = mix( sparkle4, star5, step( 0.60, h2 ) ).toVar();
    const boundary = points.mul( 0.205 ).add( 0.070 ).toVar();
    const star = float( 1.0 ).sub( smoothstep( boundary.sub( 0.014 ), boundary.add( 0.014 ), r ) ).toVar();
    const present = smoothstep( 0.34, 0.52, h0 ).toVar();

    const localAngle = h1.sub( 0.5 ).mul( 3.6 ).toVar();
    const pitchScale = h2.mul( 0.18 ).add( 0.93 ).toVar();
    const depthScale = h3.mul( 0.78 ).add( 1.05 ).toVar();
    return vec4( star.mul( present ), localAngle, pitchScale, depthScale );
  } );

  const lineMask = Fn( ( [ coord, halfWidth, soft ] ) => {
    const u = abs( fract( coord ).sub( 0.5 ) ).toVar();
    return float( 1.0 ).sub( smoothstep( halfWidth, halfWidth.add( soft ), u ) );
  } );

  const stripeMicrostructure = Fn( ( [ st ] ) => {
    const lowerCoord = st.x.mul( 0.86 ).sub( st.y.mul( 1.28 ) ).mul( 5.0 ).add( 0.12 ).toVar();
    const upperCoord = st.x.mul( 0.92 ).sub( st.y.mul( 1.18 ) ).mul( 3.9 ).sub( 0.06 ).toVar();
    const diagCoord  = st.x.mul( 0.78 ).sub( st.y.mul( 1.42 ) ).mul( 2.8 ).add( 0.18 ).toVar();

    const lowerLines = lineMask( lowerCoord, float( 0.032 ), float( 0.020 ) ).toVar();
    const upperLines = lineMask( upperCoord, float( 0.030 ), float( 0.019 ) ).toVar();
    const diagLine   = lineMask( diagCoord,  float( 0.027 ), float( 0.018 ) ).toVar();

    const m1 = lowerLines.mul( sin( st.x.mul( 13.0 ).add( st.y.mul( 5.0 ) ) ).mul( 0.008 ).add( 0.992 ) ).toVar();
    const m2 = upperLines.mul( sin( st.x.mul( 11.0 ).sub( st.y.mul( 7.0 ) ).add( 1.7 ) ).mul( 0.008 ).add( 0.992 ) ).toVar();
    const m3 = diagLine.mul( sin( st.x.mul( 9.0 ).add( st.y.mul( 6.0 ) ).add( 0.8 ) ).mul( 0.005 ).add( 0.995 ) ).toVar();
    const mask = clamp( max( max( m1, m2 ), m3 ), 0.0, 1.0 ).toVar();

    const weightSum = m1.add( m2 ).add( m3 ).add( 1e-5 ).toVar();
    const localAngle = m2.mul( 0.045 ).add( m3.mul( -0.035 ) ).div( weightSum ).toVar();
    const pitchScale = m1.mul( 0.96 ).add( m2.mul( 1.04 ) ).add( m3.mul( 1.01 ) ).div( weightSum ).toVar();
    const depthScale = m1.mul( 1.30 ).add( m2.mul( 1.16 ) ).add( m3.mul( 1.04 ) ).div( weightSum ).toVar();
    return vec4( mask, localAngle, pitchScale, depthScale );
  } );

  const roundedMask = Fn( ( [ st ] ) => {
    const r = float( 0.046 );
    const p = abs( st.sub( vec2( 0.5 ) ) ).sub( vec2( float( 0.5 ).sub( r ) ) ).toVar();
    const d = length( max( p, vec2( 0.0 ) ) ).add( min( max( p.x, p.y ), 0.0 ) ).sub( r ).toVar();
    return float( 1.0 ).sub( smoothstep( -0.0025, 0.0025, d ) );
  } );

  const valueNoise = Fn( ( [ p ] ) => {
    const i = floor( p ).toVar();
    const f = fract( p ).toVar();
    const a = hash21( i ).toVar();
    const b = hash21( i.add( vec2( 1.0, 0.0 ) ) ).toVar();
    const c = hash21( i.add( vec2( 0.0, 1.0 ) ) ).toVar();
    const d = hash21( i.add( vec2( 1.0, 1.0 ) ) ).toVar();
    const u = f.mul( f ).mul( vec2( 3.0 ).sub( f.mul( 2.0 ) ) ).toVar();
    return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
  } );

  const microSurfaceHeight = Fn( ( [ st ] ) => {
    const star = starMicrostructure( st ).toVar();
    const stripe = stripeMicrostructure( st ).toVar();
    const foilMask = clamp( max( stripe.x, star.x ), 0.0, 1.0 ).toVar();

    const grain1 = valueNoise( st.mul( 310.0 ).add( vec2( 3.1, 7.2 ) ) ).sub( 0.5 ).toVar();
    const grain2 = valueNoise( st.mul( 760.0 ).add( vec2( 11.7, 2.4 ) ) ).sub( 0.5 ).toVar();
    const broad = valueNoise( st.mul( 92.0 ).add( vec2( 4.3, 9.6 ) ) ).sub( 0.5 ).toVar();
    const laminate = grain1.mul( 0.48 ).add( grain2.mul( 0.22 ) ).add( broad.mul( 0.30 ) ).toVar();

    return laminate.mul( 0.00014 ).add(
      foilMask.mul( grain1.mul( 0.72 ).add( grain2.mul( 0.28 ) ) ).mul( 0.00010 )
    );
  } );

  // Wyman/Sloan/Shirley analytic approximation to CIE 1931 XYZ matching curves.
  const cieBell = Fn( ( [ lambdaNm, mu, leftTau, rightTau ] ) => {
    const tau = select( lambdaNm.lessThan( mu ), leftTau, rightTau ).toVar();
    const x = tau.mul( lambdaNm.sub( mu ) ).toVar();
    return exp( x.mul( x ).mul( -0.5 ) );
  } );

  const cieXYZ = Fn( ( [ lambdaNm ] ) => {
    const X = cieBell( lambdaNm, float( 599.8 ), float( 0.0264 ), float( 0.0323 ) ).mul( 1.056 )
      .add( cieBell( lambdaNm, float( 442.0 ), float( 0.0624 ), float( 0.0374 ) ).mul( 0.362 ) )
      .sub( cieBell( lambdaNm, float( 501.1 ), float( 0.0490 ), float( 0.0382 ) ).mul( 0.065 ) ).toVar();
    const Y = cieBell( lambdaNm, float( 568.8 ), float( 0.0213 ), float( 0.0247 ) ).mul( 0.821 )
      .add( cieBell( lambdaNm, float( 530.9 ), float( 0.0613 ), float( 0.0322 ) ).mul( 0.286 ) ).toVar();
    const Z = cieBell( lambdaNm, float( 437.0 ), float( 0.0845 ), float( 0.0278 ) ).mul( 1.217 )
      .add( cieBell( lambdaNm, float( 459.0 ), float( 0.0385 ), float( 0.0725 ) ).mul( 0.681 ) ).toVar();
    return max( vec3( X, Y, Z ), vec3( 0.0 ) );
  } );

  const xyzToLinearSRGB = Fn( ( [ xyz ] ) => {
    const r = xyz.x.mul( 3.2406 ).sub( xyz.y.mul( 1.5372 ) ).sub( xyz.z.mul( 0.4986 ) ).toVar();
    const g = xyz.x.mul( -0.9689 ).add( xyz.y.mul( 1.8758 ) ).add( xyz.z.mul( 0.0415 ) ).toVar();
    const b = xyz.x.mul( 0.0557 ).sub( xyz.y.mul( 0.2040 ) ).add( xyz.z.mul( 1.0570 ) ).toVar();
    return max( vec3( r, g, b ), vec3( 0.0 ) );
  } );

  const blackbodyRelative = Fn( ( [ lambdaNm, temperatureK ] ) => {
    const c2 = float( 1.4387769e7 );
    const a = c2.div( lambdaNm.mul( temperatureK ) ).toVar();
    const ar = c2.div( temperatureK.mul( 560.0 ) ).toVar();
    const logB = log( lambdaNm ).mul( -5.0 ).sub( log( max( exp( a ).sub( 1.0 ), 1e-6 ) ) ).toVar();
    const logBr = log( float( 560.0 ) ).mul( -5.0 ).sub( log( max( exp( ar ).sub( 1.0 ), 1e-6 ) ) ).toVar();
    return exp( logB.sub( logBr ) );
  } );

  const spectralColor = Fn( ( [ lambdaNm, temperatureK ] ) => {
    return xyzToLinearSRGB( cieXYZ( lambdaNm ) ).mul( blackbodyRelative( lambdaNm, temperatureK ) );
  } );

  const sinc2 = Fn( ( [ x ] ) => {
    const result = float( 1.0 ).toVar();
    If( abs( x ).greaterThanEqual( 1e-4 ), () => {
      const s = sin( x ).div( x ).toVar();
      result.assign( s.mul( s ) );
    } );
    return result;
  } );

  // Eight-step finite power series evaluated by a real TSL shader loop.
  const besselJ = Fn( ( { m, x } ) => {
    // m is always 1..3 here. These are exactly 1!, 2!, and 3!.
    const mFact = select(
      m.equal( int( 1 ) ),
      float( 1.0 ),
      select( m.equal( int( 2 ) ), float( 2.0 ), float( 6.0 ) )
    ).toVar();

    const mf = float( m ).toVar();
    const term = pow( x.mul( 0.5 ), mf ).div( mFact ).toVar();
    const sum = float( term ).toVar();

    Loop( 8, ( { i } ) => {
      const kp1 = float( i ).add( 1.0 ).toVar();
      term.mulAssign(
        x.mul( x ).mul( -0.25 )
          .div( kp1.mul( mf.add( kp1 ) ) )
      );
      sum.addAssign( term );
    } );

    return sum;
  } );

  // Evaluate one physical 1-D phase grating for one incident direction.
  const gratingSpectrum = Fn( ( {
    wi, wo, n, periodicDir, grooveDir, pitchNm, reliefNm,
    coherentLengthUm, azimuthSigma, temperatureK
  } ) => {
    const ndl = max( dot( n, wi ), 0.0 ).toVar();
    const ndv = max( dot( n, wo ), 0.0 ).toVar();
    const q = wi.add( wo ).toVar();
    const qAcross = dot( q, periodicDir ).toVar();
    const qAlong = dot( q, grooveDir ).toVar();
    const coherentLengthNm = max( coherentLengthUm, 0.1 ).mul( 1000.0 ).toVar();
    const rgb = vec3( 0.0 ).toVar();

    If( ndl.greaterThan( 0.0 ).and( ndv.greaterThan( 0.0 ) ), () => {
      Loop( { start: int( 1 ), end: int( 4 ), type: 'int', condition: '<', name: 'm' }, ( { m } ) => {
        const mf = float( m ).toVar();
        const lambdaNm = pitchNm.mul( abs( qAcross ) ).div( mf ).toVar();

        If( lambdaNm.greaterThanEqual( 380.0 ).and( lambdaNm.lessThanEqual( 720.0 ) ), () => {
          const sigmaCoherence = lambdaNm.mul( 0.376 ).div( coherentLengthNm ).toVar();
          const sigmaEff = max(
            sqrt( azimuthSigma.mul( azimuthSigma ).add( sigmaCoherence.mul( sigmaCoherence ) ) ),
            0.0025
          ).toVar();
          const z = qAlong.div( sigmaEff ).toVar();
          const angularDensity = exp( z.mul( z ).mul( -0.5 ) ).div( sigmaEff.mul( 2.50662827463 ) ).toVar();

          const phaseDepth = reliefNm.mul( ndl.add( ndv ) ).mul( 6.283185307179586 ).div( lambdaNm ).toVar();
          const jm = besselJ( { m, x: phaseDepth } ).toVar();
          const orderEfficiency = jm.mul( jm ).toVar();
          const fresnel = pow( float( 1.0 ).sub( ndl ), 5.0 ).mul( 0.16 ).add( 0.84 ).toVar();
          const mm1 = mf.sub( 1.0 ).toVar();
          const blaze = exp( mm1.mul( mm1 ).mul( -0.95 ) ).toVar();
          const weight = orderEfficiency.mul( angularDensity ).mul( fresnel ).mul( blaze ).toVar();

          rgb.addAssign( spectralColor( lambdaNm, temperatureK ).mul( weight ).mul( 0.165 ) );
        } );
      } );
    } );

    return rgb;
  } );

  const physicalDiffractionCard = Fn( ( {
    p, nIn, eye, st, axisXIn, axisYIn,
    lightCenter, lightAxisIn, lightNormalIn, lightHalfLength,
    lightTemperatureK, lightPower, pitchNm, reliefNm,
    coherentLengthUm, azimuthSigma, grooveAngle, gain, starsEnabled
  } ) => {
    const mask = roundedMask( st ).toVar();
    const nGeom = normalize( nIn ).toVar();

    // Stable tangent frame attached to the rotating card object.
    const tx = axisXIn.sub( nGeom.mul( dot( axisXIn, nGeom ) ) ).toVar();
    If( dot( tx, tx ).lessThan( 1e-6 ), () => {
      tx.assign( axisYIn.sub( nGeom.mul( dot( axisYIn, nGeom ) ) ) );
    } );
    tx.assign( normalize( tx ) );
    const ty = normalize( cross( nGeom, tx ) ).toVar();

    const star = starMicrostructure( st ).toVar();
    const starMask = star.x.mul( starsEnabled ).toVar();
    const stripe = stripeMicrostructure( st ).toVar();
    const stripeMask = stripe.x.toVar();

    // Real laminate macro-normal perturbation; the nanometre grating remains analytic.
    const eps = float( 0.0014 );
    const h0 = microSurfaceHeight( st ).toVar();
    const hx = microSurfaceHeight( st.add( vec2( eps, 0.0 ) ) ).toVar();
    const hy = microSurfaceHeight( st.add( vec2( 0.0, eps ) ) ).toVar();
    const dhx = hx.sub( h0 ).div( eps ).toVar();
    const dhy = hy.sub( h0 ).div( eps ).toVar();
    const n = normalize( nGeom.sub( tx.mul( dhx ).mul( 0.72 ) ).sub( ty.mul( dhy ).mul( 0.72 ) ) ).toVar();

    const wo = normalize( eye.sub( p ) ).toVar();
    const ndv = max( dot( n, wo ), 0.0 ).toVar();

    const G = normalize( tx.mul( cos( grooveAngle ) ).add( ty.mul( sin( grooveAngle ) ) ) ).toVar();
    const T = normalize( cross( n, G ) ).toVar();

    const starAngle = grooveAngle.add( star.y ).toVar();
    const GS = normalize( tx.mul( cos( starAngle ) ).add( ty.mul( sin( starAngle ) ) ) ).toVar();
    const TS = normalize( cross( n, GS ) ).toVar();

    const stripeAngle = grooveAngle.add( stripe.y ).toVar();
    const GStripe = normalize( tx.mul( cos( stripeAngle ) ).add( ty.mul( sin( stripeAngle ) ) ) ).toVar();
    const TStripe = normalize( cross( n, GStripe ) ).toVar();

    const lightAxis = normalize( lightAxisIn ).toVar();
    const lightNormal = normalize( lightNormalIn ).toVar();
    const diffracted = vec3( 0.0 ).toVar();

    const lightDistance2 = max( dot( lightCenter, lightCenter ), 0.01 ).toVar();

    // Exactly 21 midpoint samples run in a GPU loop so the TSL node graph
    // stays compact.
    Loop( 21, ( { i } ) => {
      const u = float( i ).add( 0.5 ).div( 21.0 ).toVar();
      const ss = u.mul( 2.0 ).sub( 1.0 ).toVar();
      const sNode = lightHalfLength.mul( ss ).toVar();
      const sourceAnchor = lightCenter.add( lightAxis.mul( sNode ) ).toVar();
      const wi = normalize( sourceAnchor ).toVar();
      const ndl = max( dot( n, wi ), 0.0 ).toVar();
      const emitterCos = max( dot( lightNormal, wi.mul( -1.0 ) ), 0.0 ).toVar();
      const geom = ndl.mul( emitterCos ).div( lightDistance2 ).toVar();

      If( geom.greaterThan( 0.0 ), () => {
        const baseResponse = gratingSpectrum( {
          wi, wo, n, periodicDir: G, grooveDir: T,
          pitchNm, reliefNm, coherentLengthUm, azimuthSigma,
          temperatureK: lightTemperatureK
        } ).toVar();

        const stripeResponse = gratingSpectrum( {
          wi, wo, n, periodicDir: GStripe, grooveDir: TStripe,
          pitchNm: pitchNm.mul( stripe.z ),
          reliefNm: reliefNm.mul( stripe.w ),
          coherentLengthUm: coherentLengthUm.mul( 1.95 ),
          azimuthSigma: azimuthSigma.mul( 0.58 ),
          temperatureK: lightTemperatureK
        } ).toVar();

        const starResponse = gratingSpectrum( {
          wi, wo, n, periodicDir: GS, grooveDir: TS,
          pitchNm: pitchNm.mul( star.z ),
          reliefNm: reliefNm.mul( star.w ),
          coherentLengthUm: coherentLengthUm.mul( 1.55 ),
          azimuthSigma: azimuthSigma.mul( 0.62 ),
          temperatureK: lightTemperatureK
        } ).toVar();

        const opticalResponse = baseResponse.mul( 0.018 )
          .add( stripeResponse.mul( stripeMask ) )
          .add( starResponse.mul( starMask ).mul( 1.10 ) ).toVar();

        diffracted.addAssign( opticalResponse.mul( geom ) );
      } );
    } );

    diffracted.mulAssign( lightHalfLength.mul( 2.0 ).div( 21.0 ).mul( lightPower ).mul( gain ) );

    // Smooth laminate zero-order reflection.
    const toCenter = normalize( lightCenter.sub( p ) ).toVar();
    const h = normalize( toCenter.add( wo ) ).toVar();
    const ndh = max( dot( n, h ), 0.0 ).toVar();
    const ndlCenter = max( dot( n, toCenter ), 0.0 ).toVar();
    const clearF = pow( float( 1.0 ).sub( ndv ), 5.0 ).mul( 0.955 ).add( 0.045 ).toVar();
    const clearSpec = pow( ndh, 135.0 ).mul( ndlCenter ).mul( clearF.mul( 1.55 ).add( 0.22 ) ).toVar();
    const clearcoat = vec3( 1.0, 0.985, 0.97 ).mul( clearSpec ).mul( 0.32 ).toVar();

    const color = max( diffracted.add( clearcoat ), vec3( 0.0 ) ).toVar();
    const outColor = vec4( 0.0 ).toVar();

    // Keep the rounded-card boundary as an early-out.
    If( mask.greaterThan( 0.001 ), () => {
      outColor.assign( vec4( color, mask ) );
    } );

    return outColor;
  } );

  const cardH = 6.45;
  const cardW = cardH * (1024 / 1536);
  const geometry = new THREE.PlaneGeometry(cardW, cardH, 1, 1);

  const material = new THREE.MeshBasicNodeMaterial();
  material.side = THREE.DoubleSide;
  material.transparent = true;
  material.depthWrite = true;
  material.colorNode = physicalDiffractionCard({
    p: positionWorld,
    nIn: normalWorld,
    eye: cameraPosition,
    st: uv(),
    axisXIn: uAxisX,
    axisYIn: uAxisY,
    lightCenter: uLightCenter,
    lightAxisIn: uLightAxis,
    lightNormalIn: uLightNormal,
    lightHalfLength: uLightHalfLen,
    lightTemperatureK: uLightTempK,
    lightPower: uLightPower,
    pitchNm: uPitchNm,
    reliefNm: uReliefNm,
    coherentLengthUm: uCoherenceUm,
    azimuthSigma: uAzimuthSigma,
    grooveAngle: uGrooveAngle,
    gain: uGain,
    starsEnabled: uStarsEnabled
  });

  const cardGroup = new THREE.Group();

  const artMaterial = new THREE.MeshPhysicalMaterial({
    map: cardArtTexture,
    emissiveMap: cardArtTexture,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.82,
    alphaMap: roundedAlphaTexture,
    transparent: true,
    alphaTest: 0.02,
    side: THREE.DoubleSide,
    roughness: 0.58,
    metalness: 0.0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.62
  });
  const artCard = new THREE.Mesh(geometry, artMaterial);
  artCard.position.z = -0.006;
  cardGroup.add(artCard);

  // Add radiance instead of alpha-compositing a fake foil decal. Black contributes
  // nothing; high-energy diffraction can exceed 1.0 and is handled by tone mapping.
  material.blending = THREE.AdditiveBlending;
  material.premultipliedAlpha = false;
  material.depthWrite = false;
  const card = new THREE.Mesh(geometry, material);
  card.position.z = 0.006;
  cardGroup.add(card);

  // Physical thickness/backing, separate from the optical front-face model.
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(cardW*0.996, cardH*0.996, 0.065),
    new THREE.MeshStandardMaterial({ color:0x111014, roughness:0.52, metalness:0.08 })
  );
  back.position.z = -0.042;
  cardGroup.add(back);

  // Initial object orientation. This is a static transform, not a shader animation.
  const initialRotation = new THREE.Euler(-0.18, 0.25, -0.035, 'XYZ');
  cardGroup.rotation.copy(initialRotation);

  // Update tangent axes from the actual object transform every frame.
  const worldQ = new THREE.Quaternion();
  const ax = new THREE.Vector3();
  const ay = new THREE.Vector3();
  function updateObjectFrame() {
    card.getWorldQuaternion(worldQ);
    ax.set(1,0,0).applyQuaternion(worldQ).normalize();
    ay.set(0,1,0).applyQuaternion(worldQ).normalize();
    uAxisX.value.copy(ax);
    uAxisY.value.copy(ay);
  }

  return {
    group: cardGroup,
    card,
    artCard,
    backing: back,
    material,
    artMaterial,
    initialRotation,
    uniforms: {
      pitchNm: uPitchNm,
      reliefNm: uReliefNm,
      coherenceUm: uCoherenceUm,
      azimuthSigma: uAzimuthSigma,
      grooveAngle: uGrooveAngle,
      gain: uGain,
      starsEnabled: uStarsEnabled,
      lightCenter: uLightCenter,
      lightAxis: uLightAxis,
      lightNormal: uLightNormal,
      lightHalfLength: uLightHalfLen,
      lightTemperatureK: uLightTempK,
      lightPower: uLightPower,
    },
    updateObjectFrame,
    resetRotation() {
      cardGroup.rotation.copy(initialRotation);
      updateObjectFrame();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      artMaterial.dispose();
      back.geometry.dispose();
      back.material.dispose();
      roundedAlphaTexture.dispose();
    },
  };
}
