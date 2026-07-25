//! Canvas contract feasibility bench.
//!
//! One question: does the wet band of the cell schema, at the D7 wetness
//! budget, fit inside a 16.7 ms frame — and does it conserve water and pigment
//! while it does?
//!
//! Headless on purpose. No window, no brush, no render engine. Those are other
//! specs. Dragging them in here would mean measuring them by accident.
//!
//! Run shape: bots paint for a while to build a live wet canvas, then lift off.
//! With the bots off and evaporation at zero, every gauge must hold flat. Drift
//! means the flux formula is not symmetric, and nothing downstream can be
//! trusted until it is.

use std::time::Instant;
use wgpu::util::DeviceExt;

const WORKGROUP: u32 = 8;
const REDUCE_WG: u32 = 16;
const NQ: usize = 13;
const FRAME_BUDGET_MS: f64 = 16.7;

#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct Params {
    grid: u32,
    frame: u32,
    bots_active: u32,
    relax_iters: u32,

    dt: f32,
    viscosity: f32,
    drag: f32,
    dry_rate: f32,

    evap_rate: f32,
    gravity_x: f32,
    gravity_y: f32,
    cos_alpha: f32,

    edge_eta: f32,
    paper_influence: f32,
    time: f32,
    bot_count: f32,

    // (rho density, omega staining, gamma granulation, pad) — Card 3.
    pig: [[f32; 4]; 8],
}

struct Cfg {
    grid: u32,
    relax: u32,
    frames: u32,
    settle_at: u32,
    bots: f32,
    evap: f32,
    /// C97 uses an adaptive step, dt = 1/ceil(max|u|,|v|), so nothing moves more
    /// than one cell. A fixed 1.0 is the CFL limit with no margin at all.
    dt: f32,
    dump: bool,
    /// 0 = half everywhere (D8 as written)
    /// 1 = split: the accumulating water fields (h_f, s, pressure) at f32,
    ///     pigment left at half. The candidate fix.
    /// 2 = full f32. A control, not a shipping option.
    prec: u8,
    /// Adapt the relaxation count to the measured divergence residual instead
    /// of always burning C97's maximum of 50.
    adaptive: bool,
    /// Run the gauges after every water-touching pass on one frame and print
    /// the running total. Parameter-level bisection narrowed the leak; this
    /// says which pass it actually walks in on.
    probe: i64,
}

fn parse_cfg() -> Cfg {
    let mut c = Cfg {
        grid: 1024,
        relax: 50,
        frames: 600,
        settle_at: 240,
        bots: 12.0,
        evap: 0.0,
        dt: 1.0,
        dump: true,
        prec: 0,
        adaptive: false,
        probe: -1,
    };
    if std::env::args().any(|s| s == "--f32") { c.prec = 2; }
    if std::env::args().any(|s| s == "--adaptive") { c.adaptive = true; }
    let a: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i + 1 < a.len() {
        let v = &a[i + 1];
        match a[i].as_str() {
            "--grid" => c.grid = v.parse().unwrap_or(c.grid),
            "--relax" => c.relax = v.parse().unwrap_or(c.relax),
            "--frames" => c.frames = v.parse().unwrap_or(c.frames),
            "--settle-at" => c.settle_at = v.parse().unwrap_or(c.settle_at),
            "--bots" => c.bots = v.parse().unwrap_or(c.bots),
            "--evap" => c.evap = v.parse().unwrap_or(c.evap),
            "--dt" => c.dt = v.parse().unwrap_or(c.dt),
            "--dump" => c.dump = v != "0",
            "--probe" => c.probe = v.parse().unwrap_or(-1),
            "--precision" => {
                c.prec = match v.as_str() {
                    "half" => 0,
                    "split" => 1,
                    "full" => 2,
                    _ => c.prec,
                }
            }
            _ => {}
        }
        i += 2;
    }
    c
}

struct Ping {
    view: [wgpu::TextureView; 2],
    tex: [wgpu::Texture; 2],
}

fn make_ping(dev: &wgpu::Device, n: u32, fmt: wgpu::TextureFormat, label: &str) -> Ping {
    let mk = |i: usize| {
        dev.create_texture(&wgpu::TextureDescriptor {
            label: Some(&format!("{label}{i}")),
            size: wgpu::Extent3d {
                width: n,
                height: n,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: fmt,
            usage: wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::STORAGE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        })
    };
    let t0 = mk(0);
    let t1 = mk(1);
    let v0 = t0.create_view(&Default::default());
    let v1 = t1.create_view(&Default::default());
    Ping {
        view: [v0, v1],
        tex: [t0, t1],
    }
}

/// Same reason as `tsw` below: the borrow has to be nameable, so this is a
/// function and not the obvious closure.
fn tex(v: &wgpu::TextureView) -> wgpu::BindingResource<'_> {
    wgpu::BindingResource::TextureView(v)
}

/// Timestamp writes for one pass. A free function rather than a closure — a
/// closure cannot name the lifetime tying the returned struct to the query set.
fn tsw(q: Option<&wgpu::QuerySet>, i: u32) -> Option<wgpu::ComputePassTimestampWrites<'_>> {
    q.map(|qs| wgpu::ComputePassTimestampWrites {
        query_set: qs,
        beginning_of_pass_write_index: Some(i * 2),
        end_of_pass_write_index: Some(i * 2 + 1),
    })
}

fn make_pipeline(
    dev: &wgpu::Device,
    common: &str,
    src: &str,
    label: &str,
    fw: &str,
    fp: &str,
) -> wgpu::ComputePipeline {
    let src = src.replace("FMT_WATER", fw).replace("FMT_PIG", fp);
    let full = format!("{common}\n{src}");
    let module = dev.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some(label),
        source: wgpu::ShaderSource::Wgsl(full.into()),
    });
    dev.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some(label),
        layout: None,
        module: &module,
        entry_point: "main",
        compilation_options: Default::default(),
        cache: None,
    })
}

fn main() {
    let cfg = parse_cfg();
    pollster::block_on(run(cfg));
}

const PASS_NAMES: [&str; 11] = [
    "brush_bots",
    "update_velocities",
    "relax_divergence",
    "flow_outward",
    "flux_compute",
    "flux_apply_pigment",
    "flux_apply_water",
    "transfer_pigment",
    "capillary_flow",
    "dry_tick",
    "reduce",
];

async fn run(cfg: Cfg) {
    let n = cfg.grid;
    let groups = (n + WORKGROUP - 1) / WORKGROUP;
    let rgroups = (n + REDUCE_WG - 1) / REDUCE_WG;
    let nwg = (rgroups * rgroups) as usize;

    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::PRIMARY,
        ..Default::default()
    });
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        })
        .await
        .expect("no GPU adapter found");

    let info = adapter.get_info();
    let ts_ok = adapter
        .features()
        .contains(wgpu::Features::TIMESTAMP_QUERY);

    // rgba32float is not filterable by default, and the auto-derived bind group
    // layout asks for a filterable float. Only needed for the --f32 control.
    let mut feats = wgpu::Features::empty();
    if ts_ok { feats |= wgpu::Features::TIMESTAMP_QUERY; }
    if cfg.prec >= 1 {
        if !adapter.features().contains(wgpu::Features::FLOAT32_FILTERABLE) {
            panic!("f32 fields need FLOAT32_FILTERABLE, which this adapter does not expose");
        }
        feats |= wgpu::Features::FLOAT32_FILTERABLE;
    }

    let (device, queue) = adapter
        .request_device(
            &wgpu::DeviceDescriptor {
                label: Some("canvas-spike"),
                required_features: feats,
                required_limits: wgpu::Limits::default(),
                memory_hints: Default::default(),
            },
            None,
        )
        .await
        .expect("device request failed");

    println!("== canvas contract feasibility bench ==");
    println!("adapter      : {} ({:?}, {:?})", info.name, info.device_type, info.backend);
    println!("grid         : {n} x {n}  ({} cells wet)", n as u64 * n as u64);
    println!("relax iters  : {}{}", cfg.relax, if cfg.adaptive { " (max, adaptive)" } else { " (fixed)" });
    println!("precision    : water {} / pigment {}",
        if cfg.prec >= 1 { "f32" } else { "f16" },
        if cfg.prec >= 2 { "f32" } else { "f16" });
    println!("gpu timing   : {}", if ts_ok { "timestamp queries" } else { "UNAVAILABLE - wall clock only" });

    // ---- resources -------------------------------------------------------
    let wide = |on: bool| if on { wgpu::TextureFormat::Rgba32Float } else { wgpu::TextureFormat::Rgba16Float };
    // D8 says half-float throughout. The bench can split that: the two fields
    // that accumulate every frame (h_f, s) get f32 while pigment stays f16.
    let water_f32 = cfg.prec >= 1;
    let pig_f32 = cfg.prec >= 2;
    let fmt_w = wide(water_f32);
    let fmt_p = wide(pig_f32);
    let fw = if water_f32 { "rgba32float" } else { "rgba16float" };
    let fp = if pig_f32 { "rgba32float" } else { "rgba16float" };
    let f16 = fmt_p;
    // WET0 (M, h_f, u, v) and WET5 (s, w, h_p, flags) carry the two fields that
    // accumulate every frame. Those are the ones that bleed under half-float.
    let wet0 = make_ping(&device, n, fmt_w, "wet0_");
    let wet5 = make_ping(&device, n, fmt_w, "wet5_");
    let press = make_ping(&device, n, fmt_w, "press_");
    // Pigment. Moved by ratio rather than accumulated directly.
    let wet1 = make_ping(&device, n, fmt_p, "wet1_");
    let wet2 = make_ping(&device, n, fmt_p, "wet2_");
    let wet3 = make_ping(&device, n, fmt_p, "wet3_");
    let wet4 = make_ping(&device, n, fmt_p, "wet4_");

    let paper_tex = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("paper"),
        size: wgpu::Extent3d { width: n, height: n, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: f16,
        usage: wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::STORAGE_BINDING
            | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let paper = paper_tex.create_view(&Default::default());

    // Dry band and baked floor. Never touched by the wet passes, but allocated
    // so the reported VRAM figure is the honest one from §2.6 rather than the
    // wet band alone.
    // 60 bytes/cell: baked floor plus both live dry layers, 30 half-floats.
    // (The §4.1 estimate of 30-40 undercounts a twice-glazed tile — see §11.)
    // Clamped to the device's single-buffer ceiling; a real implementation
    // pages this per tile rather than holding one slab.
    let dry_bytes = ((n as u64) * (n as u64) * 60).min(device.limits().max_buffer_size);
    let _dry_ballast = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("dry+floor ballast"),
        size: dry_bytes,
        usage: wgpu::BufferUsages::STORAGE,
        mapped_at_creation: false,
    });

    let flux = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flux"),
        size: (n as u64) * (n as u64) * 16,
        usage: wgpu::BufferUsages::STORAGE,
        mapped_at_creation: false,
    });

    let partials = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("partials"),
        size: (nwg * NQ * 4) as u64,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });
    let partials_stage = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("partials stage"),
        size: (nwg * NQ * 4) as u64,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    // Pass-level conservation probe. Six snapshots of the gauges taken at
    // points through a single frame, so the total can be watched walking.
    const NPROBE: usize = 6;
    const PROBE_NAMES: [&str; NPROBE] = [
        "after brush_bots",
        "after update_velocities",
        "after relax",
        "after flux_apply_water",
        "after capillary_flow",
        "after dry_tick",
    ];
    let psize = (nwg * NQ * 4) as u64;
    let probe_buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("probe"),
        size: psize * NPROBE as u64,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let probe_stage = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("probe stage"),
        size: psize * NPROBE as u64,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    // Card 3 transport parameters. Ultramarine granulates hardest; burnt umber
    // stains hardest; hansa yellow barely granulates at all.
    let pig: [[f32; 4]; 8] = [
        [0.55, 3.0, 0.91, 0.0], // french ultramarine
        [0.20, 9.3, 0.40, 0.0], // burnt umber
        [0.16, 5.5, 0.24, 0.0], // quinacridone rose
        [0.24, 7.0, 0.55, 0.0], // indian red
        [0.12, 2.2, 0.08, 0.0], // hansa yellow
        [0.14, 2.6, 0.14, 0.0], // brilliant orange
        [0.30, 4.1, 0.62, 0.0], // cerulean
        [0.18, 4.8, 0.20, 0.0], // phthalo green
    ];

    let mut params = Params {
        grid: n,
        frame: 0,
        bots_active: 1,
        relax_iters: cfg.relax,
        dt: cfg.dt,
        viscosity: 0.1,
        drag: 0.01,
        dry_rate: 0.0015,
        evap_rate: cfg.evap,
        gravity_x: 0.0,
        gravity_y: 0.0,
        cos_alpha: 1.0,
        edge_eta: 0.03,
        paper_influence: 0.10,
        time: 0.0,
        bot_count: cfg.bots,
        pig,
    };

    let ubuf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("params"),
        contents: bytemuck::bytes_of(&params),
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    });

    // ---- pipelines -------------------------------------------------------
    let common = include_str!("../shaders/common.wgsl");
    let p_paper = make_pipeline(&device, common, include_str!("../shaders/paper_init.wgsl"), "paper_init", fw, fp);
    let p_bots = make_pipeline(&device, common, include_str!("../shaders/brush_bots.wgsl"), "brush_bots", fw, fp);
    let p_vel = make_pipeline(&device, common, include_str!("../shaders/update_velocities.wgsl"), "update_velocities", fw, fp);
    let p_relax = make_pipeline(&device, common, include_str!("../shaders/relax_divergence.wgsl"), "relax_divergence", fw, fp);
    let p_outward = make_pipeline(&device, common, include_str!("../shaders/flow_outward.wgsl"), "flow_outward", fw, fp);
    let p_fluxc = make_pipeline(&device, common, include_str!("../shaders/flux_compute.wgsl"), "flux_compute", fw, fp);
    let p_fluxp = make_pipeline(&device, common, include_str!("../shaders/flux_apply_pigment.wgsl"), "flux_apply_pigment", fw, fp);
    let p_fluxw = make_pipeline(&device, common, include_str!("../shaders/flux_apply_water.wgsl"), "flux_apply_water", fw, fp);
    let p_xfer = make_pipeline(&device, common, include_str!("../shaders/transfer_pigment.wgsl"), "transfer_pigment", fw, fp);
    let p_cap = make_pipeline(&device, common, include_str!("../shaders/capillary_flow.wgsl"), "capillary_flow", fw, fp);
    let p_dry = make_pipeline(&device, common, include_str!("../shaders/dry_tick.wgsl"), "dry_tick", fw, fp);
    let p_red = make_pipeline(&device, common, include_str!("../shaders/reduce.wgsl"), "reduce", fw, fp);

    let mkbg = |lay: &wgpu::BindGroupLayout, res: Vec<wgpu::BindingResource>| {
        let entries: Vec<wgpu::BindGroupEntry> = res
            .into_iter()
            .enumerate()
            .map(|(i, r)| wgpu::BindGroupEntry { binding: i as u32, resource: r })
            .collect();
        device.create_bind_group(&wgpu::BindGroupDescriptor { label: None, layout: lay, entries: &entries })
    };

    // Clear every field before anything reads one. See shaders/zero_fill.wgsl.
    {
        let zsrc = include_str!("../shaders/zero_fill.wgsl");
        let p_zw = make_pipeline(&device, common, zsrc, "zero_water", fw, fw);
        let p_zp = make_pipeline(&device, common, zsrc, "zero_pig", fp, fp);
        let mut enc = device.create_command_encoder(&Default::default());
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("zero"), timestamp_writes: None });
            for (pipe, views) in [
                (&p_zw, vec![&wet0.view[0], &wet0.view[1], &wet5.view[0], &wet5.view[1], &press.view[0], &press.view[1]]),
                (&p_zp, vec![&wet1.view[0], &wet1.view[1], &wet2.view[0], &wet2.view[1],
                             &wet3.view[0], &wet3.view[1], &wet4.view[0], &wet4.view[1]]),
            ] {
                cp.set_pipeline(pipe);
                let bgs: Vec<wgpu::BindGroup> = views.iter()
                    .map(|v| mkbg(&pipe.get_bind_group_layout(0), vec![ubuf.as_entire_binding(), tex(v)]))
                    .collect();
                for bg in &bgs {
                    cp.set_bind_group(0, bg, &[]);
                    cp.dispatch_workgroups(groups, groups, 1);
                }
            }
        }
        queue.submit(Some(enc.finish()));
        device.poll(wgpu::Maintain::Wait);
    }

    // Paper is written once. Every engine reads it; none writes it (§2.4).
    {
        let bg = mkbg(&p_paper.get_bind_group_layout(0), vec![ubuf.as_entire_binding(), tex(&paper)]);
        let mut enc = device.create_command_encoder(&Default::default());
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("paper"), timestamp_writes: None });
            cp.set_pipeline(&p_paper);
            cp.set_bind_group(0, &bg, &[]);
            cp.dispatch_workgroups(groups, groups, 1);
        }
        queue.submit(Some(enc.finish()));
        device.poll(wgpu::Maintain::Wait);
    }

    // Relax runs up to 50 times a frame; precreate its four parity combinations
    // rather than rebuilding bind groups inside the hot loop.
    let mut relax_bgs: Vec<wgpu::BindGroup> = Vec::new();
    for a in 0..2usize {
        relax_bgs.push(mkbg(
            &p_relax.get_bind_group_layout(0),
            vec![ubuf.as_entire_binding(), tex(&wet0.view[a]), tex(&wet0.view[1 - a])],
        ));
    }

    // ---- timing ----------------------------------------------------------
    let npass = PASS_NAMES.len() as u32;
    let qset = if ts_ok {
        Some(device.create_query_set(&wgpu::QuerySetDescriptor {
            label: Some("timing"),
            ty: wgpu::QueryType::Timestamp,
            count: npass * 2,
        }))
    } else {
        None
    };
    let qsize = (npass as u64) * 2 * 8;
    let qresolve = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("q resolve"),
        size: qsize,
        usage: wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });
    let qstage = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("q stage"),
        size: qsize,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let period = queue.get_timestamp_period() as f64;

    let mut pass_ms_acc = vec![0f64; PASS_NAMES.len()];
    let mut frame_ms: Vec<f64> = Vec::new();
    let mut timed_frames = 0u32;

    // Parity of each ping-pong group.
    let (mut p0, mut p1, mut p2, mut p3) = (0usize, 0usize, 0usize, 0usize);

    let mut gauge_log: Vec<(u32, [f64; NQ])> = Vec::new();
    // Adaptive relaxation. C97 runs up to 50 iterations with an early exit once
    // divergence falls under tau = 0.01. A true within-frame exit needs an
    // indirect dispatch driven by a GPU-side reduction; this instead measures
    // the residual each frame and sizes the next frame's count from it. The
    // field is continuous between frames, so a one-frame lag costs nothing —
    // and unlike a fixed count it responds when the artist floods the sheet.
    const TAU: f64 = 0.01;
    let mut relax_n: u32 = cfg.relax;
    let mut relax_hist: Vec<u32> = Vec::new();
    let mut div_hist: Vec<f64> = Vec::new();
    let t_start = Instant::now();

    for frame in 0..cfg.frames {
        let hands_off = frame >= cfg.settle_at;
        params.frame = frame;
        params.time = frame as f32 * 0.016;
        params.bots_active = if hands_off { 0 } else { 1 };
        queue.write_buffer(&ubuf, 0, bytemuck::bytes_of(&params));

        let mut enc = device.create_command_encoder(&Default::default());
        let probing = cfg.probe >= 0 && frame as i64 == cfg.probe;

        macro_rules! probe {
            ($k:expr) => {
                if probing {
                    let bgp = mkbg(&p_red.get_bind_group_layout(0), vec![
                        ubuf.as_entire_binding(), tex(&wet0.view[p0]), tex(&wet1.view[p1]), tex(&wet2.view[p1]),
                        tex(&wet3.view[p2]), tex(&wet4.view[p2]), tex(&wet5.view[p3]), partials.as_entire_binding(),
                    ]);
                    {
                        let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: None });
                        cp.set_pipeline(&p_red);
                        cp.set_bind_group(0, &bgp, &[]);
                        cp.dispatch_workgroups(rgroups, rgroups, 1);
                    }
                    enc.copy_buffer_to_buffer(&partials, 0, &probe_buf, ($k as u64) * psize, psize);
                }
            };
        }

        // 0 — brush bots (synthetic load)
        let bg0 = mkbg(&p_bots.get_bind_group_layout(0), vec![
            ubuf.as_entire_binding(), tex(&wet0.view[p0]), tex(&wet1.view[p1]), tex(&wet2.view[p1]),
            tex(&wet5.view[p3]), tex(&wet0.view[1-p0]), tex(&wet1.view[1-p1]), tex(&wet2.view[1-p1]),
            tex(&wet5.view[1-p3]),
        ]);
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: tsw(qset.as_ref(), 0) });
            cp.set_pipeline(&p_bots); cp.set_bind_group(0, &bg0, &[]);
            cp.dispatch_workgroups(groups, groups, 1);
        }
        p0 = 1 - p0; p1 = 1 - p1; p3 = 1 - p3;
        probe!(0);

        // 1 — update velocities
        let bg1 = mkbg(&p_vel.get_bind_group_layout(0), vec![
            ubuf.as_entire_binding(), tex(&wet0.view[p0]), tex(&paper), tex(&wet0.view[1-p0]),
        ]);
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: tsw(qset.as_ref(), 1) });
            cp.set_pipeline(&p_vel); cp.set_bind_group(0, &bg1, &[]);
            cp.dispatch_workgroups(groups, groups, 1);
        }
        p0 = 1 - p0;
        probe!(1);

        // 2 — relax divergence, N iterations inside a single pass
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: tsw(qset.as_ref(), 2) });
            cp.set_pipeline(&p_relax);
            let mut a = p0;
            for _ in 0..relax_n {
                cp.set_bind_group(0, &relax_bgs[a], &[]);
                cp.dispatch_workgroups(groups, groups, 1);
                a = 1 - a;
            }
            p0 = a;
        }
        probe!(2);

        // 3 — flow outward (edge darkening)
        let bg3 = mkbg(&p_outward.get_bind_group_layout(0), vec![
            ubuf.as_entire_binding(), tex(&wet0.view[p0]), tex(&press.view[1]),
        ]);
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: tsw(qset.as_ref(), 3) });
            cp.set_pipeline(&p_outward); cp.set_bind_group(0, &bg3, &[]);
            cp.dispatch_workgroups(groups, groups, 1);
        }
        // 4 — flux compute
        let bg4 = mkbg(&p_fluxc.get_bind_group_layout(0), vec![
            ubuf.as_entire_binding(), tex(&wet0.view[p0]), tex(&press.view[1]), flux.as_entire_binding(),
        ]);
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: tsw(qset.as_ref(), 4) });
            cp.set_pipeline(&p_fluxc); cp.set_bind_group(0, &bg4, &[]);
            cp.dispatch_workgroups(groups, groups, 1);
        }

        // 5 — pigment rides the fluxes. Before the water moves, not after.
        let bg5 = mkbg(&p_fluxp.get_bind_group_layout(0), vec![
            ubuf.as_entire_binding(), tex(&wet0.view[p0]), tex(&wet1.view[p1]), tex(&wet2.view[p1]),
            flux.as_entire_binding(), tex(&wet1.view[1-p1]), tex(&wet2.view[1-p1]),
        ]);
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: tsw(qset.as_ref(), 5) });
            cp.set_pipeline(&p_fluxp); cp.set_bind_group(0, &bg5, &[]);
            cp.dispatch_workgroups(groups, groups, 1);
        }
        p1 = 1 - p1;

        // 6 — water moves
        let bg6 = mkbg(&p_fluxw.get_bind_group_layout(0), vec![
            ubuf.as_entire_binding(), tex(&wet0.view[p0]), flux.as_entire_binding(), tex(&wet0.view[1-p0]),
        ]);
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: tsw(qset.as_ref(), 6) });
            cp.set_pipeline(&p_fluxw); cp.set_bind_group(0, &bg6, &[]);
            cp.dispatch_workgroups(groups, groups, 1);
        }
        p0 = 1 - p0;
        probe!(3);

        // 7 — suspended <-> settled
        let bg7 = mkbg(&p_xfer.get_bind_group_layout(0), vec![
            ubuf.as_entire_binding(), tex(&wet0.view[p0]), tex(&wet1.view[p1]), tex(&wet2.view[p1]),
            tex(&wet3.view[p2]), tex(&wet4.view[p2]), tex(&paper),
            tex(&wet1.view[1-p1]), tex(&wet2.view[1-p1]), tex(&wet3.view[1-p2]), tex(&wet4.view[1-p2]),
        ]);
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: tsw(qset.as_ref(), 7) });
            cp.set_pipeline(&p_xfer); cp.set_bind_group(0, &bg7, &[]);
            cp.dispatch_workgroups(groups, groups, 1);
        }
        p1 = 1 - p1; p2 = 1 - p2;

        // 8 — capillary flow
        let bg8 = mkbg(&p_cap.get_bind_group_layout(0), vec![
            ubuf.as_entire_binding(), tex(&wet0.view[p0]), tex(&wet5.view[p3]), tex(&paper),
            tex(&wet0.view[1-p0]), tex(&wet5.view[1-p3]),
        ]);
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: tsw(qset.as_ref(), 8) });
            cp.set_pipeline(&p_cap); cp.set_bind_group(0, &bg8, &[]);
            cp.dispatch_workgroups(groups, groups, 1);
        }
        p0 = 1 - p0; p3 = 1 - p3;
        probe!(4);

        // 9 — dry tick, sole owner of evaporation
        let bg9 = mkbg(&p_dry.get_bind_group_layout(0), vec![
            ubuf.as_entire_binding(), tex(&wet0.view[p0]), tex(&wet5.view[p3]),
            tex(&wet0.view[1-p0]), tex(&wet5.view[1-p3]),
        ]);
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: tsw(qset.as_ref(), 9) });
            cp.set_pipeline(&p_dry); cp.set_bind_group(0, &bg9, &[]);
            cp.dispatch_workgroups(groups, groups, 1);
        }
        p0 = 1 - p0; p3 = 1 - p3;
        probe!(5);

        // 10 — the gauges
        let bg10 = mkbg(&p_red.get_bind_group_layout(0), vec![
            ubuf.as_entire_binding(), tex(&wet0.view[p0]), tex(&wet1.view[p1]), tex(&wet2.view[p1]),
            tex(&wet3.view[p2]), tex(&wet4.view[p2]), tex(&wet5.view[p3]), partials.as_entire_binding(),
        ]);
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: tsw(qset.as_ref(), 10) });
            cp.set_pipeline(&p_red); cp.set_bind_group(0, &bg10, &[]);
            cp.dispatch_workgroups(rgroups, rgroups, 1);
        }

        if let Some(q) = qset.as_ref() {
            enc.resolve_query_set(q, 0..npass * 2, &qresolve, 0);
            enc.copy_buffer_to_buffer(&qresolve, 0, &qstage, 0, qsize);
        }

        let log_gauges = frame == cfg.settle_at.saturating_sub(1)
            || (hands_off && (frame - cfg.settle_at) % 60 == 0)
            || frame == cfg.frames - 1;
        enc.copy_buffer_to_buffer(&partials, 0, &partials_stage, 0, (nwg * NQ * 4) as u64);
        if probing {
            enc.copy_buffer_to_buffer(&probe_buf, 0, &probe_stage, 0, psize * NPROBE as u64);
        }

        let t0 = Instant::now();
        queue.submit(Some(enc.finish()));
        device.poll(wgpu::Maintain::Wait);
        let wall = t0.elapsed().as_secs_f64() * 1000.0;

        if qset.is_some() {
            let slice = qstage.slice(..);
            let (tx, rx) = std::sync::mpsc::channel();
            slice.map_async(wgpu::MapMode::Read, move |r| { let _ = tx.send(r); });
            device.poll(wgpu::Maintain::Wait);
            if let Ok(Ok(())) = rx.recv() {
                let data = slice.get_mapped_range();
                let vals: &[u64] = bytemuck::cast_slice(&data);
                let mut total = 0.0f64;
                for i in 0..PASS_NAMES.len() {
                    let d = vals[i * 2 + 1].saturating_sub(vals[i * 2]) as f64 * period / 1.0e6;
                    total += d;
                    if hands_off { pass_ms_acc[i] += d; }
                }
                if hands_off { frame_ms.push(total); timed_frames += 1; }
                drop(data);
            }
            qstage.unmap();
        } else if hands_off {
            frame_ms.push(wall);
            timed_frames += 1;
        }

        if probing {
            let slice = probe_stage.slice(..);
            let (tx, rx) = std::sync::mpsc::channel();
            slice.map_async(wgpu::MapMode::Read, move |r| { let _ = tx.send(r); });
            device.poll(wgpu::Maintain::Wait);
            if let Ok(Ok(())) = rx.recv() {
                let data = slice.get_mapped_range();
                let vals: &[f32] = bytemuck::cast_slice(&data);
                println!("\n-- pass-level probe, frame {frame} --");
                println!("  {:<26} {:>16} {:>16} {:>14}", "point", "water", "delta", "wet cells");
                let mut prev = f64::NAN;
                for k in 0..NPROBE {
                    let base = k * nwg * NQ;
                    let mut hf = 0f64; let mut s = 0f64; let mut wc = 0f64;
                    for w in 0..nwg {
                        hf += vals[base + w * NQ] as f64;
                        s += vals[base + w * NQ + 1] as f64;
                        wc += vals[base + w * NQ + 11] as f64;
                    }
                    let tot = hf + s;
                    let d = if prev.is_nan() { 0.0 } else { tot - prev };
                    println!("  {:<26} {:>16.2} {:>+16.4} {:>14.0}", PROBE_NAMES[k], tot, d, wc);
                    prev = tot;
                }
                drop(data);
            }
            probe_stage.unmap();
        }

        {
            let slice = partials_stage.slice(..);
            let (tx, rx) = std::sync::mpsc::channel();
            slice.map_async(wgpu::MapMode::Read, move |r| { let _ = tx.send(r); });
            device.poll(wgpu::Maintain::Wait);
            if let Ok(Ok(())) = rx.recv() {
                let data = slice.get_mapped_range();
                let vals: &[f32] = bytemuck::cast_slice(&data);
                let mut q = [0f64; NQ];
                for w in 0..nwg {
                    for k in 0..NQ {
                        q[k] += vals[w * NQ + k] as f64;
                    }
                }
                drop(data);

                let mean_div = if q[11] > 0.5 { q[12] / q[11] } else { 0.0 };
                relax_hist.push(relax_n);
                div_hist.push(mean_div);

                // Size the next frame from the residual this one left behind.
                // Back off gently, push back hard: overshooting costs a frame of
                // slightly soft flow, undershooting costs visible divergence.
                if cfg.adaptive {
                    if mean_div < TAU * 0.5 {
                        relax_n = relax_n.saturating_sub(2).max(2);
                    } else if mean_div > TAU {
                        relax_n = (relax_n + 6).min(cfg.relax);
                    }
                }

                if log_gauges { gauge_log.push((frame, q)); }
            }
            partials_stage.unmap();
        }
    }

    let elapsed = t_start.elapsed().as_secs_f64();

    // ---- report ----------------------------------------------------------
    let cells = (n as f64) * (n as f64);
    let bw = if water_f32 { 4.0 } else { 2.0 };
    let bp = if pig_f32 { 4.0 } else { 2.0 };
    // WET0 + WET5 = 8 water-side numbers; WET1..4 = 16 pigment numbers.
    let logical_mb = cells * (8.0 * bw + 16.0 * bp) / 1_048_576.0;
    println!("\n-- memory --");
    println!("wet band, logical  : {logical_mb:.1} MB");
    println!("actually allocated : {:.1} MB  (read/write separation doubles it)", logical_mb * 2.0);

    if !relax_hist.is_empty() {
        let tail = &relax_hist[relax_hist.len().saturating_sub(timed_frames as usize)..];
        let mean_n: f64 = tail.iter().map(|v| *v as f64).sum::<f64>() / tail.len().max(1) as f64;
        let dtail = &div_hist[div_hist.len().saturating_sub(timed_frames as usize)..];
        let mean_d: f64 = dtail.iter().sum::<f64>() / dtail.len().max(1) as f64;
        let worst_d = dtail.iter().cloned().fold(0.0f64, f64::max);
        println!("\n-- relaxation --");
        println!("iterations used, steady state : mean {mean_n:.1}  (ceiling {})", cfg.relax);
        println!("residual mean |divergence|    : {mean_d:.5}  (worst frame {worst_d:.5}, tau {TAU})");
    }

    frame_ms.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let pick = |p: f64| -> f64 {
        if frame_ms.is_empty() { return 0.0; }
        frame_ms[((frame_ms.len() - 1) as f64 * p) as usize]
    };
    let median = pick(0.50);
    let p95 = pick(0.95);
    let worst = *frame_ms.last().unwrap_or(&0.0);

    println!("\n-- gpu time per frame, steady state ({timed_frames} frames) --");
    println!("median {median:8.2} ms   p95 {p95:8.2} ms   worst {worst:8.2} ms   budget {FRAME_BUDGET_MS} ms");

    println!("\n-- where it goes (mean ms/frame) --");
    let mut ranked: Vec<(usize, f64)> = pass_ms_acc
        .iter()
        .enumerate()
        .map(|(i, v)| (i, v / timed_frames.max(1) as f64))
        .collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    for (i, ms) in &ranked {
        let share = if median > 0.0 { ms / median * 100.0 } else { 0.0 };
        println!("  {:<20} {:8.3} ms  {:5.1}%", PASS_NAMES[*i], ms, share);
    }

    println!("\n-- conservation trace, hands off --");
    println!("  {:>6} {:>18} {:>18} {:>12} {:>12}", "frame", "water", "pigment", "wet cells", "mean |div|");
    for (f, q) in &gauge_log {
        let w = q[0] + q[1];
        let p: f64 = q[2..10].iter().sum();
        let md = if q[11] > 0.5 { q[12] / q[11] } else { 0.0 };
        println!("  {:>6} {:>18.2} {:>18.2} {:>12.0} {:>12.5}", f, w, p, q[11], md);
    }

    println!("\n-- conservation, hands off --");
    if gauge_log.len() >= 2 {
        let (f_a, a) = &gauge_log[0];
        let (f_b, b) = gauge_log.last().unwrap();
        let wa = a[0] + a[1];
        let wb = b[0] + b[1];
        let pa: f64 = a[2..10].iter().sum();
        let pb: f64 = b[2..10].iter().sum();
        let drift = |x: f64, y: f64| if x.abs() > 1e-9 { (y - x) / x * 100.0 } else { 0.0 };
        println!("  frames {f_a} -> {f_b}   (evaporation rate {})", params.evap_rate);
        println!("  water  (film+paper) {wa:14.2} -> {wb:14.2}   drift {:+.4} %", drift(wa, wb));
        println!("  pigment (susp+settled) {pa:11.2} -> {pb:11.2}   drift {:+.4} %", drift(pa, pb));
        println!("  body   h_p          {:14.2} -> {:14.2}   drift {:+.4} %", a[10], b[10], drift(a[10], b[10]));
        println!("  wet cells           {:14.0} -> {:14.0}", a[11], b[11]);
        println!("\n  per-slot pigment drift:");
        for k in 0..8 {
            println!("    slot {k}  {:12.3} -> {:12.3}   {:+.4} %", a[2 + k], b[2 + k], drift(a[2 + k], b[2 + k]));
        }
    } else {
        println!("  (not enough samples)");
    }

    let verdict = if median <= FRAME_BUDGET_MS {
        "PASS - fits the frame budget"
    } else if median <= FRAME_BUDGET_MS * 2.0 {
        "SHAKY - over budget, within reach of tuning"
    } else {
        "FAIL - over budget by more than 2x"
    };
    println!("\n-- verdict --\n  {verdict}");
    println!("  {:.1} s wall for {} frames", elapsed, cfg.frames);

    if cfg.dump {
        dump_png(&device, &queue, &wet0.tex[p0], &wet1.tex[p1], n, "wet_field.png");
        println!("\n  wrote wet_field.png (blue = standing water, red/green = pigment)");
    }
}

/// Snapshot of the wet field, so a human can confirm the bots actually painted
/// something and the wash is spreading rather than sitting in dead squares.
fn dump_png(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    wet0: &wgpu::Texture,
    wet1: &wgpu::Texture,
    n: u32,
    path: &str,
) {
    let bpr = n * 8;
    let size = (bpr as u64) * (n as u64);
    let grab = |t: &wgpu::Texture| -> Vec<u8> {
        let buf = device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let mut enc = device.create_command_encoder(&Default::default());
        enc.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture: t,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: &buf,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(bpr),
                    rows_per_image: Some(n),
                },
            },
            wgpu::Extent3d { width: n, height: n, depth_or_array_layers: 1 },
        );
        queue.submit(Some(enc.finish()));
        let slice = buf.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |r| { let _ = tx.send(r); });
        device.poll(wgpu::Maintain::Wait);
        let _ = rx.recv();
        let out = slice.get_mapped_range().to_vec();
        buf.unmap();
        out
    };

    let a = grab(wet0);
    let b = grab(wet1);
    let h = |raw: &[u8], i: usize| -> f32 {
        half::f16::from_bits(u16::from_le_bytes([raw[i * 2], raw[i * 2 + 1]])).to_f32()
    };

    let mut rgba = vec![0u8; (n as usize) * (n as usize) * 4];
    for i in 0..(n as usize) * (n as usize) {
        let water = h(&a, i * 4 + 1);
        let g1 = h(&b, i * 4);
        let g2 = h(&b, i * 4 + 1);
        let enc8 = |v: f32| -> u8 { (v.clamp(0.0, 1.0).powf(0.45) * 255.0) as u8 };
        rgba[i * 4] = enc8(g1 * 2.0);
        rgba[i * 4 + 1] = enc8(g2 * 2.0);
        rgba[i * 4 + 2] = enc8(water * 1.5);
        rgba[i * 4 + 3] = 255;
    }

    let file = std::fs::File::create(path).expect("cannot write png");
    let w = &mut std::io::BufWriter::new(file);
    let mut enc = png::Encoder::new(w, n, n);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let mut writer = enc.write_header().unwrap();
    writer.write_image_data(&rgba).unwrap();
}
