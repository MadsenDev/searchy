import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BsDistributeHorizontal, BsStars } from 'react-icons/bs'
import { HiMiniSparkles } from 'react-icons/hi2'
import { RiTerminalBoxLine } from 'react-icons/ri'
import type { JokeTheme } from '../lib/searchSyntax'

const themeMeta: Record<JokeTheme, { label: string; icon: ReactNode }> = {
  confetti: { label: 'Confetti mode', icon: <HiMiniSparkles /> },
  disco: { label: 'Disco mode', icon: <BsDistributeHorizontal /> },
  matrix: { label: 'Matrix mode', icon: <RiTerminalBoxLine /> },
  synthwave: { label: 'Synthwave mode', icon: <BsStars /> },
}

export function JokeOverlay({ theme }: { theme: JokeTheme | null }) {
  return (
    <AnimatePresence mode="wait">
      {theme ? (
        <motion.div
          key={theme}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.01 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2.4rem]"
        >
          <div className="absolute inset-0 bg-black/10" />
          {theme === 'confetti' ? <ConfettiOverlay /> : null}
          {theme === 'disco' ? <DiscoOverlay /> : null}
          {theme === 'matrix' ? <MatrixOverlay /> : null}
          {theme === 'synthwave' ? <SynthwaveOverlay /> : null}

          <motion.div
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/14 bg-slate-950/55 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-white/80 backdrop-blur"
          >
            <span className="text-sm">{themeMeta[theme].icon}</span>
            <span>{themeMeta[theme].label}</span>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function ConfettiOverlay() {
  const particles = Array.from({ length: 42 }, (_, index) => index)
  const ribbons = Array.from({ length: 8 }, (_, index) => index)
  const colors = ['#ff8552', '#ffd166', '#5cd6a4', '#7dd3fc', '#f472b6', '#fde68a']

  return (
    <>
      <motion.div
        animate={{ rotate: [0, 8, -6, 0], scale: [1, 1.03, 0.98, 1] }}
        transition={{ duration: 9, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        className="absolute inset-[-10%] bg-[conic-gradient(from_180deg_at_50%_50%,rgba(255,209,102,0.14),rgba(244,114,182,0.12),rgba(125,211,252,0.12),rgba(92,214,164,0.12),rgba(255,209,102,0.14))] blur-3xl"
      />
      <motion.div
        animate={{ opacity: [0.08, 0.2, 0.08], scale: [1, 1.04, 1] }}
        transition={{ duration: 3.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_40%)]"
      />
      {ribbons.map((ribbon) => (
        <motion.div
          key={`ribbon-${ribbon}`}
          animate={{
            y: ['-18%', '8%', '42%', '108%'],
            x: [0, ribbon % 2 === 0 ? 22 : -18, ribbon % 3 === 0 ? -28 : 20, 0],
            rotate: [ribbon * 12, ribbon * 12 + 90, ribbon * 12 + 220, ribbon * 12 + 320],
            opacity: [0, 0.4, 0.3, 0],
          }}
          transition={{
            duration: 6.2 + ribbon * 0.45,
            delay: ribbon * 0.28,
            repeat: Number.POSITIVE_INFINITY,
            ease: 'linear',
          }}
          className="absolute top-0 h-20 w-3 rounded-full blur-[1px]"
          style={{
            left: `${10 + ribbon * 11}%`,
            background: `linear-gradient(180deg, ${colors[ribbon % colors.length]}, rgba(255,255,255,0.12))`,
          }}
        />
      ))}
      {particles.map((particle) => {
        const left = (particle * 9.5) % 100
        const size = 5 + (particle % 5) * 3
        const delay = particle * 0.08
        const duration = 4 + (particle % 6) * 0.32
        return (
          <motion.span
            key={particle}
            initial={{ y: -80, x: 0, rotate: 0, opacity: 0 }}
            animate={{
              y: ['-8%', '18%', '52%', '112%'],
              x: [0, particle % 2 === 0 ? 26 : -22, particle % 3 === 0 ? -14 : 18, 0],
              rotate: [0, 160 + particle * 9, 260 + particle * 15, 420 + particle * 9],
              opacity: [0, 0.95, 0.8, 0],
              scale: [0.8, 1.12, 0.94, 0.86],
            }}
            transition={{
              duration,
              delay,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'linear',
            }}
            className="absolute top-0 rounded-sm shadow-[0_0_12px_rgba(255,255,255,0.18)]"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${Math.max(4, size * 0.72)}px`,
              backgroundColor: colors[particle % colors.length],
            }}
          />
        )
      })}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,0.08))]" />
    </>
  )
}

function DiscoOverlay() {
  const beams = Array.from({ length: 11 }, (_, index) => index)
  const orbs = Array.from({ length: 9 }, (_, index) => index)
  const sparkles = Array.from({ length: 20 }, (_, index) => index)

  return (
    <>
      <motion.div
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 22, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_45deg,rgba(255,0,110,0.12),rgba(251,191,36,0.08),rgba(125,211,252,0.12),rgba(34,197,94,0.08),rgba(255,0,110,0.12))] blur-3xl"
      />
      <motion.div
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 16, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        className="absolute left-1/2 top-[48%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(255,255,255,0.16),rgba(255,255,255,0.02)_38%,transparent_70%)]"
      />
      {beams.map((beam) => (
        <motion.div
          key={beam}
          animate={{
            opacity: [0.05, 0.22, 0.09],
            rotate: [beam * 26, beam * 26 + 18, beam * 26 + 38],
            scaleY: [0.92, 1.08, 0.96],
          }}
          transition={{ duration: 3 + beam * 0.18, repeat: Number.POSITIVE_INFINITY }}
          className="absolute left-1/2 top-1/2 h-[155%] w-28 -translate-x-1/2 -translate-y-1/2 bg-[linear-gradient(180deg,rgba(255,0,110,0),rgba(255,0,110,0.18),rgba(125,211,252,0))] blur-2xl"
        />
      ))}
      {orbs.map((orb) => (
        <motion.div
          key={orb}
          animate={{
            y: [0, orb % 2 === 0 ? -18 : 18, 0],
            x: [0, orb % 3 === 0 ? 12 : -12, 0],
            opacity: [0.3, 0.55, 0.3],
            scale: [0.95, 1.16, 0.92],
          }}
          transition={{ duration: 2.8 + orb * 0.35, repeat: Number.POSITIVE_INFINITY }}
          className="absolute h-24 w-24 rounded-full blur-3xl"
          style={{
            left: `${8 + orb * 10}%`,
            top: `${14 + (orb % 3) * 22}%`,
            background:
              orb % 2 === 0 ? 'rgba(255, 133, 82, 0.18)' : 'rgba(125, 211, 252, 0.16)',
          }}
        />
      ))}
      {sparkles.map((sparkle) => (
        <motion.span
          key={sparkle}
          animate={{
            opacity: [0.12, 0.62, 0.12],
            scale: [0.8, 1.5, 0.9],
            y: [0, sparkle % 2 === 0 ? -10 : 10, 0],
          }}
          transition={{
            duration: 1.6 + (sparkle % 5) * 0.24,
            repeat: Number.POSITIVE_INFINITY,
            delay: sparkle * 0.07,
          }}
          className="absolute h-2 w-2 rounded-full bg-white/70 shadow-[0_0_14px_rgba(255,255,255,0.45)]"
          style={{
            left: `${6 + ((sparkle * 17) % 88)}%`,
            top: `${8 + ((sparkle * 13) % 78)}%`,
          }}
        />
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_55%)]" />
    </>
  )
}

function MatrixOverlay() {
  const columns = Array.from({ length: 28 }, (_, index) => index)
  const glyphs = ['01', '10', '[]', '</>', '{}', '::', '&&', '??']

  return (
    <>
      <motion.div
        animate={{ opacity: [0.16, 0.28, 0.16] }}
        transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY }}
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_42%)]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,8,7,0.1),rgba(5,31,18,0.24))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,0.28)_100%)]" />
      {columns.map((column) => (
        <motion.div
          key={column}
          initial={{ y: '-34%' }}
          animate={{ y: ['-34%', '112%'] }}
          transition={{
            duration: 5.4 + (column % 5) * 0.75,
            repeat: Number.POSITIVE_INFINITY,
            delay: column * 0.16,
            ease: 'linear',
          }}
          className="absolute top-0 font-['IBM_Plex_Mono'] text-[10px] leading-4 text-emerald-300/38 drop-shadow-[0_0_6px_rgba(16,185,129,0.2)]"
          style={{ left: `${column * 3.7}%` }}
        >
          {Array.from({ length: 22 }, (_, row) => (
            <motion.div
              key={row}
              animate={{
                opacity: row === 0 ? [0.35, 0.95, 0.35] : [0.16, 0.48, 0.16],
                x: row === 0 ? [0, 1.5, 0] : [0, 0, 0],
              }}
              transition={{ duration: 1.6 + row * 0.05, repeat: Number.POSITIVE_INFINITY }}
              className={row === 0 ? 'text-emerald-100/85' : ''}
            >
              {glyphs[(column + row) % glyphs.length]}
            </motion.div>
          ))}
        </motion.div>
      ))}
      <motion.div
        animate={{ opacity: [0.06, 0.16, 0.06] }}
        transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY }}
        className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(16,185,129,0.08),transparent)]"
      />
      <motion.div
        animate={{ y: ['-100%', '100%'] }}
        transition={{ duration: 3.4, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        className="absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(167,243,208,0.08),transparent)] blur-xl"
      />
    </>
  )
}

function SynthwaveOverlay() {
  const stars = Array.from({ length: 28 }, (_, index) => index)
  const gridLines = Array.from({ length: 10 }, (_, index) => index)
  const horizonLights = Array.from({ length: 14 }, (_, index) => index)
  const mountains = Array.from({ length: 5 }, (_, index) => index)

  return (
    <>
      <motion.div
        animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
        transition={{ duration: 14, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,0,110,0.16),rgba(96,165,250,0.1),rgba(255,133,82,0.14))] bg-[length:220%_220%]"
      />
      <motion.div
        animate={{ opacity: [0.12, 0.24, 0.12] }}
        transition={{ duration: 3.8, repeat: Number.POSITIVE_INFINITY }}
        className="absolute inset-[-12%] bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.18),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(125,211,252,0.14),transparent_28%),radial-gradient(circle_at_20%_12%,rgba(244,114,182,0.18),transparent_28%)] blur-3xl"
      />

      <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.2),transparent_50%)]" />

      {stars.map((star) => (
        <motion.span
          key={star}
          animate={{ opacity: [0.18, 0.72, 0.22], scale: [0.9, 1.25, 0.95] }}
          transition={{ duration: 1.8 + (star % 5) * 0.35, repeat: Number.POSITIVE_INFINITY, delay: star * 0.09 }}
          className="absolute h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_14px_rgba(255,255,255,0.4)]"
          style={{ left: `${8 + ((star * 17) % 84)}%`, top: `${10 + ((star * 11) % 34)}%` }}
        />
      ))}

      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        className="absolute left-1/2 top-[22%] h-36 w-36 -translate-x-1/2 rounded-full border border-fuchsia-300/30 bg-[radial-gradient(circle,rgba(255,217,61,0.95),rgba(255,94,125,0.92)_45%,rgba(255,0,110,0.18)_68%,transparent_70%)] shadow-[0_0_70px_rgba(255,0,110,0.2)]"
      >
        <div className="absolute inset-x-0 top-[38%] h-px bg-black/20" />
        <div className="absolute inset-x-0 top-[52%] h-px bg-black/20" />
        <div className="absolute inset-x-0 top-[66%] h-px bg-black/20" />
      </motion.div>

      <div className="absolute inset-x-0 bottom-24 h-24">
        {mountains.map((mountain) => (
          <motion.div
            key={mountain}
            animate={{ y: [0, mountain % 2 === 0 ? -3 : 3, 0] }}
            transition={{ duration: 6 + mountain * 0.7, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            className="absolute bottom-0 bg-[linear-gradient(180deg,rgba(56,18,92,0.92),rgba(15,9,38,0.9))]"
            style={{
              left: `${mountain * 18}%`,
              width: `${18 + (mountain % 3) * 8}%`,
              height: `${48 + (mountain % 2) * 16}px`,
              clipPath: 'polygon(0 100%, 50% 0, 100% 100%)',
              opacity: 0.78 - mountain * 0.08,
            }}
          />
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 h-48 bg-[linear-gradient(180deg,rgba(255,0,110,0),rgba(20,10,40,0.34))]" />
      <div className="absolute inset-x-0 bottom-[22%] h-px bg-fuchsia-300/40 shadow-[0_0_16px_rgba(244,114,182,0.4)]" />
      {horizonLights.map((light) => (
        <motion.div
          key={light}
          animate={{ opacity: [0.22, 0.8, 0.28], scaleX: [0.9, 1.3, 1] }}
          transition={{ duration: 1.8 + (light % 4) * 0.2, repeat: Number.POSITIVE_INFINITY, delay: light * 0.06 }}
          className="absolute bottom-[21%] h-0.5 rounded-full bg-cyan-200/80 shadow-[0_0_14px_rgba(125,211,252,0.55)]"
          style={{
            left: `${8 + light * 6.2}%`,
            width: `${10 + (light % 3) * 10}px`,
          }}
        />
      ))}
      <div className="absolute inset-x-8 bottom-0 h-44 [perspective:500px]">
        <div className="absolute inset-0 origin-bottom [transform:rotateX(72deg)]">
          {gridLines.map((line) => (
            <div
              key={`h-${line}`}
              className="absolute inset-x-0 border-t border-cyan-300/20"
              style={{ bottom: `${line * 12}%` }}
            />
          ))}
          {Array.from({ length: 11 }, (_, index) => index).map((line) => (
            <motion.div
              key={`v-${line}`}
              animate={{ opacity: [0.12, 0.28, 0.12] }}
              transition={{ duration: 2.6 + line * 0.08, repeat: Number.POSITIVE_INFINITY }}
              className="absolute top-0 bottom-0 border-l border-cyan-300/18"
              style={{ left: `${line * 10}%` }}
            />
          ))}
        </div>
      </div>

      <motion.div
        animate={{ opacity: [0.05, 0.12, 0.05] }}
        transition={{ duration: 2.8, repeat: Number.POSITIVE_INFINITY }}
        className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.06)_50%,transparent_100%)] [background-size:100%_6px]"
      />
      <motion.div
        animate={{ x: ['-20%', '120%'] }}
        transition={{ duration: 7.5, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        className="absolute bottom-[29%] h-px w-24 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.9),transparent)] shadow-[0_0_12px_rgba(255,255,255,0.45)]"
      />
    </>
  )
}
