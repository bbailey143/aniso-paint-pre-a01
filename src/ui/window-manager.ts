type WindowSpec = { selector: string; title: string; side?: 'left' | 'right' | 'free' };
type DragState = { host: HTMLElement; pointerId: number; offsetX: number; offsetY: number };
const SPECS: WindowSpec[] = [
  { selector: '#hud', title: 'ANISO-PAINT', side: 'left' },
  { selector: '#stylus', title: 'STYLUS', side: 'left' },
  { selector: '#gauges', title: 'CONSERVATION', side: 'left' },
  { selector: '#conte-viewer', title: 'CONTE CONTACT', side: 'right' },
  { selector: '#palette', title: 'PALETTE', side: 'right' },
];
const SNAP_DISTANCE = 18;
const SIDE_DISTANCE = 26;

/** DOM-only window manager. The Rust/WebGPU engine never sees this layer. */
export class WindowManager {
  private readonly snapLayer: HTMLElement;
  private readonly windows: HTMLElement[] = [];
  private drag: DragState | null = null;
  private zCounter = 40;

  constructor() {
    this.snapLayer = document.createElement('div');
    this.snapLayer.className = 'window-snap-layer';
    this.snapLayer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.snapLayer);
    this.registerExisting();
    this.observeNewPanels();
    window.addEventListener('pointermove', (event) => this.moveDrag(event));
    window.addEventListener('pointerup', (event) => this.endDrag(event));
    window.addEventListener('pointercancel', (event) => this.endDrag(event));
    window.addEventListener('resize', () => this.clampAll());
  }

  private registerExisting() {
    for (const spec of SPECS) {
      const element = document.querySelector(spec.selector);
      if (element instanceof HTMLElement) this.register(element, spec.title, spec.side ?? 'free');
    }
  }

  private observeNewPanels() {
    const observer = new MutationObserver(() => {
      document.querySelectorAll<HTMLElement>('.medium-info:not(.window)').forEach((element) => {
        this.register(element, element.getAttribute('aria-label')?.replace(/ settings$/i, '') ?? 'SETTINGS', 'free');
      });
    });
    observer.observe(document.body, { childList: true });
  }

  private register(element: HTMLElement, title: string, side: WindowSpec['side']) {
    if (element.classList.contains('window')) return;
    element.classList.add('window');
    element.dataset.windowTitle = title;
    element.dataset.windowSide = side ?? 'free';
    element.style.zIndex = String(this.zCounter++);
    this.createChrome(element, title);
    this.windows.push(element);
    element.addEventListener('pointerdown', () => { element.style.zIndex = String(this.zCounter++); }, { passive: true });
    this.positionInitial(element, side ?? 'free');
  }

  private createChrome(element: HTMLElement, title: string) {
    const titlebar = document.createElement('div');
    titlebar.className = 'window-titlebar';
    titlebar.innerHTML = `<span class="window-title">${title}</span><span class="window-grip" aria-hidden="true">⠿</span>`;
    titlebar.setAttribute('role', 'button');
    titlebar.setAttribute('aria-label', `Drag ${title} window`);
    titlebar.tabIndex = 0;
    const content = document.createElement('div');
    content.className = 'window-content';
    while (element.firstChild) content.appendChild(element.firstChild);
    element.append(titlebar, content);
    titlebar.addEventListener('pointerdown', (event) => this.beginDrag(event, element, titlebar));
    titlebar.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); element.classList.toggle('window-expanded'); }
    });
  }

  private positionInitial(element: HTMLElement, side: WindowSpec['side']) {
    const rect = element.getBoundingClientRect();
    if (side === 'left') { element.style.left = `${Math.max(12, rect.left)}px`; element.style.right = 'auto'; }
    else if (side === 'right') { element.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`; element.style.left = 'auto'; }
    else { element.style.left = `${rect.left}px`; element.style.top = `${rect.top}px`; element.style.right = 'auto'; element.style.bottom = 'auto'; }
  }

  private beginDrag(event: PointerEvent, host: HTMLElement, titlebar: HTMLElement) {
    if (event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    this.drag = { host, pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    host.classList.add('window-dragging'); titlebar.classList.add('window-grabbing');
    host.setPointerCapture?.(event.pointerId); this.snapLayer.classList.add('window-snap-active'); event.preventDefault();
  }

  private moveDrag(event: PointerEvent) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const { host, offsetX, offsetY } = this.drag;
    host.style.left = `${event.clientX - offsetX}px`; host.style.top = `${event.clientY - offsetY}px`; host.style.right = 'auto'; host.style.bottom = 'auto';
    const rect = host.getBoundingClientRect();
    this.snapLayer.classList.toggle('snap-left-hot', rect.left <= SIDE_DISTANCE);
    this.snapLayer.classList.toggle('snap-right-hot', window.innerWidth - rect.right <= SIDE_DISTANCE);
  }

  private endDrag(event: PointerEvent) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const { host } = this.drag; const titlebar = host.querySelector<HTMLElement>('.window-titlebar');
    host.releasePointerCapture?.(event.pointerId); const snapped = this.snap(host);
    host.classList.remove('window-dragging'); titlebar?.classList.remove('window-grabbing'); this.drag = null;
    this.snapLayer.classList.remove('window-snap-active', 'snap-left-hot', 'snap-right-hot'); if (snapped) this.flashSnap(host); this.save();
  }

  private snap(host: HTMLElement) {
    let didSnap = false; let rect = host.getBoundingClientRect();
    if (rect.left <= SIDE_DISTANCE) { host.style.left = '12px'; host.style.right = 'auto'; didSnap = true; }
    else if (window.innerWidth - rect.right <= SIDE_DISTANCE) { host.style.right = '12px'; host.style.left = 'auto'; didSnap = true; }
    for (const other of this.windows) {
      if (other === host || other.classList.contains('window-dragging')) continue;
      const target = other.getBoundingClientRect(); rect = host.getBoundingClientRect();
      if (Math.abs(rect.bottom - target.top) <= SNAP_DISTANCE && this.overlapX(rect, target)) { host.style.top = `${target.bottom}px`; didSnap = true; }
      else if (Math.abs(rect.top - target.bottom) <= SNAP_DISTANCE && this.overlapX(rect, target)) { host.style.top = `${target.top - rect.height}px`; didSnap = true; }
      rect = host.getBoundingClientRect();
      if (Math.abs(rect.right - target.left) <= SNAP_DISTANCE && this.overlapY(rect, target)) { host.style.left = `${target.left - rect.width}px`; didSnap = true; }
      else if (Math.abs(rect.left - target.right) <= SNAP_DISTANCE && this.overlapY(rect, target)) { host.style.left = `${target.right}px`; didSnap = true; }
    }
    return didSnap;
  }

  private overlapX(a: DOMRect, b: DOMRect) { return a.right > b.left + 8 && a.left < b.right - 8; }
  private overlapY(a: DOMRect, b: DOMRect) { return a.bottom > b.top + 8 && a.top < b.bottom - 8; }
  private flashSnap(host: HTMLElement) { host.classList.add('window-snapped'); window.setTimeout(() => host.classList.remove('window-snapped'), 420); }
  private clampAll() { for (const element of this.windows) { const rect = element.getBoundingClientRect(); if (rect.right > window.innerWidth) element.style.left = `${Math.max(12, window.innerWidth - rect.width - 12)}px`; if (rect.bottom > window.innerHeight) element.style.top = `${Math.max(60, window.innerHeight - rect.height - 12)}px`; } }
  save() { localStorage.setItem('aniso-window-layout', JSON.stringify(this.windows.map((element) => { const rect = element.getBoundingClientRect(); return { id: element.id, left: rect.left, top: rect.top, width: rect.width, height: rect.height }; }))); }
}
