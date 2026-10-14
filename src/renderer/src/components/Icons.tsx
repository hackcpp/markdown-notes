import type { SVGProps } from 'react'

/**
 * 内联图标。
 * 不引入图标库：整个应用只有二十来个图标，手写 path 比多一个依赖更划算，
 * 也避免图标库打包体积与 tree-shaking 的不确定性。
 */
const PATHS: Record<string, string> = {
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  folder: 'M3 7a2 2 0 0 1 2-2h3.6l1.7 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  folderOpen: 'M3 7a2 2 0 0 1 2-2h3.6l1.7 2H19a2 2 0 0 1 2 2v1H6.5a2 2 0 0 0-1.9 1.4L3 17z M3 17l2.1-5.6A2 2 0 0 1 7 10h14l-2.1 5.6A2 2 0 0 1 17 17z',
  file: 'M7 3h7l5 5v13H7z M14 3v5h5',
  fileCode: 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13l-2 2 2 2 M14 13l2 2-2 2',
  plus: 'M12 5v14 M5 12h14',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6 M20 4v5h-5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  tag: 'M3 12l9-9h6a3 3 0 0 1 3 3v6l-9 9z M16.5 7.5h.01',
  listTree: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  close: 'M6 6l12 12 M18 6L6 18',
  check: 'M4 12.5l5 5L20 6.5',
  alert: 'M12 4l9 16H3z M12 10v4 M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01',
  save: 'M5 3h11l3 3v15H5z M8 3v6h7V3 M8 21v-6h8v6',
  external: 'M14 4h6v6 M20 4l-8 8 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
  monitor: 'M4 4h16v12H4z M9 20h6 M12 16v4',
  columns: 'M4 4h16v16H4z M12 4v16',
  code: 'M9 8l-4 4 4 4 M15 8l4 4-4 4',
  eye: 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  focus: 'M4 8V5a1 1 0 0 1 1-1h3 M20 8V5a1 1 0 0 0-1-1h-3 M4 16v3a1 1 0 0 0 1 1h3 M20 16v3a1 1 0 0 1-1 1h-3',
  trash: 'M4 7h16 M9 7V5h6v2 M6 7l1 14h10l1-14',
  edit: 'M4 20h4L20 8l-4-4L4 16z M14 6l4 4',
  dots: 'M12 6h.01 M12 12h.01 M12 18h.01',
  image: 'M4 5h16v14H4z M4 15l4-4 4 4 3-3 5 5 M9 10h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  keyboard: 'M4 6h16v12H4z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10',
  filePlus: 'M7 3h7l5 5v13H7z M14 3v5h5 M12 12v6 M9 15h6',
  folderPlus: 'M3 7a2 2 0 0 1 2-2h3.6l1.7 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M12 12v4 M10 14h4',
  restore: 'M4 4v6h6 M4.5 10a8 8 0 1 1 1.5 6'
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: keyof typeof PATHS | string
  size?: number
}

export function Icon({ name, size = 16, ...rest }: IconProps): React.JSX.Element {
  const path = PATHS[name] ?? PATHS.file
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {path.split(' M').map((segment, index) => (
        <path key={index} d={index === 0 ? segment : `M${segment}`} />
      ))}
    </svg>
  )
}
