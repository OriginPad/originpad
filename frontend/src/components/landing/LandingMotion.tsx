"use client";

import { motion, useScroll, useTransform } from "framer-motion";

function Cloud({ scale = 1 }: { scale?: number }) {
  return (
    <svg viewBox="0 0 120 60" width={120 * scale} height={60 * scale} aria-hidden>
      <g fill="currentColor">
        <ellipse cx="40" cy="40" rx="34" ry="18" />
        <ellipse cx="70" cy="34" rx="28" ry="20" />
        <ellipse cx="92" cy="42" rx="22" ry="14" />
        <ellipse cx="22" cy="44" rx="20" ry="12" />
      </g>
    </svg>
  );
}

function Crystal({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d="M12 1 L20 9 L12 23 L4 9 Z" fill="#a5b4fc" opacity="0.5" />
      <path d="M12 1 L20 9 L12 9 Z" fill="#c7d2fe" opacity="0.65" />
      <path d="M4 9 L12 9 L12 23 Z" fill="#818cf8" opacity="0.45" />
    </svg>
  );
}

// Three cloud layers at different speeds + scroll parallax depths = floating world
const LAYERS = [
  { items: [{ top: "6%", s: 0.8 }, { top: "26%", s: 0.6 }, { top: "44%", s: 0.7 }], dur: 120, depth: -40, opacity: 0.5 },
  { items: [{ top: "14%", s: 1.1 }, { top: "38%", s: 0.9 }, { top: "58%", s: 1.0 }], dur: 80, depth: -90, opacity: 0.65 },
  { items: [{ top: "9%", s: 1.5 }, { top: "30%", s: 1.2 }, { top: "66%", s: 1.3 }], dur: 50, depth: -160, opacity: 0.8 },
];

const PARTICLES = Array.from({ length: 10 }).map((_, i) => ({
  left: `${(i * 9.5 + 5) % 95}%`,
  size: 8 + ((i * 37) % 12),
  dur: 16 + ((i * 13) % 12),
  delay: -((i * 7) % 16),
  drift: (i % 2 === 0 ? 1 : -1) * (10 + (i % 5) * 6),
}));

/** Bright drifting cloudscape drawn in SVG (sharp at any size, never blurry). */
export function LandingMotion() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1400], [0, LAYERS[0].depth]);
  const y2 = useTransform(scrollY, [0, 1400], [0, LAYERS[1].depth]);
  const y3 = useTransform(scrollY, [0, 1400], [0, LAYERS[2].depth]);
  const layerY = [y1, y2, y3];

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Soft purple sky */}
      <div className="absolute inset-x-0 top-0 h-[95vh] bg-gradient-to-b from-indigo-100 via-violet-50/70 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-[60vh] bg-gradient-to-b from-indigo-200/40 to-transparent" />

      {LAYERS.map((layer, li) => (
        <motion.div key={li} style={{ y: layerY[li] }} className="absolute inset-0">
          {layer.items.map((c, ci) => (
            <motion.div
              key={ci}
              className="absolute text-white"
              style={{ top: c.top, opacity: layer.opacity, filter: "drop-shadow(0 8px 14px rgba(99,102,241,0.10))" }}
              initial={{ x: "-20vw" }}
              animate={{ x: "120vw" }}
              transition={{ duration: layer.dur, delay: -ci * (layer.dur / 2), repeat: Infinity, ease: "linear" }}
            >
              <Cloud scale={c.s} />
            </motion.div>
          ))}
        </motion.div>
      ))}

      {PARTICLES.map((p, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: p.left, top: "100%" }}
          animate={{ y: ["0vh", "-115vh"], x: [0, p.drift, 0], rotate: [0, 180], opacity: [0, 0.8, 0.8, 0] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "linear" }}
        >
          <Crystal size={p.size} />
        </motion.div>
      ))}
    </div>
  );
}
