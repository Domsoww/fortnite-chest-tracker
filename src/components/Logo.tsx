/** Original chest mark drawn in SVG. No game assets are used anywhere. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="shrink-0 drop-shadow-[0_6px_18px_rgba(139,92,246,0.35)]"
    >
      <defs>
        <linearGradient id="logo-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--accent) 45%, #000)" />
        </linearGradient>
        <linearGradient id="logo-lid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="color-mix(in srgb, var(--accent) 70%, #fff)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect x="8" y="28" width="48" height="26" rx="5" fill="url(#logo-body)" />
      <path d="M8 30a24 14 0 0 1 48 0z" fill="url(#logo-lid)" />
      <rect x="6" y="27" width="52" height="7" rx="3.5" fill="var(--gold)" />
      <rect x="27" y="22" width="10" height="20" rx="3" fill="var(--gold)" />
      <circle cx="32" cy="33" r="3.4" fill="#3b2406" />
    </svg>
  )
}
