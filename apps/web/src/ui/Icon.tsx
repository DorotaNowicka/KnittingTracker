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
