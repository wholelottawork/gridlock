"use client";

export function NetworkGraph({
  activeWorkers,
  totalWorkers,
  isYouActive,
}: {
  activeWorkers: number;
  totalWorkers: number;
  isYouActive: boolean;
}) {
  const count = Math.min(Math.max(activeWorkers, isYouActive ? 1 : 0), 8);
  const positions = Array.from({ length: count }, (_, i) => {
    const angle = (i / Math.max(count, 1)) * 2 * Math.PI - Math.PI / 2;
    return { x: 100 + 70 * Math.cos(angle), y: 80 + 70 * Math.sin(angle) };
  });

  return (
    <svg viewBox="0 0 200 160" style={{ width: "100%", height: "100%" }}>
      {positions.map((pos, i) => (
        <line
          key={`line-${i}`}
          x1={100}
          y1={80}
          x2={pos.x}
          y2={pos.y}
          stroke={i === 0 && isYouActive ? "var(--orange)" : "rgba(255,255,255,0.12)"}
          strokeWidth={1}
          strokeDasharray="2,2"
        />
      ))}

      <circle cx={100} cy={80} r={16} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      <circle cx={100} cy={80} r={6} fill="rgba(255,255,255,0.15)" />
      <text x={100} y={108} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={8} fontFamily="monospace">
        ROUTER
      </text>

      {positions.map((pos, i) => (
        <g key={`node-${i}`}>
          <rect
            x={pos.x - 6}
            y={pos.y - 6}
            width={12}
            height={12}
            rx={3}
            fill={i === 0 && isYouActive ? "var(--orange)" : "transparent"}
            fillOpacity={i === 0 && isYouActive ? 0.85 : 0}
            stroke={i === 0 && isYouActive ? "var(--orange)" : "rgba(255,255,255,0.25)"}
            strokeWidth={1}
          />
          {i === 0 && isYouActive && (
            <text x={pos.x} y={pos.y - 10} textAnchor="middle" fill="var(--orange)" fontSize={7} fontFamily="monospace">
              YOU
            </text>
          )}
        </g>
      ))}

      {activeWorkers > 8 && (
        <text x={100} y={125} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={7} fontFamily="monospace">
          +{activeWorkers - 8} more
        </text>
      )}

      <text x={100} y={148} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={8} fontFamily="monospace">
        {activeWorkers} active · {totalWorkers} registered
      </text>
    </svg>
  );
}
