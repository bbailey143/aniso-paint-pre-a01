// Brush Viewer Studio (3D-brush branch)
//
// A 3D interactive studio for inspecting, verifying, and tuning brush bristles,
// kinematic spine deformation under pressure, splay geometry, and friction lobes.
// Operates in its own popout window or floating dark glassmorphic studio frame.

import type { BrushDef } from '../brush/types';
import { Spine } from '../brush/spine';
import { BRUSHES } from '../brush/library';

export interface StudioOptions {
  brush?: BrushDef;
  onBrushUpdate?: (brush: BrushDef) => void;
  onClose?: () => void;
}

export class BrushViewerStudio {
  private container: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private brush: BrushDef;
  private spine: Spine;
  private onBrushUpdate?: (brush: BrushDef) => void;
  private onClose?: () => void;

  // Interactive 3D Camera State
  private cameraAzimuth = Math.PI / 4;  // 45 degrees
  private cameraElevation = Math.PI / 6; // 30 degrees
  private cameraDistance = 140;          // Viewport distance units
  private cameraTarget = { x: 0, y: 15, z: 0 };
  private isCamDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Direct Interactive Brush Physics State
  private interactionMode: 'brush' | 'orbit' = 'brush';
  private showDebugSpine = false;
  private isBrushActive = false;
  private brushPos = { x: 0, y: 0 };
  private brushDragVec = { x: 0, y: 0 };
  private lastPointerTime = 0;

  // Interactive Test Parameters
  private pressure = 0.4;
  private tiltAngle = 30; // degrees
  private tiltAzimuth = 45; // degrees
  private isAutoRotating = false;
  private animReqId: number | null = null;

  // ---- Viewer-only settings. NOT part of the brush row. --------------------
  //
  // These never touch `this.brush`, are never exported in the JSON, and the
  // engine never sees them. They change how the brush is DRAWN, not what it is.

  /**
   * How many hairs get drawn. Deliberately *not* `BrushDef.bristles`.
   *
   * `bristles` is a simulation quantity: it sizes the reservoir grid
   * (`bristles × segments`, reservoir.ts) and the per-step footprint sampling
   * (`bristles × contacts × substeps`, fluid.ts), so raising it costs real
   * work every stroke. This one costs paint and nothing else. Keeping them
   * separate is what lets a 34-bristle row read as a packed tuft instead of
   * the fringe of 68 hairs it used to draw.
   *
   * `[UNVERIFIED]` The default was chosen by eye to read as a packed tuft. The
   * true hair count of a real sable is a measurable quantity and no card
   * records it — when one does, that number belongs on the brush row, and this
   * setting goes back to being a performance dial.
   */
  private hairDensity = 850;

  /**
   * A photograph of a real brush, to build against. `over` at partial opacity
   * is the silhouette match — the reason to load one at all. Note the camera
   * still has to be orbited to the photo's angle by eye; nothing here infers it.
   */
  private ref: {
    img: HTMLImageElement | null;
    name: string;
    opacity: number;
    scale: number;
    offsetX: number;
    offsetY: number;
    over: boolean;
  } = { img: null, name: '', opacity: 0.55, scale: 1, offsetX: 0, offsetY: 0, over: false };

  // UI Elements
  private jsonDrawer!: HTMLElement;
  private jsonTextArea!: HTMLTextAreaElement;
  private controlsPanel!: HTMLElement;

  constructor(mountPoint: HTMLElement, options: StudioOptions = {}) {
    this.brush = JSON.parse(JSON.stringify(options.brush || BRUSHES[0]));
    this.spine = new Spine(this.brush, 1.0);
    this.onBrushUpdate = options.onBrushUpdate;
    this.onClose = options.onClose;

    this.container = document.createElement('div');
    this.container.className = 'brush-studio-root';
    this.container.innerHTML = this.template();
    mountPoint.appendChild(this.container);

    this.initCanvas();
    this.initControls();
    this.initEvents();
    this.startRenderLoop();
  }

  private template(): string {
    return `
      <div class="studio-header panel">
        <div class="studio-title-group">
          <span class="hud-title">3D Brush Viewer Studio</span>
          <span class="studio-sub">webgpu / 3d bristle laboratory</span>
        </div>
        <div class="studio-header-actions">
          <select id="studio-brush-select" class="pal-btn studio-select">
            ${BRUSHES.map((b) => `<option value="${b.slug}" ${b.slug === this.brush.slug ? 'selected' : ''}>${b.name}</option>`).join('')}
          </select>
          <button id="studio-btn-toggle-json" class="pal-btn">JSON Code</button>
          <button id="studio-btn-export" class="pal-btn">Export JSON</button>
          <button id="studio-btn-import-trigger" class="pal-btn">Import JSON</button>
          <input type="file" id="studio-file-input" accept=".json" style="display:none" />
          <button id="studio-btn-reset-cam" class="pal-btn">Reset 3D View</button>
          ${this.onClose ? '<button id="studio-btn-close" class="pal-btn accent">Close Studio ×</button>' : ''}
        </div>
      </div>

      <div class="studio-body">
        <div class="studio-viewport-column">
          <div class="studio-viewport-container">
            <canvas id="studio-canvas"></canvas>
            
            <div class="studio-mode-bar panel">
              <button id="mode-drag-brush" class="pal-btn ${this.interactionMode === 'brush' ? 'on' : ''}" title="Drag mouse/stylus on canvas to press & flex the brush bristles">🖊 Interact Brush</button>
              <button id="mode-orbit-cam" class="pal-btn ${this.interactionMode === 'orbit' ? 'on' : ''}" title="Drag canvas to rotate 3D view camera">🎥 Orbit Camera</button>
              <button id="mode-toggle-debug" class="pal-btn ${this.showDebugSpine ? 'on' : ''}" title="Toggle joint spine skeleton display">🦴 Joint Skeleton</button>
            </div>

            <div class="studio-hud-overlay panel">
              <div class="stylus-row"><span>bristle count</span><b id="hud-bristles">${this.brush.bristles}</b></div>
              <div class="stylus-row"><span>kind</span><b id="hud-kind">${this.brush.kind}</b></div>
              <div class="stylus-row"><span>spine joints</span><b id="hud-segments">${this.brush.segments}</b></div>
              <div class="stylus-row"><span>splay rating</span><b id="hud-splay">${(this.brush.splayFromPressure * 100).toFixed(0)}%</b></div>
            </div>
          </div>

          <div class="studio-sim-bar panel">
            <div class="sim-row">
              <span id="sim-pressure-label">pressure (${(this.pressure * 100).toFixed(0)}%)</span>
              <input type="range" id="sim-pressure" min="0" max="1" step="0.01" value="${this.pressure}" />
            </div>
            <div class="sim-row">
              <span id="sim-tilt-label">tilt (${this.tiltAngle}°)</span>
              <input type="range" id="sim-tilt" min="0" max="85" step="1" value="${this.tiltAngle}" />
            </div>
            <div class="sim-row">
              <span id="sim-azimuth-label">azimuth (${this.tiltAzimuth}°)</span>
              <input type="range" id="sim-azimuth" min="0" max="360" step="1" value="${this.tiltAzimuth}" />
            </div>
            <button id="sim-turntable" class="pal-btn ${this.isAutoRotating ? 'on' : ''}">Rotate 3D ↺</button>
          </div>
        </div>

        <div class="studio-controls-panel panel">
          <div class="controls-scroll" id="studio-controls-list">
            <!-- Dynamic Controls Built via JS -->
          </div>
        </div>
      </div>

      <div class="studio-json-drawer panel" id="studio-json-drawer" style="display:none">
        <div class="json-drawer-head">
          <span class="hud-title">Brush JSON Parameters</span>
          <div class="json-actions">
            <button id="json-copy-btn" class="pal-btn">Copy to Clipboard</button>
            <button id="json-apply-btn" class="pal-btn accent">Apply Changes</button>
            <button id="json-close-btn" class="pal-btn">Close JSON</button>
          </div>
        </div>
        <textarea id="studio-json-text" spellcheck="false"></textarea>
      </div>
    `;
  }

  private initCanvas() {
    this.canvas = this.container.querySelector('#studio-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas() {
    const parent = this.canvas.parentElement!;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = parent.clientWidth * dpr;
    this.canvas.height = parent.clientHeight * dpr;
  }

  private initControls() {
    this.controlsPanel = this.container.querySelector('#studio-controls-list')!;
    this.jsonDrawer = this.container.querySelector('#studio-json-drawer')!;
    this.jsonTextArea = this.container.querySelector('#studio-json-text') as HTMLTextAreaElement;

    this.rebuildControlSliders();
    this.updateJsonView();
  }

  private rebuildControlSliders() {
    this.controlsPanel.innerHTML = `
      <section class="studio-group">
        <h3>Reference &amp; Viewer <span class="studio-note">drawing only</span></h3>
        <div class="studio-ref-row">
          <button id="ref-load" class="pal-btn">Load Photo…</button>
          <button id="ref-clear" class="pal-btn"${this.ref.img ? '' : ' disabled'}>Clear</button>
          <input type="file" id="ref-file" accept="image/*" style="display:none" />
        </div>
        <div class="studio-ref-name" id="ref-name">${this.ref.img ? this.ref.name : 'no reference loaded'}</div>
        <div class="studio-ref-row">
          <button id="ref-mode" class="pal-btn ${this.ref.over ? 'on' : ''}">${this.ref.over ? 'Over — silhouette' : 'Behind — backdrop'}</button>
        </div>
        ${this.viewerSliderRow('refOpacity', 'Reference Opacity', this.ref.opacity, 0, 1, 0.01)}
        ${this.viewerSliderRow('refScale', 'Reference Scale', this.ref.scale, 0.1, 4, 0.01)}
        ${this.viewerSliderRow('refX', 'Reference X', this.ref.offsetX, -800, 800, 1)}
        ${this.viewerSliderRow('refY', 'Reference Y', this.ref.offsetY, -800, 800, 1)}
        ${this.viewerSliderRow('hairDensity', 'Drawn Hairs', this.hairDensity, 60, 2000, 10)}
      </section>

      <section class="studio-group">
        <h3>Tuft Geometry</h3>
        ${this.sliderRow('bristles', 'Bristle Count', this.brush.bristles, 10, 100, 1)}
        ${this.sliderRow('length', 'Tuft Length (cells)', this.brush.length, 10, 50, 0.5)}
        ${this.sliderRow('widthRatio', 'Width Ratio (×)', this.brush.widthRatio, 0.1, 1.5, 0.01)}
        ${this.sliderRow('taper', 'Taper Ratio', this.brush.taper, 0.0, 0.9, 0.01)}
        ${this.sliderRow('segments', 'Spine Segments', this.brush.segments, 3, 10, 1)}
      </section>

      <section class="studio-group">
        <h3>Handling & Elasticity</h3>
        ${this.sliderRow('stiffness', 'Ferrule Spring', this.brush.stiffness, 0.1, 1.0, 0.01)}
        ${this.sliderRow('stiffnessTaper', 'Tip Softness', this.brush.stiffnessTaper, 0.1, 1.0, 0.01)}
        ${this.sliderRow('splayFromPressure', 'Pressure Splay', this.brush.splayFromPressure, 0.0, 1.0, 0.01)}
        ${this.sliderRow('plasticity', 'Shape Memory', this.brush.plasticity, 0.0, 0.5, 0.01)}
      </section>

      <section class="studio-group">
        <h3>Friction & Anisotropy</h3>
        ${this.sliderRow('mu', 'Base Friction (µ)', this.brush.friction.mu, 0.1, 1.0, 0.01)}
        ${this.sliderRow('cEta', 'Lobe Glide (cη)', this.brush.friction.cEta, 0.1, 1.0, 0.01)}
        ${this.sliderRow('k', 'Cone Focus (k)', this.brush.friction.k, 0.5, 5.0, 0.1)}
      </section>

      <section class="studio-group">
        <h3>Reservoir Holding</h3>
        ${this.sliderRow('capacityBelly', 'Belly Capacity', this.brush.reservoir.capacityBelly, 0.5, 5.0, 0.1)}
        ${this.sliderRow('capacityTip', 'Tip Capacity', this.brush.reservoir.capacityTip, 0.1, 2.0, 0.05)}
        ${this.sliderRow('waterOvercharge', 'Flooded Range', this.brush.reservoir.waterOvercharge, 1.0, 5.0, 0.1)}
        ${this.sliderRow('downRate', 'Laydown Rate', this.brush.reservoir.downRate, 0.001, 0.05, 0.001)}
      </section>
    `;

    // Scoped to `data-param` so the viewer sliders below never reach
    // updateParam — they are not brush parameters and must not mark the row
    // dirty or fire onBrushUpdate.
    this.controlsPanel.querySelectorAll('input[type="range"][data-param]').forEach((input) => {
      input.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const param = target.dataset.param!;
        const val = parseFloat(target.value);
        this.updateParam(param, val);
      });
    });

    this.wireViewerControls();
  }

  /** A slider that changes only how the brush is drawn. Separate from
   *  `sliderRow` on purpose: different data attribute, different handler,
   *  never reaches the brush row. */
  private viewerSliderRow(param: string, label: string, val: number, min: number, max: number, step: number): string {
    return `
      <div class="studio-slider-row">
        <div class="studio-slider-head">
          <span>${label}</span>
          <b id="vval-${param}">${val.toFixed(step < 1 ? 2 : 0)}</b>
        </div>
        <input type="range" data-vparam="${param}" min="${min}" max="${max}" step="${step}" value="${val}" />
      </div>
    `;
  }

  /** Re-attached after every `rebuildControlSliders`, which replaces the whole
   *  panel's innerHTML and takes the listeners with it. The loaded image itself
   *  lives on `this.ref` and survives the rebuild. */
  private wireViewerControls() {
    this.controlsPanel.querySelectorAll('input[type="range"][data-vparam]').forEach((input) => {
      input.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const p = target.dataset.vparam!;
        const v = parseFloat(target.value);

        if (p === 'refOpacity') this.ref.opacity = v;
        else if (p === 'refScale') this.ref.scale = v;
        else if (p === 'refX') this.ref.offsetX = v;
        else if (p === 'refY') this.ref.offsetY = v;
        else if (p === 'hairDensity') this.hairDensity = Math.round(v);

        const out = this.controlsPanel.querySelector(`#vval-${p}`);
        if (out) out.textContent = p === 'hairDensity' ? String(Math.round(v)) : v.toFixed(2);
      });
    });

    const fileInput = this.controlsPanel.querySelector('#ref-file') as HTMLInputElement | null;
    const loadBtn = this.controlsPanel.querySelector('#ref-load');
    const clearBtn = this.controlsPanel.querySelector('#ref-clear') as HTMLButtonElement | null;
    const modeBtn = this.controlsPanel.querySelector('#ref-mode');
    const nameOut = this.controlsPanel.querySelector('#ref-name');

    loadBtn?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          this.ref.img = img;
          this.ref.name = file.name;
          if (nameOut) nameOut.textContent = file.name;
          if (clearBtn) clearBtn.disabled = false;
        };
        img.src = String(reader.result);
      };
      // Read as a data URL rather than an object URL so the photo survives for
      // the life of the studio without a revoke to remember.
      reader.readAsDataURL(file);
    });

    clearBtn?.addEventListener('click', () => {
      this.ref.img = null;
      this.ref.name = '';
      if (nameOut) nameOut.textContent = 'no reference loaded';
      if (clearBtn) clearBtn.disabled = true;
      if (fileInput) fileInput.value = '';
    });

    modeBtn?.addEventListener('click', () => {
      this.ref.over = !this.ref.over;
      modeBtn.classList.toggle('on', this.ref.over);
      modeBtn.textContent = this.ref.over ? 'Over — silhouette' : 'Behind — backdrop';
    });
  }

  /**
   * Draw the reference photograph. Centred on the same point the brush is
   * framed around, so the two start roughly aligned and the offsets are a
   * nudge rather than a hunt. Fitted to 80% of viewport height at scale 1.
   *
   * The camera angle is NOT inferred from the photo — orbit to match it by eye.
   */
  private drawReference(cx: number, cy: number, h: number) {
    const r = this.ref;
    if (!r.img || r.opacity <= 0) return;
    const ctx = this.ctx;
    const fit = (h * 0.8) / Math.max(1, r.img.naturalHeight);
    const s = fit * r.scale;
    const dw = r.img.naturalWidth * s;
    const dh = r.img.naturalHeight * s;
    ctx.save();
    ctx.globalAlpha = r.opacity;
    ctx.drawImage(r.img, cx - dw / 2 + r.offsetX, cy - dh / 2 + r.offsetY, dw, dh);
    ctx.restore();
  }

  private sliderRow(param: string, label: string, val: number, min: number, max: number, step: number): string {
    return `
      <div class="studio-slider-row">
        <div class="studio-slider-head">
          <span>${label}</span>
          <b id="val-${param}">${val.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}</b>
        </div>
        <input type="range" data-param="${param}" min="${min}" max="${max}" step="${step}" value="${val}" />
      </div>
    `;
  }

  private updateParam(param: string, val: number) {
    if (param === 'bristles') this.brush.bristles = Math.round(val);
    else if (param === 'length') this.brush.length = val;
    else if (param === 'widthRatio') this.brush.widthRatio = val;
    else if (param === 'taper') this.brush.taper = val;
    else if (param === 'segments') this.brush.segments = Math.round(val);
    else if (param === 'stiffness') this.brush.stiffness = val;
    else if (param === 'stiffnessTaper') this.brush.stiffnessTaper = val;
    else if (param === 'splayFromPressure') this.brush.splayFromPressure = val;
    else if (param === 'plasticity') this.brush.plasticity = val;
    else if (param === 'mu') this.brush.friction.mu = val;
    else if (param === 'cEta') this.brush.friction.cEta = val;
    else if (param === 'k') this.brush.friction.k = val;
    else if (param === 'capacityBelly') this.brush.reservoir.capacityBelly = val;
    else if (param === 'capacityTip') this.brush.reservoir.capacityTip = val;
    else if (param === 'waterOvercharge') this.brush.reservoir.waterOvercharge = val;
    else if (param === 'downRate') this.brush.reservoir.downRate = val;

    const valDisplay = this.controlsPanel.querySelector(`#val-${param}`);
    if (valDisplay) {
      valDisplay.textContent = val.toFixed(param === 'downRate' ? 3 : param.includes('Ratio') || param.includes('stiff') || param.includes('splay') || param.includes('taper') || param.includes('mu') || param.includes('cEta') || param.includes('plasticity') ? 2 : 0);
    }

    const hBristles = this.container.querySelector('#hud-bristles');
    if (hBristles) hBristles.textContent = String(this.brush.bristles);
    const hKind = this.container.querySelector('#hud-kind');
    if (hKind) hKind.textContent = String(this.brush.kind);
    const hSegments = this.container.querySelector('#hud-segments');
    if (hSegments) hSegments.textContent = String(this.brush.segments);
    const hSplay = this.container.querySelector('#hud-splay');
    if (hSplay) hSplay.textContent = `${(this.brush.splayFromPressure * 100).toFixed(0)}%`;

    this.spine = new Spine(this.brush, 1.0);
    this.updateJsonView();
    this.onBrushUpdate?.(this.brush);
  }

  private initEvents() {
    const canvas = this.canvas;

    // Mode Buttons
    const btnBrushMode = this.container.querySelector('#mode-drag-brush')!;
    const btnOrbitMode = this.container.querySelector('#mode-orbit-cam')!;
    const btnDebugMode = this.container.querySelector('#mode-toggle-debug')!;

    btnBrushMode.addEventListener('click', () => {
      this.interactionMode = 'brush';
      btnBrushMode.classList.add('on');
      btnOrbitMode.classList.remove('on');
      canvas.style.cursor = 'crosshair';
    });

    btnOrbitMode.addEventListener('click', () => {
      this.interactionMode = 'orbit';
      btnOrbitMode.classList.add('on');
      btnBrushMode.classList.remove('on');
      canvas.style.cursor = 'grab';
    });

    btnDebugMode.addEventListener('click', () => {
      this.showDebugSpine = !this.showDebugSpine;
      btnDebugMode.classList.toggle('on', this.showDebugSpine);
    });

    // Pointer Interaction (Mouse / Stylus / Touch)
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.lastPointerTime = performance.now();

      // Right click or Shift key forces orbit mode
      if (e.button === 2 || e.shiftKey || this.interactionMode === 'orbit') {
        this.isCamDragging = true;
      } else {
        this.isBrushActive = true;
        // Set pressure from stylus or default heavy press
        this.pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.75;
        this.syncPressureSlider();
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      const now = performance.now();
      const dt = Math.max(1, now - this.lastPointerTime);
      this.lastPointerTime = now;

      if (this.isCamDragging) {
        this.cameraAzimuth += dx * 0.008;
        this.cameraElevation = Math.max(-Math.PI / 3, Math.min(Math.PI / 2.2, this.cameraElevation + dy * 0.008));
      } else if (this.isBrushActive) {
        // Drag brush on paper plane: updates position & drag vector for spine solver
        this.brushPos.x += dx * 0.15;
        this.brushPos.y += dy * 0.15;
        this.brushDragVec.x = (dx / dt) * 8.0;
        this.brushDragVec.y = (dy / dt) * 8.0;

        if (e.pointerType === 'pen' && e.pressure > 0) {
          this.pressure = e.pressure;
          this.syncPressureSlider();
        }
      }

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    const releasePointer = (e: PointerEvent) => {
      if (this.isBrushActive) {
        this.isBrushActive = false;
        // Snap back! Restores equilibrium springiness when released
        this.brushDragVec.x = 0;
        this.brushDragVec.y = 0;
      }
      this.isCamDragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance = Math.max(40, Math.min(300, this.cameraDistance + e.deltaY * 0.15));
    }, { passive: false });

    // Sim sliders
    const pInput = this.container.querySelector('#sim-pressure') as HTMLInputElement;
    pInput.addEventListener('input', () => {
      this.pressure = parseFloat(pInput.value);
      this.syncPressureSlider();
    });

    const tInput = this.container.querySelector('#sim-tilt') as HTMLInputElement;
    const tLabel = this.container.querySelector('#sim-tilt-label') as HTMLElement;
    tInput.addEventListener('input', () => {
      this.tiltAngle = parseFloat(tInput.value);
      tLabel.textContent = `tilt (${this.tiltAngle}°)`;
    });

    const aInput = this.container.querySelector('#sim-azimuth') as HTMLInputElement;
    const aLabel = this.container.querySelector('#sim-azimuth-label') as HTMLElement;
    aInput.addEventListener('input', () => {
      this.tiltAzimuth = parseFloat(aInput.value);
      aLabel.textContent = `azimuth (${this.tiltAzimuth}°)`;
    });

    // Buttons
    this.container.querySelector('#sim-turntable')!.addEventListener('click', (e) => {
      this.isAutoRotating = !this.isAutoRotating;
      (e.target as HTMLElement).classList.toggle('on', this.isAutoRotating);
    });

    this.container.querySelector('#studio-btn-reset-cam')!.addEventListener('click', () => {
      this.cameraAzimuth = Math.PI / 4;
      this.cameraElevation = Math.PI / 6;
      this.cameraDistance = 140;
      this.brushPos.x = 0;
      this.brushPos.y = 0;
      this.brushDragVec.x = 0;
      this.brushDragVec.y = 0;
    });

    const brushSelect = this.container.querySelector('#studio-brush-select') as HTMLSelectElement;
    brushSelect.addEventListener('change', () => {
      const found = BRUSHES.find((b) => b.slug === brushSelect.value);
      if (found) {
        this.brush = JSON.parse(JSON.stringify(found));
        this.spine = new Spine(this.brush, 1.0);
        this.rebuildControlSliders();
        this.updateJsonView();
        this.onBrushUpdate?.(this.brush);
      }
    });

    // JSON Drawer Controls
    const toggleJson = () => {
      const show = this.jsonDrawer.style.display === 'none';
      this.jsonDrawer.style.display = show ? 'flex' : 'none';
    };
    this.container.querySelector('#studio-btn-toggle-json')!.addEventListener('click', toggleJson);
    this.container.querySelector('#json-close-btn')!.addEventListener('click', toggleJson);

    this.container.querySelector('#json-copy-btn')!.addEventListener('click', () => {
      navigator.clipboard.writeText(this.jsonTextArea.value);
      const btn = this.container.querySelector('#json-copy-btn') as HTMLElement;
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1200);
    });

    this.container.querySelector('#json-apply-btn')!.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(this.jsonTextArea.value);
        this.brush = parsed;
        this.spine = new Spine(this.brush, 1.0);
        this.rebuildControlSliders();
        this.onBrushUpdate?.(this.brush);
        toggleJson();
      } catch (err) {
        alert('Invalid JSON syntax: ' + (err as Error).message);
      }
    });

    // File Export / Import
    this.container.querySelector('#studio-btn-export')!.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.brush, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `${this.brush.slug || 'custom-brush'}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });

    const fileInput = this.container.querySelector('#studio-file-input') as HTMLInputElement;
    this.container.querySelector('#studio-btn-import-trigger')!.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          this.brush = parsed;
          this.spine = new Spine(this.brush, 1.0);
          this.rebuildControlSliders();
          this.updateJsonView();
          this.onBrushUpdate?.(this.brush);
        } catch (err) {
          alert('Error importing JSON file: ' + (err as Error).message);
        }
      };
      reader.readAsText(file);
    });

    if (this.onClose) {
      const closeBtn = this.container.querySelector('#studio-btn-close');
      if (closeBtn) closeBtn.addEventListener('click', () => this.onClose?.());
    }
  }

  private syncPressureSlider() {
    const pInput = this.container.querySelector('#sim-pressure') as HTMLInputElement;
    const pLabel = this.container.querySelector('#sim-pressure-label') as HTMLElement;
    if (pInput) pInput.value = String(this.pressure);
    if (pLabel) pLabel.textContent = `pressure (${(this.pressure * 100).toFixed(0)}%)`;
  }

  private updateJsonView() {
    this.jsonTextArea.value = JSON.stringify(this.brush, null, 2);
  }

  private startRenderLoop() {
    const render = () => {
      if (this.isAutoRotating) {
        this.cameraAzimuth += 0.008;
      }
      // Damped decay of drag vector to demonstrate springy bounceback
      if (!this.isBrushActive) {
        this.brushDragVec.x *= 0.82;
        this.brushDragVec.y *= 0.82;
      }
      this.render3D();
      this.animReqId = requestAnimationFrame(render);
    };
    this.animReqId = requestAnimationFrame(render);
  }

  public destroy() {
    if (this.animReqId !== null) cancelAnimationFrame(this.animReqId);
    this.container.remove();
  }

  // ---------------------------------------------------------------------------
  // Realistic 3D Paintbrush Renderer
  // ---------------------------------------------------------------------------

  private render3D() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // Deep dark laboratory background
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h));
    bgGrad.addColorStop(0, '#161920');
    bgGrad.addColorStop(1, '#090a0c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Solve Kinematic Spine with brush position, pressure, & drag vector
    const tiltRad = (this.tiltAngle * Math.PI) / 180;
    const azRad = (this.tiltAzimuth * Math.PI) / 180;

    const totalLen = this.brush.length;
    const restZ = totalLen * Math.cos(tiltRad);
    const ferruleZ = Math.max(2, restZ * (1 - this.pressure * 0.7 * this.brush.splayFromPressure));

    const fx = this.brushPos.x;
    const fy = this.brushPos.y;
    const fz = ferruleZ;

    const dirX = Math.sin(tiltRad) * Math.cos(azRad);
    const dirY = Math.sin(tiltRad) * Math.sin(azRad);
    const dirZ = -Math.cos(tiltRad);

    const dragX = dirX * this.pressure * 5 + this.brushDragVec.x;
    const dragY = dirY * this.pressure * 5 + this.brushDragVec.y;
    const prefDir: [number, number] = [dirX || 1, dirY || 0];

    this.spine.solve(fx, fy, fz, [dirX, dirY, dirZ], [dragX, dragY], prefDir);

    // Frame the brush, not the origin. The tuft sits at z=0 and the handle runs
    // up to ~96, so aiming at the middle of the shaft keeps the whole tool in
    // view instead of parking it in a corner. The x offset leaves room for the
    // controls column on the left.
    const cx = w * 0.58;
    const cy = h * 0.56;
    this.cameraTarget = { x: 0, y: 0, z: 34 };

    const cosAz = Math.cos(this.cameraAzimuth);
    const sinAz = Math.sin(this.cameraAzimuth);
    const cosEl = Math.cos(this.cameraElevation);
    const sinEl = Math.sin(this.cameraElevation);

    const project = (x: number, y: number, z: number) => {
      const rx = x - this.cameraTarget.x;
      const ry = y - this.cameraTarget.y;
      const rz = z - this.cameraTarget.z;

      const x1 = rx * cosAz - ry * sinAz;
      const y1 = rx * sinAz + ry * cosAz;
      const z1 = rz;

      // [FIXED] The elevation rotation had world height and view depth swapped,
      // so +z — up off the paper — rendered DOWNWARD and the brush hung with its
      // handle below the tuft. Screen-up must rise with z; depth must grow with
      // distance along the view direction. At elevation 0 this reduces to
      // "screen up = height, depth = y", which is the check to redo if it ever
      // looks wrong again.
      const x2 = x1;
      const y2 = z1 * cosEl - y1 * sinEl;
      const z2 = y1 * cosEl + z1 * sinEl;

      const fov = 460;
      const dist = z2 + this.cameraDistance;
      const scale = fov / Math.max(10, dist);

      return {
        px: cx + x2 * scale,
        py: cy - y2 * scale,
        scale,
        depth: dist,
      };
    };

    // 0. Reference photograph, backdrop mode — behind everything, so the brush
    //    and grid draw on top of it.
    if (!this.ref.over) this.drawReference(cx, cy, h);

    // 1. Paper Grid Surface (Z = 0)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 80;
    const gridStep = 10;
    for (let g = -gridSize; g <= gridSize; g += gridStep) {
      const p1 = project(-gridSize, g, 0);
      const p2 = project(gridSize, g, 0);
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
      ctx.stroke();

      const p3 = project(g, -gridSize, 0);
      const p4 = project(g, gridSize, 0);
      ctx.beginPath();
      ctx.moveTo(p3.px, p3.py);
      ctx.lineTo(p4.px, p4.py);
      ctx.stroke();
    }

    // 2. Soft Contact Shadow on Paper
    const shadowOrigin = project(fx, fy, 0);
    const shadowRadius = (this.brush.length * this.brush.widthRatio * (1 + this.pressure * this.brush.splayFromPressure)) * shadowOrigin.scale * 0.4;
    const shadowGrad = ctx.createRadialGradient(shadowOrigin.px, shadowOrigin.py, 0, shadowOrigin.px, shadowOrigin.py, Math.max(1, shadowRadius));
    shadowGrad.addColorStop(0, `rgba(18, 12, 8, ${0.25 + this.pressure * 0.4})`);
    shadowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(shadowOrigin.px, shadowOrigin.py, Math.max(1, shadowRadius), 0, Math.PI * 2);
    ctx.fill();

    // ---- Brush geometry, built in 3D around the solved spine ----------------
    //
    // Everything below is DRAWING ONLY. The spine was solved above and is not
    // touched here, so if the brush behaves oddly that is a finding about the
    // brush engine, not about this viewer.
    //
    // Three things stopped the old version reading as a brush: the tuft was a
    // flat fan rather than a volume of hairs, the ferrule and handle were
    // screen-aligned 2D shapes that did not turn with the camera, and nothing
    // was depth-sorted so far hairs painted over near ones.

    const joints = this.spine.joints;
    const isFlat = this.brush.kind === 'flat';
    const ferrulePos = project(fx, fy, fz);

    // A frame that follows the spine. `axis` is the local tangent; `u` and `v`
    // span the cross-section. Carried joint to joint by parallel transport
    // (re-project the previous `u` perpendicular to the new tangent) so the
    // tuft does not twist as the spine bends — a fixed world basis would spin
    // the bristles around the shaft whenever the brush leans.
    type Frame = { o: [number, number, number]; u: [number, number, number]; v: [number, number, number] };
    const sub3 = (a: number[], b: number[]) =>
      [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as [number, number, number];
    const cross3 = (a: number[], b: number[]) =>
      [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] as [number, number, number];
    const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm3 = (a: [number, number, number]) => {
      const m = Math.hypot(a[0], a[1], a[2]) || 1;
      return [a[0] / m, a[1] / m, a[2] / m] as [number, number, number];
    };

    const frames: Frame[] = [];
    let carriedU: [number, number, number] | null = null;
    for (let j = 0; j < joints.length; j++) {
      const nxt = joints[Math.min(j + 1, joints.length - 1)];
      const prv = joints[Math.max(j - 1, 0)];
      let axis = norm3(sub3([nxt.x, nxt.y, nxt.z], [prv.x, prv.y, prv.z]));
      if (!isFinite(axis[0])) axis = [0, 0, -1];

      let u: [number, number, number];
      if (carriedU === null) {
        // Seed from the tilt azimuth so a flat brush's chisel faces the lean.
        const seed: [number, number, number] = [-Math.sin(azRad), Math.cos(azRad), 0];
        u = norm3(cross3(cross3(axis, seed), axis));
        if (!isFinite(u[0]) || Math.hypot(u[0], u[1], u[2]) < 1e-6) {
          u = norm3(cross3(axis, [0, 0, 1]));
        }
      } else {
        const p = dot3(carriedU, axis);
        u = norm3([carriedU[0] - axis[0] * p, carriedU[1] - axis[1] * p, carriedU[2] - axis[2] * p]);
      }
      carriedU = u;
      frames.push({ o: [joints[j].x, joints[j].y, joints[j].z], u, v: norm3(cross3(axis, u)) });
    }

    // Cross-section along the hair. A round brush is fat at the belly and
    // closes to a point; a flat keeps its chisel width nearly to the edge.
    // `taper` is the brush row, not a number invented here.
    const tuftR = this.brush.length * this.brush.widthRatio * 0.5;
    const profile = (t: number) => {
      const belly = 1 + 0.28 * Math.sin(Math.PI * Math.min(1, t / 0.35)) * (isFlat ? 0.3 : 1);
      const close = isFlat ? 1 - 0.12 * t : Math.pow(1 - t, 0.55 + this.brush.taper * 0.85);
      return Math.max(0.02, belly * close);
    };
    // Splay opens the tuft outward under pressure, strongest at the tip where
    // the hairs are free. Geometric, exactly as Card 1 says splay is.
    const splayAt = (t: number) =>
      1 + this.pressure * this.brush.splayFromPressure * (0.25 + 0.75 * t);

    const placeBristle = (ru: number, rv: number, j: number) => {
      const f = frames[j];
      const t = j / Math.max(1, joints.length - 1);
      const s = profile(t) * splayAt(t);
      return project(
        f.o[0] + (f.u[0] * ru + f.v[0] * rv) * s,
        f.o[1] + (f.u[1] * ru + f.v[1] * rv) * s,
        f.o[2] + (f.u[2] * ru + f.v[2] * rv) * s,
      );
    };

    // Bristle roots spread over the ferrule's cross-section — a disc for a
    // round, a flattened ellipse for a flat. The golden angle gives even
    // coverage without clumping. THIS is what turns the tuft from a sheet into
    // a volume: radius and angle are now independent, where before one -1..1
    // parameter drove both and put every hair on a single curve.
    // Hair count is a VIEWER setting, not `brush.bristles` — see `hairDensity`.
    // The old line was `clamp(brush.bristles * 2, 48, 220)`, which drew 68
    // hairs for the flat sable and read as a fringe rather than a tuft.
    const numBristles = Math.max(12, Math.round(this.hairDensity));
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    const midJoint = Math.floor(joints.length / 2);
    const hairs: { ru: number; rv: number; core: number; depth: number }[] = [];
    for (let b = 0; b < numBristles; b++) {
      const rad = Math.sqrt((b + 0.5) / numBristles);   // even coverage by area
      const ang = b * GOLDEN;
      let ru = Math.cos(ang) * rad * tuftR;
      let rv = Math.sin(ang) * rad * tuftR;
      if (isFlat) { ru *= 1.35; rv *= 0.26; }           // chisel cross-section
      hairs.push({ ru, rv, core: 1 - rad, depth: placeBristle(ru, rv, midJoint).depth });
    }
    // Far hairs first, so near ones land on top and the tuft reads solid.
    hairs.sort((a, b) => b.depth - a.depth);

    // ---- Handle and ferrule, swept as real tubes around the shaft -----------
    const shaftFrame = frames[0];
    const axisUp = norm3(sub3(
      [joints[0].x, joints[0].y, joints[0].z],
      [joints[1].x, joints[1].y, joints[1].z],
    ));
    const tube = (
      from: number, to: number, rFrom: number, rTo: number,
      shade: (facing: number) => string, outline: string | null,
    ) => {
      const SIDES = 20;
      for (let i = 0; i < SIDES; i++) {
        const a0 = (i / SIDES) * Math.PI * 2;
        const a1 = ((i + 1) / SIDES) * Math.PI * 2;
        const quad: [number, number, number][] = [
          [a0, from, rFrom], [a1, from, rFrom], [a1, to, rTo], [a0, to, rTo],
        ];
        const pts = quad.map(([a, along, r]) => {
          const c = Math.cos(a), s = Math.sin(a);
          return project(
            fx + axisUp[0] * along + (shaftFrame.u[0] * c + shaftFrame.v[0] * s) * r,
            fy + axisUp[1] * along + (shaftFrame.u[1] * c + shaftFrame.v[1] * s) * r,
            fz + axisUp[2] * along + (shaftFrame.u[2] * c + shaftFrame.v[2] * s) * r,
          );
        });
        // Screen-space winding tells whether this strip faces the camera —
        // enough shading for a lathe-turned shape, and it costs nothing.
        const e1x = pts[1].px - pts[0].px, e1y = pts[1].py - pts[0].py;
        const e2x = pts[3].px - pts[0].px, e2y = pts[3].py - pts[0].py;
        const facing = Math.max(0, Math.min(1, (e1x * e2y - e1y * e2x) / 240 + 0.5));
        ctx.fillStyle = shade(facing);
        ctx.beginPath();
        ctx.moveTo(pts[0].px, pts[0].py);
        for (let k = 1; k < 4; k++) ctx.lineTo(pts[k].px, pts[k].py);
        ctx.closePath();
        ctx.fill();
        if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 0.5; ctx.stroke(); }
      }
    };

    const shaftR = tuftR * 0.92;
    tube(18, 96, shaftR * 0.98, shaftR * 0.66, (f) => {          // wooden handle
      const l = 0.22 + 0.78 * f;
      return `rgb(${Math.round(96 * l + 18)}, ${Math.round(56 * l + 12)}, ${Math.round(30 * l + 8)})`;
    }, null);
    tube(0, 18, shaftR, shaftR * 0.99, (f) => {                  // metal ferrule
      const l = 0.16 + 0.84 * Math.pow(f, 0.7);
      return `rgb(${Math.round(226 * l + 24)}, ${Math.round(208 * l + 22)}, ${Math.round(160 * l + 18)})`;
    }, 'rgba(0,0,0,0.18)');
    tube(5, 6.4, shaftR * 1.02, shaftR * 1.02, () => 'rgba(0,0,0,0.30)', null);   // crimp
    tube(12, 13.4, shaftR * 1.02, shaftR * 1.02, () => 'rgba(0,0,0,0.30)', null);

    // ---- The tuft -----------------------------------------------------------
    //
    // Hair weight has to fall as the count rises or a dense tuft turns into a
    // solid brown slab. Width goes as 1/sqrt(density) to hold the total covered
    // area roughly constant; alpha falls more gently, because a real packed
    // tuft IS opaque through the middle and only wispy at its edges. `240` is
    // the reference count these two curves are normalised against, not a
    // physical quantity.
    const DENSITY_REF = 240;
    const density = Math.max(0.05, numBristles / DENSITY_REF);
    const widthScale = 1 / Math.sqrt(density);
    const alphaScale = Math.pow(density, -0.35);

    // One stroke() per hair would be ~850 canvas calls a frame. Hairs are
    // already sorted far-to-near, so slicing that order into depth bands and
    // sub-grouping each band by core position collapses it to
    // DEPTH_BANDS × CORE_BANDS strokes while keeping both the painter's order
    // and the two shading cues. Reordering within a band is invisible: every
    // hair in it is at nearly the same depth.
    const DEPTH_BANDS = 10;
    const CORE_BANDS = 4;
    for (let db = 0; db < DEPTH_BANDS; db++) {
      const lo = Math.floor((db * hairs.length) / DEPTH_BANDS);
      const hi = Math.floor(((db + 1) * hairs.length) / DEPTH_BANDS);
      if (hi <= lo) continue;

      // Depth shading: hairs at the back go darker so the tuft has body rather
      // than reading as a flat scribble. Sampled at the middle of the band.
      const bandDepth = hairs[(lo + hi) >> 1].depth;
      const near = Math.max(0, Math.min(1, (this.cameraDistance + 30 - bandDepth) / 60));
      const warm = 0.45 + 0.55 * near;
      const alpha = Math.min(1, (0.38 + 0.42 * near) * alphaScale);

      for (let cb = 0; cb < CORE_BANDS; cb++) {
        const core = (cb + 0.5) / CORE_BANDS;
        ctx.strokeStyle = `rgba(${Math.round((120 + 115 * core) * warm)}, `
          + `${Math.round((74 + 86 * core) * warm)}, `
          + `${Math.round((36 + 52 * core) * warm)}, ${alpha.toFixed(3)})`;
        ctx.lineWidth = Math.max(0.3, (0.7 + 1.5 * core) * ferrulePos.scale * 0.16 * widthScale);

        let drew = false;
        ctx.beginPath();
        for (let i = lo; i < hi; i++) {
          const hair = hairs[i];
          const band = Math.min(CORE_BANDS - 1, Math.floor(hair.core * CORE_BANDS));
          if (band !== cb) continue;
          drew = true;
          for (let j = 0; j < joints.length; j++) {
            const p = placeBristle(hair.ru, hair.rv, j);
            if (j === 0) ctx.moveTo(p.px, p.py);
            else ctx.lineTo(p.px, p.py);
          }
        }
        if (drew) ctx.stroke();
      }
    }

    // 6. Optional Joint Skeleton Debug Overlay
    if (this.showDebugSpine) {
      ctx.strokeStyle = 'rgba(82, 169, 221, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let j = 0; j < joints.length; j++) {
        const p = project(joints[j].x, joints[j].y, joints[j].z);
        if (j === 0) ctx.moveTo(p.px, p.py);
        else ctx.lineTo(p.px, p.py);
      }
      ctx.stroke();

      joints.forEach((j) => {
        const p = project(j.x, j.y, j.z);
        ctx.beginPath();
        ctx.arc(p.px, p.py, j.contact ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = j.contact ? '#d8b26a' : '#52a9dd';
        ctx.fill();
      });

      // Anisotropic Friction Lobe Vector Arrow
      const tipNode = project(this.spine.tip.x, this.spine.tip.y, this.spine.tip.z);
      const arrowLen = 25 * tipNode.scale * 0.2;
      const arrowX = tipNode.px + dirX * arrowLen;
      const arrowY = tipNode.py - dirY * arrowLen;

      ctx.strokeStyle = '#52a9dd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tipNode.px, tipNode.py);
      ctx.lineTo(arrowX, arrowY);
      ctx.stroke();
    }

    // 7. Reference photograph, silhouette mode — over the top, so you can see
    //    where your outline leaves the real brush's.
    if (this.ref.over) this.drawReference(cx, cy, h);
  }
}
