// Окно «AI-агент»: включение встроенного MCP-сервера, адрес, токен и команда подключения агента

import { backend, copyText, type McpStatus } from './backend';

export class McpPanel {
  private readonly panel: HTMLElement;
  private anchor?: HTMLElement;

  constructor(private readonly onError: (err: unknown) => void) {
    this.panel = document.createElement('div');
    this.panel.className = 'mcp-panel';
    this.panel.hidden = true;
    document.body.append(this.panel);
    document.addEventListener('mousedown', (event) => {
      const target = event.target as Node;
      if (!this.panel.contains(target) && !this.anchor?.contains(target)) {
        this.panel.hidden = true;
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.panel.hidden = true;
      }
    });
  }

  /** Состояние сервера на кнопке: точка - сервер работает */
  async attach(anchor: HTMLElement): Promise<void> {
    this.anchor = anchor;
    this.mark(await backend.mcpStatus());
  }

  async toggle(): Promise<void> {
    if (!this.panel.hidden) {
      this.panel.hidden = true;
      return;
    }
    this.render(await backend.mcpStatus());
    const rect = this.anchor!.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 6}px`;
    this.panel.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    this.panel.hidden = false;
  }

  private mark(status: McpStatus): void {
    this.anchor?.classList.toggle('mcp-on', status.running);
  }

  private run(action: () => Promise<McpStatus>): void {
    action()
      .then((status) => this.render(status))
      .catch(this.onError);
  }

  private render(status: McpStatus): void {
    this.mark(status);
    const command = `claude mcp add --transport http go-bpm-modeler ${status.url} --header "Authorization: Bearer ${status.token}"`;
    this.panel.replaceChildren();
    const h = (tag: string, cls: string | null, text?: string) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const copyRow = (label: string, value: string, id: string) => {
      const row = h('div', 'mcp-row');
      row.append(h('div', 'mcp-label', label));
      const line = h('div', 'mcp-copy');
      line.append(h('code', null, value));
      const button = h('button', 'mcp-copy-button', 'Копировать') as HTMLButtonElement;
      button.dataset.copy = id;
      button.addEventListener('click', () =>
        copyText(value)
          .then(() => {
            button.textContent = 'Скопировано';
            setTimeout(() => (button.textContent = 'Копировать'), 1500);
          })
          .catch(this.onError),
      );
      line.append(button);
      row.append(line);
      return row;
    };

    this.panel.append(h('h3', null, 'AI-агент'));
    this.panel.append(
      h(
        'p',
        'mcp-note',
        'Агент с поддержкой MCP — Claude Code, Cursor и другие — читает схемы рабочей папки и то, что открыто в редакторе, консультирует и предлагает правки. Правка применяется, только если вы её подтвердите.',
      ),
    );

    const toggle = h('label', 'mcp-toggle');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = status.enabled;
    checkbox.dataset.mcp = 'enabled';
    checkbox.addEventListener('change', () => this.run(() => backend.setMcpEnabled(checkbox.checked)));
    toggle.append(checkbox, h('span', null, 'MCP-сервер включён'));
    this.panel.append(toggle);

    if (!status.enabled) {
      return;
    }
    if (status.error) {
      this.panel.append(h('p', 'mcp-error', status.error));
      return;
    }
    this.panel.append(h('p', 'mcp-state', `Работает: ${status.url} — только с этого компьютера`));
    this.panel.append(copyRow('Подключить Claude Code — выполните в терминале:', command, 'command'));
    this.panel.append(copyRow('Другие агенты: адрес выше и заголовок', `Authorization: Bearer ${status.token}`, 'header'));
    const regenerate = h('button', 'mcp-regenerate', 'Новый токен') as HTMLButtonElement;
    regenerate.title = 'Старый токен перестанет работать: агента нужно подключить заново';
    regenerate.addEventListener('click', () => this.run(() => backend.regenerateMcpToken()));
    this.panel.append(regenerate);
  }
}
