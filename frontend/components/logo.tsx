// Cognix mark: three slanted bars that close into a triangle (an "A" / a pyramid of knowledge).
// Yellow + crimson + blue come straight from the brand image. Pure SVG, no dependencies.
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 48 38.4" role="img" aria-label="Cognix" className={className} fill="none">
      <polygon points="19.2,0 28.5,0 42.2,27.1 33.2,27.1" fill="#b03050" />
      <polygon points="17.5,3.6 22.1,12.3 9.1,38.4 0,38.4" fill="#e2b93b" />
      <polygon points="16.5,30.3 43.9,30.3 48,38.4 12.5,38.4" fill="#3d86b3" />
    </svg>
  );
}

// Mark + wordmark. `tagline` adds the small line under the name (used in the app sidebar).
export default function Logo({ size = 26, tagline, className = "" }: { size?: number; tagline?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="leading-none">
        <span className="block text-[19px] font-semibold tracking-tight text-[var(--ink)]">Cognix</span>
        {tagline && <span className="mt-1 block text-[11px] font-normal tracking-normal text-[var(--faint)]">{tagline}</span>}
      </span>
    </span>
  );
}