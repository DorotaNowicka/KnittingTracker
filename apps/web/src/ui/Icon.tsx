/**
 * Small stroke icon set (24×24, 1.75 px stroke). Icons are decorative: every control that uses one
 * also has a text label or an aria-label.
 */
const PATHS = {
  back: 'M15 5l-7 7 7 7',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  eraser:
    'M8 20h12M5.5 14.5l8-8a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L12 18H8.5L5.5 15a.4.4 0 010-.5zM9.5 10.5l5 5',
  rowDone: 'M3 12h18M7 7l-4 5 4 5M14 16l2 2 5-6',
  target: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 110 8 4 4 0 010-8z',
  panel: 'M4 5h16v14H4zM14 5v14',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 13l5-5 5 5M5 4h14',
  close: 'M6 6l12 12M18 6L6 18',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  paste: 'M9 4h6v3H9zM7 5H5v15h14V5h-2M9 12h6M9 16h4',
  cut: 'M6 6l12 12M18 6L6 18M4 4l2 2M20 4l-2 2',
  mirrorH: 'M12 3v18M9 7L4 12l5 5zM15 7l5 5-5 5z',
  mirrorV: 'M3 12h18M7 9l5-5 5 5zM7 15l5 5 5-5z',
  brush: 'M4 20c3 0 5-1.5 5-4a3 3 0 00-3-3c-2 0-2 3-2 7zM9 13l9-9 2 2-9 9',
  select: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M10 4h4M10 20h4M4 10v4M20 10v4',
  hand: 'M8 13V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-3 7-6.5 7S5 17.5 4 15l-1-2.5a1.5 1.5 0 012.6-1.4L8 14',
  resize: 'M4 4h7v7H4zM15 4h5v5M20 4l-6 6M4 15v5h5M4 20l6-6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  fill: 'M5 11l7-7 7 7-7 7zM19 15c0 1.5 1 2.5 1 3.5a1.5 1.5 0 01-3 0c0-1 1-2 2-3.5zM5 11h14',
  rowAdd: 'M4 8h16v4H4zM12 15v6M9 18h6',
  rowRemove: 'M4 8h16v4H4zM9 18h6',
  colAdd: 'M8 4h4v16H8zM15 12h6M18 9v6',
  colRemove: 'M8 4h4v16H8zM15 12h6',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  marker: 'M12 3l7 7-7 11-7-11z',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-.8 3 15.6-3.5.8z',
  // Project kinds (drawn larger, on the "what are you knitting" tiles).
  sweater:
    'M8 4L4 6.5 2.5 13.5l2.5.8L6.5 10V20h11V10l1.5 4.3 2.5-.8L21 6.5 16 4M8 4c1 1.6 2.4 2.2 4 2.2S15 5.6 16 4M6.5 18h11',
  cardigan:
    'M8 4L4 6.5 2.5 13.5l2.5.8L6.5 10V20h11V10l1.5 4.3 2.5-.8L21 6.5 16 4M8 4l4 6 4-6M12 10v10M13.8 12.5h.01M13.8 16h.01',
  vest: 'M8 4H6c0 3-.5 5.5-1.5 7V20h15v-9c-1-1.5-1.5-4-1.5-7h-2l-4 6.5zM4.5 18h15',
  hat: 'M5 17a7 7 0 0114 0M4 17h16v3.5H4zM8 17v3.5M12 17v3.5M16 17v3.5M13.5 8.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0',
  scarf:
    'M6 5c0-1 2.7-2 6-2s6 1 6 2-2.7 2.5-6 2.5S6 6 6 5zM8.5 7.3L7 19h3.5l1.5-11.5M13.5 7.5L15 18h3.5L16 7M7.5 19v2M9.5 19v2M15.5 18v2M17.5 18v2',
  cowl: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M8.5 8.6v11.8M15.5 8.6v11.8',
  mittens: 'M8 21h8v-4H8zM8 17c-2-1-4-3-4-5.5a1.8 1.8 0 013.4-.8L9 13V7a3.5 3.5 0 017 0v10',
  socks: 'M9 3h6v10l4 2.5a2.5 2.5 0 01-1.3 4.6H12a3 3 0 01-3-3V3zM9 6h6',
  yarn: 'M19 11a7 7 0 11-14 0 7 7 0 0114 0zM6.5 7.5c3 0 7.5 2 10 6.5M5.2 11.5c3 .2 6.5 2.3 8 6M9 4.5c2.5 1.5 5 4.5 6 8M12 18c-1.5 2-4 3-8 2.5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
