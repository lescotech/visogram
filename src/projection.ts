/**
 * The one place that knows how the Lesco Viewer's camera convention maps onto a
 * three.js sphere. Both renderers on this page — the hero's slideshow and the
 * in-page tour viewer — read it from here, and `tools/reproject.mjs` is its
 * Node-side twin.
 *
 * The viewer's shader samples `u = atan2(d.x, -d.z) / 2pi + 0.5` along a ray
 * matrix built by `raioDeTela`, which negates its third column — so the centre
 * ray at yaw 0 is -Z, not +Z, and lands on `u = 0.5`. In general the viewer
 * centres `u = 0.5 - yaw/2pi`; note that its yaw grows towards *lower* u.
 *
 * Three's SphereGeometry lays out `x = -cos(2pi·u)`, `z = sin(2pi·u)`, and
 * mirroring it to face inwards flips x, so a mesh rotation of `t` centres
 * `u = t/2pi - 0.25`. Equating the two gives `t = 1.5pi - yaw`.
 *
 * Which leaves two equivalent ways to frame a scene, and this page uses both:
 *
 * - **Turn the sphere** (`hero/panorama.ts`): `mesh.rotation.y = YAW_ORIGIN -
 *   yaw`, camera level. Two spheres can then hold different tours at different
 *   headings and cross-fade between them.
 * - **Turn the camera** (`tour/viewer.ts`): `mesh.rotation.y = YAW_ORIGIN` and
 *   `camera.rotation.y = yaw`, which centres the same `u`, because rotating the
 *   camera by `+y` shows what rotating the sphere by `-y` would. One camera then
 *   carries the visitor's heading across a scene change.
 *
 * Missing that negation the first time put every slide half a turn out. The
 * probe at /pano-check.html can only confirm this maths is self-consistent, not
 * that the convention it targets is the right one — check against the viewer.
 */
export const YAW_ORIGIN = 1.5 * Math.PI;
