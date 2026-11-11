import React from 'react'

/**
 * Vectorized "PILATES by RIVEN" logo component
 * Matches the brand JPEG exactly: PILATES large serif, by RIVEN smaller below
 * Color: #C19C80 (brand gold)
 * Uses inline SVG text so it renders with the loaded Playfair Display font
 */
export default function Logo({ size = 'lg', color = '#C19C80', className = '' }) {
  // Size presets
  const sizes = {
    sm: { width: 140, pilates: 28, by: 11, riven: 16, gap1: 30, gap2: 43 },
    md: { width: 200, pilates: 40, by: 15, riven: 22, gap1: 43, gap2: 61 },
    lg: { width: 260, pilates: 52, by: 18, riven: 28, gap1: 56, gap2: 78 },
    xl: { width: 320, pilates: 64, by: 22, riven: 34, gap1: 68, gap2: 96 },
  }

  const s = sizes[size] || sizes.lg
  const height = s.gap2 + s.riven * 0.3

  return (
    <svg
      viewBox={`0 0 ${s.width} ${height}`}
      width={s.width}
      height={height}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Pilates by Riven"
    >
      {/* PILATES - large serif */}
      <text
        x={s.width / 2}
        y={s.pilates * 0.85}
        textAnchor="middle"
        fill={color}
        fontFamily="'Playfair Display', 'Georgia', 'Times New Roman', serif"
        fontSize={s.pilates}
        fontWeight="500"
        letterSpacing={s.pilates * 0.12}
      >
        PILATES
      </text>

      {/* by RIVEN - smaller */}
      <text
        x={s.width / 2}
        y={s.gap2}
        textAnchor="middle"
        fill={color}
        fontFamily="'Playfair Display', 'Georgia', 'Times New Roman', serif"
        fontSize={s.riven}
        fontWeight="400"
        letterSpacing={s.riven * 0.08}
      >
        <tspan fontStyle="normal" fontSize={s.by}>by </tspan>
        <tspan letterSpacing={s.riven * 0.12}>RIVEN</tspan>
      </text>
    </svg>
  )
}
