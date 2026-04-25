import { motion } from 'framer-motion'
import { getOccupancyLevel, OCCUPANCY_COLORS } from '../../utils/occupancy'

const PERCENTAGE = 74
const COUNT = 48
const CAPACITY = 65

const BUS_W = 320
const BUS_H = 140
const BODY_X = 10
const BODY_Y = 10
const BODY_W = 300
const BODY_H = 100

const fillColor = OCCUPANCY_COLORS[getOccupancyLevel(PERCENTAGE)]
const maxFillW = BODY_W - 40

export default function BusHeroIllustration() {
  return (
    <motion.div
      className="flex items-center justify-center"
      animate={{ opacity: [0.85, 1, 0.85] }}
      transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
    >
      <svg
        width={BUS_W}
        height={BUS_H + 30}
        viewBox={`0 0 ${BUS_W} ${BUS_H + 30}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer body */}
        <rect
          x={BODY_X}
          y={BODY_Y}
          width={BODY_W}
          height={BODY_H}
          rx={18}
          stroke="#52525b"
          strokeWidth={2}
          fill="transparent"
        />

        {/* Driver cabin */}
        <rect x={14} y={14} width={42} height={BODY_H - 8} rx={14} fill="#27272a" />

        {/* Windows */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect
            key={i}
            x={70 + i * 38}
            y={18}
            width={28}
            height={30}
            rx={5}
            fill="#27272a"
          />
        ))}

        {/* Fill bar */}
        <motion.rect
          x={BODY_X + 20}
          y={BODY_Y + 52}
          height={36}
          rx={8}
          fill={fillColor}
          fillOpacity={0.4}
          initial={{ width: 0 }}
          animate={{ width: (PERCENTAGE / 100) * maxFillW }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />

        {/* Percentage text */}
        <text
          x={BUS_W / 2}
          y={BODY_Y + 56}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="'JetBrains Mono', monospace"
          fontSize={24}
          fontWeight={700}
          fill="white"
        >
          {PERCENTAGE}%
        </text>

        {/* Count text */}
        <text
          x={BUS_W / 2}
          y={BODY_Y + 78}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="'JetBrains Mono', monospace"
          fontSize={12}
          fill="#a1a1aa"
        >
          {COUNT} / {CAPACITY} чел
        </text>

        {/* Wheels */}
        <circle cx={60} cy={BUS_H + 8} r={8} fill="#3f3f46" />
        <circle cx={160} cy={BUS_H + 8} r={8} fill="#3f3f46" />
        <circle cx={260} cy={BUS_H + 8} r={8} fill="#3f3f46" />
      </svg>
    </motion.div>
  )
}
