// Lucide icon paths (ISC license), inlined so the app needs no icon package.

/** The "expand" icon's path, also drawn by the buttons added to tables in the reading view. */
export const EXPAND_PATH = "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7";

const paths = {
  sidebar: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </>
  ),
  home: (
    <>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />
    </>
  ),
  h1: (
    <>
      <path d="M4 12h8M4 18V6M12 18V6" />
      <path d="m17 12 3-2v8" />
    </>
  ),
  h2: (
    <>
      <path d="M4 12h8M4 18V6M12 18V6" />
      <path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
    </>
  ),
  h3: (
    <>
      <path d="M4 12h8M4 18V6M12 18V6" />
      <path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2" />
      <path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2" />
    </>
  ),
  bold: <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />,
  italic: <path d="M19 4h-9M14 20H5M15 4 9 20" />,
  strike: (
    <>
      <path d="M16 4H9a3 3 0 0 0-2.83 4" />
      <path d="M14 12a4 4 0 0 1 0 8H6" />
      <path d="M4 12h16" />
    </>
  ),
  code: <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  bulletList: <path d="M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13" />,
  orderedList: (
    <>
      <path d="M10 6h11M10 12h11M10 18h11" />
      <path d="M4 6h1v4M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </>
  ),
  taskList: (
    <>
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="m3 17 2 2 4-4M13 6h8M13 12h8M13 18h8" />
    </>
  ),
  quote: <path d="M17 6H3M21 12H8M21 18H8M3 12v6" />,
  codeBlock: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="m10 9-3 3 3 3M14 15l3-3-3-3" />
    </>
  ),
  rule: <path d="M3 12h18M8 7l4-4 4 4M16 17l-4 4-4-4" />,
  lineBreak: <path d="M20 4v7a4 4 0 0 1-4 4H4M9 10l-5 5 5 5" />,
  properties: <path d="M4 6h3M4 12h3M4 18h3M11 6h9M11 12h9M11 18h9" />,
  image: <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />,
  footnote: <path d="M3 8h11M3 13h11M3 18h7M17.5 5.5 20 4v6M17.5 10h5" />,
  mathInline: <path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2" />,
  mathBlock: <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM16 8.9V7H8l4 5-4 5h8v-1.9" />,
  save: <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7" />,
  saveAs: <path d="M10 2v3a1 1 0 0 0 1 1h5M18 18v-6a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6M18 22H4a2 2 0 0 1-2-2V6M8 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9.172a2 2 0 0 1 1.414.586l2.828 2.828A2 2 0 0 1 22 6.828V16a2 2 0 0 1-2 2z" />,
  revert: <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />,
  preview: <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />,
  table: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 3v18M3 9h18M3 15h18" />
    </>
  ),
  openLink: (
    <>
      <path d="M15 3h6v6M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  rowAbove: (
    <>
      <rect x="3" y="12" width="18" height="9" rx="1.5" />
      <path d="M12 3v6M9 6h6" />
    </>
  ),
  rowBelow: (
    <>
      <rect x="3" y="3" width="18" height="9" rx="1.5" />
      <path d="M12 15v6M9 18h6" />
    </>
  ),
  columnLeft: (
    <>
      <rect x="12" y="3" width="9" height="18" rx="1.5" />
      <path d="M3 12h6M6 9v6" />
    </>
  ),
  columnRight: (
    <>
      <rect x="3" y="3" width="9" height="18" rx="1.5" />
      <path d="M15 12h6M18 9v6" />
    </>
  ),
  deleteRow: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="1.5" />
      <path d="m9.5 9.5 5 5M14.5 9.5l-5 5" />
    </>
  ),
  deleteColumn: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="1.5" />
      <path d="m9.5 9.5 5 5M14.5 9.5l-5 5" />
    </>
  ),
  alignLeft: <path d="M21 6H3M15 12H3M17 18H3" />,
  alignCenter: <path d="M21 6H3M17 12H7M19 18H5" />,
  alignRight: <path d="M21 6H3M21 12H9M21 18H7" />,
  deleteTable: <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />,
  back: <path d="m15 18-6-6 6-6" />,
  forward: <path d="m9 18 6-6-6-6" />,
  open: (
    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
  ),
  type: (
    <>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" x2="15" y1="20" y2="20" />
      <line x1="12" x2="12" y1="4" y2="20" />
    </>
  ),
  file: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  monitor: (
    <>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  drop: <path d="M12 3v12m-5-5 5 5 5-5M5 21h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  up: <path d="m18 15-6-6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M5 12h14M12 5v14" />,
  pencil: (
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  settings: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  warning: <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />,
  external: <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
  expand: <path d={EXPAND_PATH} />,
  folder: <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/** The Octavo mark, as in the app icon (media/icon.svg): an open book with an accent bookmark on a primary tile. */
export function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg className="logo" viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="Octavo">
      <rect width="48" height="48" rx="11" fill="#5A0E27" />
      <path d="M7 13c5.5-2.2 11.5-2 16 1.2V38c-4.5-3-10.5-3.3-16-1.2z" fill="#FFFFFF" />
      <path d="M41 13c-5.5-2.2-11.5-2-16 1.2V38c4.5-3 10.5-3.3 16-1.2z" fill="#DCEEFA" />
      <path d="M30 11.6h5.5V26l-2.75-2.3L30 26z" fill="#D39D3F" />
    </svg>
  );
}
