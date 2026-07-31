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
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Interactive Test State
  private pressure = 0.4;
  private tiltAngle = 30; // degrees
  private tiltAzimuth = 45; // degrees
  private isAutoRotating = false;
  private animReqId: number | null = null;

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
        <div class="studio-viewport-container">
          <canvas id="studio-canvas"></canvas>
          
          <div class="studio-hud-overlay panel">
            <div class="stylus-row"><span>bristle count</span><b id="hud-bristles">${this.brush.bristles}</b></div>
            <div class="stylus-row"><span>kind</span><b id="hud-kind">${this.brush.kind}</b></div>
            <div class="stylus-row"><span>spine joints</span><b id="hud-segments">${this.brush.segments}</b></div>
            <div class="stylus-row"><span>splay rating</span><b id="hud-splay">${(this.brush.splayFromPressure * 100).toFixed(0)}%</b></div>
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

    this.controlsPanel.querySelectorAll('input[type="range"]').forEach((input) => {
      input.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const param = target.dataset.param!;
        const val = parseFloat(target.value);
        this.updateParam(param, val);
      });
    });
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

    // Update HUD overlay
    const hBristles = this.container.querySelector('#hud-bristles');
    if (hBristles) hBristles.textContent = String(this.brush.bristles);
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
    canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.cameraAzimuth += dx * 0.008;
      this.cameraElevation = Math.max(-Math.PI / 3, Math.min(Math.PI / 2.2, this.cameraElevation + dy * 0.008));
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    canvas.addEventListener('pointerup', (e) => {
      this.isDragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance = Math.max(40, Math.min(300, this.cameraDistance + e.deltaY * 0.15));
    }, { passive: false });

    // Sim sliders
    const pInput = this.container.querySelector('#sim-pressure') as HTMLInputElement;
    const pLabel = this.container.querySelector('#sim-pressure-label') as HTMLElement;
    pInput.addEventListener('input', () => {
      this.pressure = parseFloat(pInput.value);
      pLabel.textContent = `pressure (${(this.pressure * 100).toFixed(0)}%)`;
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

  private updateJsonView() {
    this.jsonTextArea.value = JSON.stringify(this.brush, null, 2);
  }

  private startRenderLoop() {
    const render = () => {
      if (this.isAutoRotating) {
        this.cameraAzimuth += 0.01;
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

  private render3D() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h));
    bgGrad.addColorStop(0, '#15181e');
    bgGrad.addColorStop(1, '#090a0c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const tiltRad = (this.tiltAngle * Math.PI) / 180;
    const azRad = (this.tiltAzimuth * Math.PI) / 180;

    const totalLen = this.brush.length;
    const restZ = totalLen * Math.cos(tiltRad);
    const ferruleZ = Math.max(2, restZ * (1 - this.pressure * 0.7 * this.brush.splayFromPressure));

    const fx = 0;
    const fy = 0;
    const fz = ferruleZ;

    const dirX = Math.sin(tiltRad) * Math.cos(azRad);
    const dirY = Math.sin(tiltRad) * Math.sin(azRad);
    const dirZ = -Math.cos(tiltRad);

    const dragX = dirX * this.pressure * 5;
    const dragY = dirY * this.pressure * 5;
    const prefDir: [number, number] = [dirX || 1, dirY || 0];

    this.spine.solve(fx, fy, fz, [dirX, dirY, dirZ], [dragX, dragY], prefDir);

    const cx = w / 2;
    const cy = h / 2 + 30;

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

      const x2 = x1;
      const y2 = y1 * cosEl - z1 * sinEl;
      const z2 = y1 * sinEl + z1 * cosEl;

      const fov = 450;
      const dist = z2 + this.cameraDistance;
      const scale = fov / Math.max(10, dist);

      return {
        px: cx + x2 * scale,
        py: cy - y2 * scale,
        scale,
        depth: dist,
      };
    };

    // Paper Grid Surface (Z = 0)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    const gridSize = 60;
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

    // Contact Shadow
    const shadowOrigin = project(0, 0, 0);
    const shadowRadius = (this.brush.length * this.brush.widthRatio * (1 + this.pressure * this.brush.splayFromPressure)) * shadowOrigin.scale * 0.35;
    const shadowGrad = ctx.createRadialGradient(shadowOrigin.px, shadowOrigin.py, 0, shadowOrigin.px, shadowOrigin.py, Math.max(1, shadowRadius));
    shadowGrad.addColorStop(0, `rgba(216, 178, 106, ${0.15 + this.pressure * 0.35})`);
    shadowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(shadowOrigin.px, shadowOrigin.py, Math.max(1, shadowRadius), 0, Math.PI * 2);
    ctx.fill();

    // Metallic Ferrule
    const fNode = project(fx, fy, fz);
    const ferruleWidth = (this.brush.length * this.brush.widthRatio * 0.45) * fNode.scale;
    const ferruleHeight = 18 * fNode.scale;

    ctx.fillStyle = 'rgba(216, 178, 106, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(fNode.px - ferruleWidth / 2, fNode.py - ferruleHeight, ferruleWidth, ferruleHeight);
    ctx.fill();
    ctx.stroke();

    // 3D Bristle Strands
    const numBristles = this.brush.bristles;
    const joints = this.spine.joints;
    const isFlat = this.brush.kind === 'flat';

    ctx.lineWidth = Math.max(1, 1.2 * fNode.scale * 0.15);

    for (let b = 0; b < numBristles; b++) {
      const u = (b / Math.max(1, numBristles - 1)) * 2 - 1;
      const bristleAngle = u * Math.PI * (isFlat ? 0.1 : 0.8);
      const bristleOffset = u * (this.brush.length * this.brush.widthRatio * 0.35);

      const splay = 1 + this.pressure * this.brush.splayFromPressure * Math.abs(u);

      ctx.strokeStyle = u === 0 ? '#d8b26a' : `rgba(215, 200, 170, ${0.4 + (1 - Math.abs(u)) * 0.4})`;
      ctx.beginPath();

      for (let j = 0; j < joints.length; j++) {
        const joint = joints[j];
        const t = j / (joints.length - 1);

        const offsetX = isFlat ? bristleOffset * splay : Math.cos(bristleAngle) * bristleOffset * t * splay;
        const offsetY = isFlat ? 0 : Math.sin(bristleAngle) * bristleOffset * t * splay;

        const p = project(joint.x + offsetX, joint.y + offsetY, joint.z);
        if (j === 0) ctx.moveTo(p.px, p.py);
        else ctx.lineTo(p.px, p.py);
      }
      ctx.stroke();
    }

    // Kinematic Spine Chain
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
      ctx.arc(p.px, p.py, j.contact ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = j.contact ? '#d8b26a' : '#52a9dd';
      ctx.fill();
    });

    // Friction Lobe Indicator
    const tipNode = project(this.spine.tip.x, this.spine.tip.y, this.spine.tip.z);
    const arrowLen = 22 * tipNode.scale * 0.2;
    const arrowX = tipNode.px + dirX * arrowLen;
    const arrowY = tipNode.py - dirY * arrowLen;

    ctx.strokeStyle = '#52a9dd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tipNode.px, tipNode.py);
    ctx.lineTo(arrowX, arrowY);
    ctx.stroke();
  }
}
