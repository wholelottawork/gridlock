export function GridlockLogo({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.86)}
      viewBox="0 0 100 86"
      fill="none"
      overflow="hidden"
    >
      <polyline points="14,4 50,40 86,4"     stroke={color} strokeWidth="10" strokeLinecap="butt" strokeLinejoin="miter" />
      <polyline points="-6,4 50,60 106,4"    stroke={color} strokeWidth="10" strokeLinecap="butt" strokeLinejoin="miter" />
      <polyline points="-26,4 50,80 126,4"   stroke={color} strokeWidth="10" strokeLinecap="butt" strokeLinejoin="miter" />
    </svg>
  );
}
