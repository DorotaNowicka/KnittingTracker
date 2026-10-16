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
