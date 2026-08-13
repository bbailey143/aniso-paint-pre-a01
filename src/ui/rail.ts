// Edge rails — the chrome's way of staying off the paper.
//
// A rail is a thin strip of tabs welded to one side of the screen. Each tab
// owns a drawer that slides out from that same edge, and only one drawer per
// rail is open at a time: the painter can never end up with three panels
// stacked over the sheet, because opening the second one closes the first.
//
// Everything starts closed. A blank sheet should be a blank sheet.
//
// The rail deliberately does not auto-close when the canvas is touched. Closing
// a panel out from under someone who is mid-adjustment is worse than the panel
// being open — predictable beats clever.

export type RailSide = 'left' | 'right';

export interface RailPanel {
  /** Stable id, used for the tab's aria wiring. */
  id: string;
  /** The word on the tab. Keep it to one short word — it is set vertically. */
  label: string;
  /** Longer text for the tab's tooltip and accessible name. */
  title?: string;
  /** The drawer's contents. Re-parented into the drawer body. */
  body: HTMLElement;
}

export interface RailToggle {
  id: string;
  label: string;
  title?: string;
  /** Starting state of the toggle. */
  on?: boolean;
  onChange(on: boolean): void;
}

export class Rail {
  private nav: HTMLElement;
  private tabs = new Map<string, HTMLButtonElement>();
  private drawers = new Map<string, HTMLElement>();
  private openId: string | null = null;

  constructor(private side: RailSide, mount: HTMLElement = document.body) {
    this.nav = document.createElement('nav');
    this.nav.className = `rail rail-${side}`;
    this.nav.setAttribute('aria-label', `${side} tool rail`);
    mount.appendChild(this.nav);
  }

  /** Add a tab whose drawer slides out of this rail's edge. */
  addPanel({ id, label, title, body }: RailPanel) {
    const drawer = document.createElement('aside');
    drawer.className = `drawer drawer-${this.side} panel`;
    drawer.id = `drawer-${id}`;
    drawer.setAttribute('aria-label', title ?? label);
    drawer.hidden = true;

    const head = document.createElement('div');
    head.className = 'drawer-head';
    const heading = document.createElement('span');
    heading.className = 'drawer-title';
    heading.textContent = title ?? label;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'drawer-close';
    close.textContent = '×';
    close.title = `Close ${label}`;
    close.setAttribute('aria-label', `Close ${label}`);
    close.addEventListener('click', () => this.close());
    head.append(heading, close);

    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'drawer-body';
    bodyWrap.appendChild(body);

    drawer.append(head, bodyWrap);
    // The drawer is a sibling of the rail rather than a child of it, so the
    // rail can keep a small hit area while the drawer takes real width.
    this.nav.parentElement!.appendChild(drawer);

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'rail-tab';
    tab.textContent = label;
    tab.title = title ?? label;
    tab.setAttribute('aria-expanded', 'false');
    tab.setAttribute('aria-controls', drawer.id);
    tab.addEventListener('click', () => this.toggle(id));

    this.nav.appendChild(tab);
    this.tabs.set(id, tab);
    this.drawers.set(id, drawer);
    return drawer;
  }

  /** Add a tab that flips something on and off instead of opening a drawer. */
  addToggle({ id, label, title, on = false, onChange }: RailToggle) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'rail-tab rail-tab-toggle' + (on ? ' on' : '');
    tab.textContent = label;
    tab.title = title ?? label;
    tab.setAttribute('aria-pressed', String(on));
    let state = on;
    tab.addEventListener('click', () => {
      state = !state;
      tab.classList.toggle('on', state);
      tab.setAttribute('aria-pressed', String(state));
      onChange(state);
    });
    this.nav.appendChild(tab);
    this.tabs.set(id, tab);
    return tab;
  }

  toggle(id: string) {
    if (this.openId === id) this.close();
    else this.open(id);
  }

  open(id: string) {
    const drawer = this.drawers.get(id);
    if (!drawer) return;
    if (this.openId && this.openId !== id) this.close();
    drawer.hidden = false;
    // Force the un-hidden layout to settle before the class flips, so the
    // transition has a start state to slide from. Deliberately NOT
    // requestAnimationFrame: this app only schedules frames when paint is
    // moving, and a throttled or non-compositing page would then leave the
    // drawer un-hidden but still parked off the edge of the screen.
    void drawer.offsetHeight;
    drawer.classList.add('open');
    const tab = this.tabs.get(id);
    tab?.classList.add('on');
    tab?.setAttribute('aria-expanded', 'true');
    this.openId = id;
  }

  close() {
    if (!this.openId) return;
    const id = this.openId;
    const drawer = this.drawers.get(id);
    const tab = this.tabs.get(id);
    tab?.classList.remove('on');
    tab?.setAttribute('aria-expanded', 'false');
    this.openId = null;
    if (!drawer) return;
    drawer.classList.remove('open');
    // Stay in the layout until the slide finishes, then leave it entirely so a
    // closed drawer cannot swallow a pointer heading for the paper.
    const done = () => { if (!drawer.classList.contains('open')) drawer.hidden = true; };
    drawer.addEventListener('transitionend', done, { once: true });
    window.setTimeout(done, 400);
  }
}
