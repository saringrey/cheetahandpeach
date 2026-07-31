/**
 * The cheetah-and-peach emblem: a running cheetah curled inside the silhouette
 * of a peach. Drawn as inline SVG so it needs no asset and scales cleanly.
 */
export function Emblem({ className, stroke = '#f0a084' }: { className?: string; stroke?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      {/* peach body */}
      <path
        d="M50 20c-13 0-24 10.5-24 25 0 16 11 30 24 30s24-14 24-30c0-14.5-11-25-24-25z"
        stroke={stroke}
        strokeWidth="1.6"
        opacity="0.85"
      />
      {/* cleft */}
      <path d="M50 22c-3 8-3 20 0 30" stroke={stroke} strokeWidth="1" opacity="0.35" />
      {/* leaf */}
      <path
        d="M52 20c4-6 11-8 15-7-1 5-5 10-11 11"
        stroke={stroke}
        strokeWidth="1.4"
        opacity="0.75"
      />
      {/* cheetah, mid-stride, inside the peach */}
      <path
        d="M34 55c3-2 6-1 8 1s5 3 8 2 5-4 8-4 5 2 6 4"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M64 58c3-1 5-4 6-7" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M42 57l-3 6M50 58l2 6M58 57l3 6" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
      <circle cx="35" cy="53" r="1.3" fill={stroke} />
      {/* spots */}
      <circle cx="46" cy="40" r="1" fill={stroke} opacity="0.4" />
      <circle cx="55" cy="45" r="1" fill={stroke} opacity="0.4" />
      <circle cx="42" cy="48" r="1" fill={stroke} opacity="0.4" />
      <circle cx="59" cy="36" r="1" fill={stroke} opacity="0.4" />
    </svg>
  )
}
