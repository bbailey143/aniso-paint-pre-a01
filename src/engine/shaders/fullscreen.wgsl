// P1 placeholder surface: a fullscreen triangle with a faint centre-lit wash, so
// there is a visible "sheet" and we have proven WGSL compiles and a render
// pipeline draws. Replaced by the Composite + Light pass in P3.

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  // Single oversized triangle covering the viewport.
  var p = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(-1.0,  1.0),
    vec2f( 3.0,  1.0),
  );
  let xy = p[vi];
  var out: VsOut;
  out.pos = vec4f(xy, 0.0, 1.0);
  out.uv = xy * 0.5 + 0.5;      // 0..1 across the screen
  return out;
}

struct Frame {
  resolution: vec2f,
  time: f32,
  _pad: f32,
};
@group(0) @binding(0) var<uniform> frame: Frame;

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  // Aspect-correct radial falloff from centre — a soft studio light on paper.
  let aspect = frame.resolution.x / max(frame.resolution.y, 1.0);
  var d = in.uv - vec2f(0.5, 0.5);
  d.x *= aspect;
  let r = length(d);
  let lit = smoothstep(0.9, 0.0, r);           // brighter at centre
  let base = vec3f(0.043, 0.047, 0.055);        // near var(--bg)
  let paper = vec3f(0.10, 0.105, 0.12);
  let col = mix(base, paper, lit * 0.6);
  return vec4f(col, 1.0);
}
