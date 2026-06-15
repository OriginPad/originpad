"use client";

import { motion } from "framer-motion";

const EASE = "easeInOut" as const;

/** Card 1: vault with a glowing core that bobs and pulses. */
export function VaultArt() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden>
      <rect x="10" y="10" width="44" height="44" rx="10" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="14" fill="none" stroke="#a5b4fc" strokeWidth="1.5" />
      <motion.circle
        cx="32" cy="32" r="7" fill="#6366f1"
        animate={{ cy: [32, 27, 32], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 4, repeat: Infinity, ease: EASE }}
      />
      <motion.circle
        cx="32" cy="32" r="7" fill="#818cf8"
        animate={{ cy: [32, 27, 32], scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
        transition={{ duration: 4, repeat: Infinity, ease: EASE }}
        style={{ transformOrigin: "32px 32px" }}
      />
    </svg>
  );
}

/** Card 2: floating NFT hologram card, gentle tilt + edge glow. */
export function HologramArt() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden>
      <motion.g
        animate={{ rotate: [-3, 3, -3], y: [0, -3, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: EASE }}
        style={{ transformOrigin: "32px 32px" }}
      >
        <motion.rect
          x="18" y="12" width="28" height="40" rx="5" fill="#eef2ff" stroke="#818cf8" strokeWidth="1.5"
          animate={{ stroke: ["#818cf8", "#c4b5fd", "#818cf8"] }}
          transition={{ duration: 3, repeat: Infinity, ease: EASE }}
        />
        <rect x="22" y="16" width="20" height="16" rx="3" fill="#c7d2fe" />
        <circle cx="28" cy="24" r="3" fill="#fff" opacity="0.8" />
        <rect x="22" y="36" width="20" height="3" rx="1.5" fill="#a5b4fc" />
        <rect x="22" y="42" width="13" height="3" rx="1.5" fill="#c7d2fe" />
      </motion.g>
    </svg>
  );
}

/** Card 3: 50% glow pulse, moving bars, bobbing orb. */
export function ScheduleArt() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <motion.rect
          key={i} x={12 + i * 11} width="6" rx="2" fill="#c7d2fe"
          animate={{ height: [10, 22, 10], y: [44, 32, 44] }}
          transition={{ duration: 3, delay: i * 0.3, repeat: Infinity, ease: EASE }}
        />
      ))}
      <motion.text
        x="32" y="26" textAnchor="middle" fontSize="15" fontWeight="700" fill="#6366f1"
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: EASE }}
      >
        50%
      </motion.text>
    </svg>
  );
}

/** Card 4: on-chain truth book, pages open + a magnifier moving as if reading. */
export function BookArt() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden>
      <path d="M12 16 Q22 12 32 16 L32 50 Q22 46 12 50 Z" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="1.5" />
      <path d="M52 16 Q42 12 32 16 L32 50 Q42 46 52 50 Z" fill="#f5f3ff" stroke="#c7d2fe" strokeWidth="1.5" />
      {/* flipping page */}
      <motion.path
        d="M32 16 Q42 12 52 16 L52 50 Q42 46 32 50 Z"
        fill="#ffffff" stroke="#ddd6fe" strokeWidth="1"
        style={{ transformOrigin: "32px 32px" }}
        animate={{ scaleX: [1, 0.05, 1, 1], opacity: [1, 0.85, 1, 1] }}
        transition={{ duration: 5.5, times: [0, 0.25, 0.5, 1], repeat: Infinity, ease: EASE }}
      />
      {/* magnifier reading up/down */}
      <motion.g
        animate={{ y: [0, 16, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: EASE }}
      >
        <circle cx="38" cy="24" r="6" fill="none" stroke="#6366f1" strokeWidth="2" />
        <line x1="42.5" y1="28.5" x2="47" y2="33" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
      </motion.g>
    </svg>
  );
}

export function PillarIcon({ art }: { art: string }) {
  if (art === "vault") return <VaultArt />;
  if (art === "hologram") return <HologramArt />;
  if (art === "schedule") return <ScheduleArt />;
  return <BookArt />;
}
