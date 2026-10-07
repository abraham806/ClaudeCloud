// Motif géométrique tissé, inspiré des pagnes tissés (manjak) : losanges et
// bandes alternées, en noir et blanc pour rester dans la charte.
export function WovenPattern({ id = 'woven', color = 'currentColor', opacity = 1, height = '100%' }: {
  id?: string; color?: string; opacity?: number; height?: number | string;
}) {
  return (
    <svg width="100%" height={height} aria-hidden="true" style={{ display: 'block', opacity }}>
      <defs>
        <pattern id={id} width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M0 24 L12 12 L24 24 L12 36 Z M24 24 L36 12 L48 24 L36 36 Z" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M12 18 L18 24 L12 30 L6 24 Z M36 18 L42 24 L36 30 L30 24 Z" fill={color} />
          <path d="M0 2 H48 M0 6 H48 M0 42 H48 M0 46 H48" stroke={color} strokeWidth="1.5" />
          <path d="M22 8 h4 v4 h-4z M22 36 h4 v4 h-4z" fill={color} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
