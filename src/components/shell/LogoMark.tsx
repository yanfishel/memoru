interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * The mark: a memorial lamp, a shallow dish holding a flame. Drawn once here so the header and
 * anything later can reuse it. The flame is always the accent colour; the dish uses `currentColor`
 * at half strength, so it tracks whatever text colour the caller sets — light or dark scheme, and
 * the header's hover tint — with no extra code. Purely decorative: the caller supplies the
 * accessible name (see SiteHeader's `aria-label`).
 */
export function LogoMark({ size = 24, className }: LogoMarkProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <path
        d="M16.6 2.8c.2 2.6-1.1 4-2.5 5.4-1.7 1.7-3.1 3.2-3.1 5.8a5 5 0 0 0 10 0c0-2.3-1-3.7-2-5.1-.6.9-1 1.7-1.1 2.7-1.4-2.6-1.6-5.5-1.3-8.8z"
        fill="var(--accent)"
      />
      <path d="M5 20.5c1.9 4.4 6.2 7 11 7s9.1-2.6 11-7z" fill="currentColor" opacity=".5" />
    </svg>
  );
}
