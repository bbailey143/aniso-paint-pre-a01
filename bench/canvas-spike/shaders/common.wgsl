// Shared declarations, prepended to every pass at pipeline-build time.
// Contains no bindings — each pass declares its own from binding 0 upward,
// so wgpu can derive the layout automatically.

struct Params {
    grid:            u32,
    frame:           u32,
    bots_active:     u32,
    relax_iters:     u32,

    dt:              f32,
    viscosity:       f32,
    drag:            f32,
    dry_rate:        f32,

    evap_rate:       f32,
    gravity_x:       f32,
    gravity_y:       f32,
    cos_alpha:       f32,

    edge_eta:        f32,
    paper_influence: f32,
    time:            f32,
    bot_count:       f32,

    // Pigment library, 8 slots: (rho density, omega staining, gamma granulation, pad)
    // Card 3. Cells store amounts; the library stores behaviour. Never blur this.
    pig: array<vec4<f32>, 8>,
};

const WET_EPS: f32 = 1.0e-5;

fn oob(c: vec2<i32>, n: i32) -> bool {
    return c.x < 0 || c.y < 0 || c.x >= n || c.y >= n;
}
