/**
 * How much of fully-lit seabed radiance comes from the sun rather than from
 * sky ambient and the mean caustic lift. Ripples and caustics modulate only
 * that share: in a structure's shadow there is no direct light for them to
 * brighten, and letting them do so anyway paints light onto darkness.
 *
 * 1.45 is the measured ratio of lit sand radiance to bare Lambert sun
 * (albedo/π · intensity · sunDirection.y) under this fixed sun and a
 * 0.5-intensity PMREM environment.
 */
const AMBIENT_AND_CAUSTIC_BOOST = 1.45
export const SEABED_DIRECT_SHARE = 1 / AMBIENT_AND_CAUSTIC_BOOST
