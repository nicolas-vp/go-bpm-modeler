// Изменение ширины боковой панели перетаскиванием разделителя. Ширина запоминается в localStorage

const STORAGE_KEY = 'sidebarWidth';
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 160;
// Редактору остаётся не меньше этой ширины
const MIN_MAIN_WIDTH = 400;

function clamp(width: number): number {
  return Math.round(Math.max(MIN_WIDTH, Math.min(width, window.innerWidth - MIN_MAIN_WIDTH)));
}

function load(): number {
  try {
    const width = Number(localStorage.getItem(STORAGE_KEY));
    return width > 0 ? width : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function store(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // Ширина просто не запомнится
  }
}

/**
 * Подключает разделитель к панели. onResized вызывается после изменения ширины: холсту bpmn-js нужно
 * пересчитать размеры
 */
export function initSidebarResizer(sidebar: HTMLElement, resizer: HTMLElement, onResized: () => void): void {
  const apply = (width: number) => {
    sidebar.style.width = `${clamp(width)}px`;
  };
  apply(load());

  resizer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = sidebar.getBoundingClientRect().width;
    document.body.classList.add('resizing');

    const move = (e: PointerEvent) => apply(startWidth + e.clientX - startX);
    const up = () => {
      resizer.removeEventListener('pointermove', move);
      resizer.removeEventListener('pointerup', up);
      resizer.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing');
      store(sidebar.getBoundingClientRect().width);
      onResized();
    };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', up);
    resizer.addEventListener('pointercancel', up);
  });

  resizer.addEventListener('dblclick', () => {
    apply(DEFAULT_WIDTH);
    store(DEFAULT_WIDTH);
    onResized();
  });

  // Окно сузили - панель не должна вытеснить редактор
  window.addEventListener('resize', () => apply(sidebar.getBoundingClientRect().width));
}
