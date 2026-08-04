import type { SettingsGroup } from './types';

export class SettingsCard {
  private current?: HTMLElement;

  close() {
    this.current?.remove();
    this.current = undefined;
  }

  installPressAndHold(el: HTMLElement, open: () => void) {
    let holdTimer: number | undefined;
    let blockClickUntil = 0;
    const cancel = () => {
      if (holdTimer !== undefined) window.clearTimeout(holdTimer);
      holdTimer = undefined;
    };
    el.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      cancel();
      holdTimer = window.setTimeout(() => {
        holdTimer = undefined;
        blockClickUntil = performance.now() + 1800;
        open();
      }, 550);
    });
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('contextmenu', (event) => event.preventDefault());
    return (event: MouseEvent) => {
      if (performance.now() >= blockClickUntil) return false;
      event.preventDefault();
      event.stopPropagation();
      return true;
    };
  }

  show(titleText: string, subtitleText: string, noteText: string, anchor: HTMLElement, groups: SettingsGroup[]) {
    this.close();
    const card = document.createElement('aside');
    card.className = 'medium-info panel';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-label', `${titleText} settings`);

    const head = document.createElement('div');
    head.className = 'medium-info-head';
    const title = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'hud-title';
    name.textContent = titleText;
    const subtitle = document.createElement('span');
    subtitle.className = 'medium-info-sub';
    subtitle.textContent = subtitleText;
    title.append(name, subtitle);
    const close = document.createElement('button');
    close.className = 'medium-info-close';
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close settings';
    close.setAttribute('aria-label', 'Close settings');
    close.addEventListener('click', () => this.close());
    head.append(title, close);
    card.appendChild(head);

    const note = document.createElement('p');
    note.className = 'medium-info-note';
    note.textContent = noteText;
    card.appendChild(note);
    for (const groupData of groups) {
      const group = document.createElement('section');
      group.className = 'medium-info-group';
      const heading = document.createElement('h3');
      heading.textContent = groupData.heading;
      group.appendChild(heading);
      for (const [labelText, valueText] of groupData.rows) {
        const row = document.createElement('div');
        row.className = 'medium-info-row';
        const label = document.createElement('span');
        label.textContent = labelText;
        const value = document.createElement('b');
        value.textContent = valueText;
        row.append(label, value);
        group.appendChild(row);
      }
      card.appendChild(group);
    }

    document.body.appendChild(card);
    const rect = anchor.getBoundingClientRect();
    const width = 286;
    card.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.left - width - 10))}px`;
    card.style.top = `${Math.max(12, Math.min(window.innerHeight - 120, rect.top))}px`;
    this.current = card;
  }
}
