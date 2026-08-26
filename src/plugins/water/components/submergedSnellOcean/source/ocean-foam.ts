import { dot, float, max, mix, normalize, pow, smoothstep, vec2, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { fbm2, valueNoise2 } from './noise'
import { skyRadiance } from './sky-radiance'
import { sunColorUniform, sunDirectionUniform } from './sun'
import type { SeaState } from './ocean-spectrum'
import {
  WAKE_FOAM_CENTER_X,
  WAKE_FOAM_CENTER_Z,
  WAKE_FOAM_SIZE,
  type WakeFoamMap,
} from './wake-foam-map'

/**
 * Above-water sea foam, as four coverage populations feeding ONE shading path.
 *
 * The Jacobian whitecap and the vessel wake answer "where did the surface just
 * fold"; they are instantaneous and they are already correct. What a real sea
 * additionally shows is foam that OUTLIVES the fold that made it: a bubble
 * raft that thins, opens into lace, and is swept by Langmuir circulation into
 * long wind-aligned convergence streaks (windrows). That residue is the
 * difference between "waves with whitecaps" and "an ocean", and it cannot come
 * from the cascades — the FFT patches tile, so nothing world-anchored and
 * long-lived can live inside them — the same finding the wake field records.
 *
 * It is modelled here statistically rather than simulated: windrows are a
 * quasi-stationary property of a sustained wind (8.5 m/s in the default sea
 * state), continuously fed by intermittent breaking, so a slowly drifting
 * anisotropic field is the honest representation of their steady state — not a
 * decoration standing in for one. The instantaneous sim still owns everything
 * instantaneous: the raft tail rides the Jacobian's own recovery band, and the
 * streaks thicken where the surface horizontally converges.
 *
 * Every band is sampled at the UNDISPLACED world XZ, the convention shared by
 * the Jacobian channel and the wake field, so all four populations slosh with
 * the same horizontal chop and ride displacement exactly.
 */

/**
 * Langmuir windrow geometry: convergence lines lie within a few degrees of the
 * wind, repeat every ~10-20 m at this wind speed, and stay coherent for many
 * band spacings downwind.
 */
const WINDROW_SPACING = 12.5
const WINDROW_LENGTH = 95
const WINDROW_BREAKUP_SPACING = 3.8
const WINDROW_BREAKUP_LENGTH = 24
/** Wind-driven surface drift is ~3% of wind speed; the raft rides it downwind. */
const DRIFT_FRACTION = 0.03
/**
 * Breaking is intermittent and gusty, so windrow foam lives in slowly drifting
 * regions instead of covering the whole sea. These two scales are the gust
 * envelope; they also gate crest tear, which is the same physical cause.
 */
const GUST_SCALE = 165
const GUST_DETAIL_SCALE = 58
/** Bubble microrelief: cells per metre, and its slope strength. */
const RELIEF_FREQUENCY = 3.1
const RELIEF_STRENGTH = 0.35

/**
 * The art-direction knobs, all in one place — how MUCH foam, never where.
 * Everything else in this file is geometry or physics. Raising any of these
 * only makes its population denser; none of them can move a population onto
 * water that is not converging, breaking, or downwind of something that was.
 */
/** Selects the top of the band field: how much of the sea a windrow occupies. */
const WINDROW_LINE_THRESHOLD = [0.6, 0.88] as const
/** Selects gust regions out of the envelope field. */
const GUST_THRESHOLD = [0.44, 0.8] as const
/** Peak coverage of a fully fed convergence line, before lace erosion. */
const WINDROW_COVERAGE = 0.85
/**
 * Fold-history band read as a thinning raft rather than as bare water. The
 * whitecap itself owns [-0.05, 0.26]; this is the recovery tail immediately
 * above it. Keep it NARROW: the Jacobian hovers near 1 over most of a gentle
 * sea, so widening this carpets the surface instead of trailing the breakers.
 */
const RAFT_TAIL_BAND = [0.26, 0.66] as const
/** Raft coverage off a convergence line, and the extra it gains on one. */
const RAFT_BASE_COVERAGE = 0.45
const RAFT_LINE_COVERAGE = 0.55
/** Crest band, in the metres the body palette's -1.7..1.5 m response pins. */
const CREST_TEAR_BAND = [0.55, 1.35] as const
/** Peak coverage of wind-torn crest froth inside a gust patch. */
const CREST_COVERAGE = 0.55

export interface OceanFoamInputs {
  /** The sim's own sea state — wind axis and speed drive the streak frame. */
  sea: SeaState
  time: Node<'float'>
  /** Undisplaced world XZ. */
  worldXZ: Node<'vec2'>
  /** min(cascade0.w, cascade1.w) fold history from the sim. */
  jacobianHistory: Node<'float'>
  /** Displaced height after the cascade-0 above-water footprint keep (m). */
  crestHeight: Node<'float'>
  /** |slope| of the above-water optical normal. */
  steepness: Node<'float'>
  /** -(dDx/dx + dDz/dz): positive where the surface horizontally converges. */
  convergence: Node<'float'>
  /** Metres of surface per output pixel — the shared spectral LOD measure. */
  pixelFootprint: Node<'float'>
  /** Detailed-sheet edge keep: the handoff every body-color term must use. */
  edgeKeep: Node<'float'>
  /** Capillary-enriched above-water normal. */
  normal: Node<'vec3'>
  /** Surface -> camera unit vector. */
  viewDir: Node<'vec3'>
  /** The shaded water beneath: a thin raft is translucent, not white paint. */
  waterRadiance: Node<'vec3'>
  /** Sun visibility at this fragment; foam must go grey inside a cast shadow. */
  sunShadow: Node<'float'>
  wakeFoam?: WakeFoamMap | null
}

export interface OceanFoam {
  /** 0..1 coverage the surface lerps toward `color`. */
  mask: Node<'float'>
  /** Shaded foam radiance, graded from translucent raft to dense froth. */
  color: Node<'vec3'>
  /** Coverage diagnostic: R dense whitecap/wake, G windrow raft, B crest tear. */
  debug: Node<'vec3'>
}

export function createOceanFoam(inputs: OceanFoamInputs): OceanFoam {
  const { sea, time, worldXZ, pixelFootprint, edgeKeep } = inputs
  const sunDir = sunDirectionUniform

  // ── Wind frame ─────────────────────────────────────────────────────────
  // Same azimuth convention as the spectrum (theta = atan2(kz, kx), measured
  // from +x toward +z), so streaks run along the direction the waves travel
  // and therefore cut ACROSS the crest lines, as they do at sea. The raft is
  // nearly stationary while waves roll through it — phase speed vastly exceeds
  // drift — so the field advects only at the surface drift, never at the wave
  // speed. That is why foam reads as floating rather than painted on.
  const alongAxis = vec2(Math.cos(sea.windAzimuth), Math.sin(sea.windAzimuth))
  const acrossAxis = vec2(-Math.sin(sea.windAzimuth), Math.cos(sea.windAzimuth))
  const drift = time.mul(sea.windSpeed * DRIFT_FRACTION)
  const along = dot(worldXZ, alongAxis).sub(drift)
  const across = dot(worldXZ, acrossAxis)

  // ── Windrow convergence lines ──────────────────────────────────────────
  // Each band fades to its OWN MEAN, never to zero. A band that fades to zero
  // changes how much foam a distant patch of sea carries, which makes the
  // horizon brighten or darken with camera height; fading to the mean loses
  // detail while conserving coverage, which is the correct footprint LOD for
  // an albedo term. Windrows survive far past the ~1 m bubble lace precisely
  // because their own structure is 12 m wide, so their keep is authored
  // against that scale rather than borrowed from the lace.
  const bandCoarse = valueNoise2(
    vec2(across.div(WINDROW_SPACING), along.div(WINDROW_LENGTH)),
  )
  const bandFine = valueNoise2(
    vec2(
      across.div(WINDROW_BREAKUP_SPACING),
      along.div(WINDROW_BREAKUP_LENGTH),
    ).add(vec2(19.7, 4.3)),
  )
  const bandKeep = float(1).sub(smoothstep(3.0, 7.0, pixelFootprint))
  const breakupKeep = float(1).sub(smoothstep(0.9, 2.2, pixelFootprint))
  const bandField = mix(float(0.5), bandCoarse, bandKeep).add(
    bandFine.sub(0.5).mul(0.5).mul(breakupKeep),
  )
  // Past the coarse keep the field IS 0.5, which sits below this threshold, so
  // windrow coverage retires to exactly zero on its own. No second distance
  // fade is needed and none may be added — it would double-count the handoff.
  const convergenceLines = smoothstep(
    WINDROW_LINE_THRESHOLD[0],
    WINDROW_LINE_THRESHOLD[1],
    bandField,
  )

  // ── Gust envelope ──────────────────────────────────────────────────────
  const gustCoarse = valueNoise2(
    vec2(across.div(GUST_SCALE), along.div(GUST_SCALE * 1.7)).add(vec2(7.1, 2.9)),
  )
  const gustFine = valueNoise2(
    vec2(across.div(GUST_DETAIL_SCALE), along.div(GUST_DETAIL_SCALE * 1.5)).add(
      vec2(31.4, 12.8),
    ),
  )
  const gustKeep = float(1).sub(smoothstep(9.0, 20.0, pixelFootprint))
  const gustField = gustCoarse.add(gustFine.sub(0.5).mul(0.6).mul(gustKeep))
  const gustPatch = smoothstep(GUST_THRESHOLD[0], GUST_THRESHOLD[1], gustField)

  // Floating foam accumulates where the surface horizontally CONVERGES — the
  // same displacement divergence the Jacobian is built from. This is what
  // keeps a world-anchored raft from reading as a decal: it thickens in the
  // compression zones ahead of each crest and thins where the surface
  // stretches. The derivatives already carry the cascade footprint keeps, so
  // at range this settles to a constant and cannot alias.
  const gather = smoothstep(-0.25, 0.25, inputs.convergence).mul(0.7).add(0.35)

  const windrow = convergenceLines
    .mul(gustPatch)
    .mul(gather)
    .mul(WINDROW_COVERAGE)

  // ── Raft tail behind a collapsing whitecap ─────────────────────────────
  // The sim's foam history recovers in about a second, so a whitecap currently
  // stops existing the moment the fold does. Read the band just above the
  // whitecap threshold as a thinning raft instead of as bare water, and let
  // the convergence lines decide where it survives longest.
  const raftTail = float(1).sub(
    smoothstep(RAFT_TAIL_BAND[0], RAFT_TAIL_BAND[1], inputs.jacobianHistory),
  )
  const raft = raftTail.mul(
    convergenceLines.mul(RAFT_LINE_COVERAGE).add(RAFT_BASE_COVERAGE),
  )

  // ── Wind-torn crest froth ──────────────────────────────────────────────
  // Breaking begins before the horizontal Jacobian folds, and at this
  // amplitude genuine folds are rare, so the tallest crests inside a gust
  // carry a whisper of froth the fold test never sees. Gated on HEIGHT, whose
  // range is pinned by the body palette's own -1.7..1.5 m response, rather
  // than on an absolute slope threshold this sea state cannot calibrate;
  // steepness only modulates, so it can never become a hard on/off.
  const crestTear = smoothstep(
    CREST_TEAR_BAND[0],
    CREST_TEAR_BAND[1],
    inputs.crestHeight,
  )
    .mul(smoothstep(0.1, 0.42, inputs.steepness).mul(0.65).add(0.35))
    .mul(gustPatch)
    .mul(CREST_COVERAGE)

  // ── Dense population: the existing Jacobian whitecap + vessel wake ──────
  let dense: Node<'float'> = float(1).sub(
    smoothstep(-0.05, 0.26, inputs.jacobianHistory),
  )
  let churn: Node<'float'> = float(0)
  if (inputs.wakeFoam) {
    // Vessel wake joins the SAME whitecap pipeline (coverage -> lace ->
    // foamShade): a property of this surface, never an overlay, so it rides
    // the displaced water exactly. Sampling by the undisplaced worldXZ matches
    // the Jacobian channel, so deposited foam sloshes with the same horizontal
    // chop as the ocean's own whitecaps.
    const wakeUv = worldXZ
      .sub(vec2(WAKE_FOAM_CENTER_X, WAKE_FOAM_CENTER_Z))
      .div(WAKE_FOAM_SIZE)
      .add(0.5)
    const wake = inputs.wakeFoam.foamNode.sample(wakeUv)
    // Residue behaves exactly like whitecap coverage — the shared lace
    // multiply opens holes in it as it decays. Fresh churn adds the near-solid
    // froth core right behind the hull.
    dense = max(dense, smoothstep(0.02, 0.6, wake.g))
    churn = smoothstep(0.1, 0.75, wake.r)
  }

  // Thin populations combine by max(), never add — the same rule the wake
  // field uses for its deposits. Overlapping raft and streak refresh each
  // other; they cannot stack into a brighter patch than either can reach.
  // edgeKeep, not distance: this term changes the body color, and a distance
  // handoff matches the palette-only skirt at deck height while leaving a
  // bright ring at the seam for an elevated camera.
  const thin = max(max(windrow, raft), crestTear).mul(edgeKeep).clamp(0, 1)

  // ── Lace ───────────────────────────────────────────────────────────────
  const bubbleA = fbm2(worldXZ.mul(0.9).add(vec2(0.13, 0.07).mul(time)))
  const bubbleB = fbm2(worldXZ.mul(1.7).sub(vec2(0.11, 0.05).mul(time)))
  const foamKeep = float(1).sub(smoothstep(0.25, 0.8, pixelFootprint))
  // Thin foam is a raft with holes in it, so it erodes harder than dense
  // froth — but its lace fades to the lace's MEAN, not to zero, for the same
  // conservation reason as the bands above: a distant windrow must keep its
  // coverage and lose only its texture.
  const thinLace = mix(
    float(0.46),
    smoothstep(0.26, 0.7, bubbleA.mul(0.65).add(bubbleB.mul(0.35))),
    foamKeep,
  )

  const denseMask = dense
    .mul(bubbleA.mul(bubbleB).mul(1.7).add(0.06))
    .add(churn.mul(bubbleA.mul(0.45).add(0.62)))
    .mul(foamKeep)
    .clamp(0, 1)
  const thinMask = thin.mul(thinLace)
  const mask = denseMask.add(thinMask).clamp(0, 1)
  // Grade thickness by which population OWNS the pixel, not by absolute
  // coverage: a half-covered whitecap is still froth, and dividing by the
  // total is what guarantees that a pixel with no raft on it shades exactly
  // as it did before this file existed.
  const thickShare = denseMask.div(denseMask.add(thinMask).max(1e-4)).clamp(0, 1)

  // ── Shading ────────────────────────────────────────────────────────────
  // Foam is a raft of bubbles, not a lambert decal: perturb the normal by the
  // gradient of a small-scale field so the froth lights with its own highlights
  // and shaded pits. The perturbation fades to zero below the pixel footprint,
  // at which point this returns EXACTLY the smooth-normal result — distant
  // whitecaps are unchanged, near ones gain relief.
  const reliefUv = worldXZ.mul(RELIEF_FREQUENCY).add(vec2(0.05, -0.09).mul(time))
  const reliefCenter = valueNoise2(reliefUv)
  const reliefSlope = vec2(
    valueNoise2(reliefUv.add(vec2(0.14, 0))).sub(reliefCenter),
    valueNoise2(reliefUv.add(vec2(0, 0.14))).sub(reliefCenter),
  ).div(0.14)
  const reliefKeep = float(1).sub(smoothstep(0.06, 0.2, pixelFootprint))
  const foamNormal = normalize(
    inputs.normal.add(
      vec3(reliefSlope.x, 0, reliefSlope.y).mul(reliefKeep.mul(RELIEF_STRENGTH)),
    ),
  )
  const foamNoL = max(dot(foamNormal, sunDir), 0.0)

  // Sky ambient survives a cast shadow; the sun's share does not. Foam is the
  // brightest thing on the water, so leaving it lit would punch white holes
  // through any shadow crossing a whitecap.
  const foamAmbient = skyRadiance(foamNormal, float(0)).mul(0.22)
  const denseShade = foamAmbient.add(
    sunColorUniform
      .mul(foamNoL.mul(0.9).add(0.3))
      .mul(0.9)
      .mul(inputs.sunShadow),
  )

  // A thin raft transmits: the water beneath still shows through, and sunlight
  // crossing the bubble layer scatters forward toward a viewer facing the sun.
  // Only thick froth reads as the near-white sheet the whitecap term shades,
  // so opacity rises with the raft's own density.
  const thinOpacity = thin.mul(0.45).add(0.42)
  const throughScatter = pow(max(dot(inputs.viewDir, sunDir.negate()), 0.0), 3.0)
    .mul(float(1).sub(thinOpacity))
    .mul(0.4)
  const thinShade = mix(inputs.waterRadiance, denseShade, thinOpacity).add(
    sunColorUniform.mul(throughScatter).mul(inputs.sunShadow),
  )

  return {
    mask,
    color: mix(thinShade, denseShade, thickShare),
    debug: vec3(
      denseMask,
      max(windrow, raft).mul(edgeKeep),
      crestTear.mul(edgeKeep),
    ),
  }
}
