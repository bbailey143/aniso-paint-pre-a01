// Command palette — Tailwind-style quick-access overlay.
// Opens with Cmd/Ctrl+K or the floating trigger button. Fuzzy-filtered,
// keyboard-navigable, grouped by category. Commands are registered by the app.

export interface Command {
  id: string;
  name: string;
  group: string;
  hint?: string;
  keywords?: string;
  shortcut?: string;
  action: () => void;
}

export class CommandPalette {
  private commands: Command[] = [];
  private filtered: Command[] = [];
  private selected = 0;
  private open = false;

  private backdrop: HTMLElement;
  private input: HTMLInputElement;
  private resultsEl: HTMLElement;
  private trigger: HTMLElement;

  constructor() {
    this.backdrop = document.createElement('div');
    this.backdrop.id = 'cmd-backdrop';
    this.backdrop.setAttribute('role', 'dialog');
    this.backdrop.setAttribute('aria-modal', 'true');
    this.backdrop.setAttribute('aria-label', 'Command palette');

    this.backdrop.innerHTML = `
      <div id="cmd-palette">
        <div id="cmd-search">
          <svg id="cmd-search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input id="cmd-input" type="text" placeholder="Search commands…" autocomplete="off" spellcheck="false" />
          <span id="cmd-kbd">esc</span>
        </div>
        <div id="cmd-results"></div>
        <div id="cmd-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>`;

    this.input = this.backdrop.querySelector('#cmd-input')!;
    this.resultsEl = this.backdrop.querySelector('#cmd-results')!;
    document.body.appendChild(this.backdrop);

    this.trigger = document.createElement('div');
    this.trigger.id = 'cmd-trigger';
    this.trigger.setAttribute('role', 'button');
    this.trigger.setAttribute('aria-label', 'Open command palette (Alt+K)');
    this.trigger.tabIndex = 0;
    this.trigger.innerHTML = `
      <span class="cmd-hint">Alt+K · commands</span>
      <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg>`;
    document.body.appendChild(this.trigger);

    this.bindEvents();
  }

  register(cmd: Command) { this.commands.push(cmd); }

  private bindEvents() {
    this.trigger.addEventListener('click', () => this.show());
    this.trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.show(); }
    });

    this.input.addEventListener('input', () => { this.filter(this.input.value); });
    this.input.addEventListener('keydown', (e) => this.onKey(e));

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.hide();
    });

    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.open ? this.hide() : this.show();
      }
    });
  }

  private show() {
    this.open = true;
    this.backdrop.classList.add('open');
    this.input.value = '';
    this.filter('');
    requestAnimationFrame(() => this.input.focus());
  }

  private hide() {
    this.open = false;
    this.backdrop.classList.remove('open');
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); this.runSelected(); }
  }

  private move(dir: number) {
    if (this.filtered.length === 0) return;
    this.selected = (this.selected + dir + this.filtered.length) % this.filtered.length;
    this.render();
  }

  private runSelected() {
    const cmd = this.filtered[this.selected];
    if (!cmd) return;
    this.hide();
    cmd.action();
  }

  private filter(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) {
      this.filtered = [...this.commands];
    } else {
      this.filtered = this.commands
        .map((cmd) => {
          const haystack = (cmd.name + ' ' + (cmd.hint ?? '') + ' ' + (cmd.keywords ?? '') + ' ' + cmd.group).toLowerCase();
          let score = 0;
          if (haystack.includes(q)) score = 100 - haystack.indexOf(q);
          else {
            // Simple subsequence fuzzy match.
            let qi = 0;
            for (let i = 0; i < haystack.length && qi < q.length; i++) {
              if (haystack[i] === q[qi]) qi++;
            }
            if (qi === q.length) score = 10;
          }
          return { cmd, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.cmd);
    }
    this.selected = 0;
    this.render();
  }

  private render() {
    if (this.filtered.length === 0) {
      this.resultsEl.innerHTML = '<div class="cmd-empty">No matching commands</div>';
      return;
    }

    const groups = new Map<string, Command[]>();
    for (const cmd of this.filtered) {
      const arr = groups.get(cmd.group) ?? [];
      arr.push(cmd);
      groups.set(cmd.group, arr);
    }

    let html = '';
    let idx = 0;
    for (const [group, cmds] of groups) {
      html += `<div class="cmd-group">${group}</div>`;
      for (const cmd of cmds) {
        const sel = idx === this.selected ? ' selected' : '';
        const icon = this.iconFor(cmd);
        const hint = cmd.hint ? `<div class="cmd-item-hint">${cmd.hint}</div>` : '';
        const kbd = cmd.shortcut ? `<span class="cmd-item-kbd">${cmd.shortcut}</span>` : '';
        html += `<div class="cmd-item${sel}" data-idx="${idx}">${icon}<div class="cmd-item-body"><div class="cmd-item-name">${cmd.name}</div>${hint}</div>${kbd}</div>`;
        idx++;
      }
    }
    this.resultsEl.innerHTML = html;

    this.resultsEl.querySelectorAll<HTMLElement>('.cmd-item').forEach((el) => {
      const i = parseInt(el.dataset.idx!, 10);
      el.addEventListener('click', () => {
        this.selected = i;
        this.runSelected();
      });
      el.addEventListener('pointermove', () => {
        if (this.selected !== i) { this.selected = i; this.render(); }
      });
    });

    const sel = this.resultsEl.querySelector('.cmd-item.selected');
    sel?.scrollIntoView({ block: 'nearest' });
  }

  private iconFor(_cmd: Command): string {
    return '<svg class="cmd-item-icon" viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg>';
  }
}
