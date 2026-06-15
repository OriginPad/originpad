"use client";

import { motion, useScroll, useTransform } from "framer-motion";

/**
 * Origin portal as a crisp animated vector: a glowing ring portal with rotating
 * dashed rings, an energy core, and orbiting crystals. Sharp at any size, and
 * the whole thing floats + parallaxes on scroll.
 */
export function PortalArt() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, -55]);

  return (
    <motion.div style={{ y }} className="relative mx-auto flex w-full max-w-md items-center justify-center">
      <motion.div
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="w-full"
      >
        <svg viewBox="0 0 320 320" className="w-full" aria-hidden>
          <defs>
            <radialGradient id="aura" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#a5b4fc" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#c4b5fd" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
            <radialGradient id="core" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="35%" stopColor="#c7d2fe" />
              <stop offset="100%" stopColor="#6366f1" />
            </radialGradient>
            <radialGradient id="inner" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#eef2ff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#c7d2fe" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Pulsing aura */}
          <motion.circle
            cx="160" cy="160" r="150" fill="url(#aura)"
            animate={{ opacity: [0.6, 1, 0.6], scale: [0.96, 1.02, 0.96] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: "160px 160px" }}
          />

          {/* Portal opening glow */}
          <circle cx="160" cy="160" r="96" fill="url(#inner)" />

          {/* Solid outer ring */}
          <circle cx="160" cy="160" r="110" fill="none" stroke="url(#ring)" strokeWidth="10" opacity="0.95" />
          <circle cx="160" cy="160" r="110" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.35" />

          {/* Rotating dashed rings (opposite directions) */}
          <motion.circle
            cx="160" cy="160" r="128" fill="none" stroke="#a5b4fc" strokeWidth="2.5" strokeDasharray="3 16" strokeLinecap="round"
            animate={{ rotate: 360 }} transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "160px 160px" }}
          />
          <motion.circle
            cx="160" cy="160" r="92" fill="none" stroke="#818cf8" strokeWidth="2" strokeDasharray="2 14"
            animate={{ rotate: -360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "160px 160px" }}
          />

          {/* Orbiting crystals */}
          <motion.g
            animate={{ rotate: 360 }} transition={{ duration: 34, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "160px 160px" }}
          >
            {[0, 90, 180, 270].map((a) => {
              const rad = (a * Math.PI) / 180;
              const cx = 160 + 128 * Math.cos(rad);
              const cy = 160 + 128 * Math.sin(rad);
              return (
                <g key={a} transform={`translate(${cx - 7} ${cy - 7})`}>
                  <path d="M7 0 L14 7 L7 18 L0 7 Z" fill="#c4b5fd" opacity="0.9" />
                  <path d="M7 0 L14 7 L7 7 Z" fill="#eef2ff" />
                </g>
              );
            })}
          </motion.g>

          {/* Energy core: ORIGIN hexagon cube */}
          <motion.g
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: "160px 160px" }}
          >
            <polygon points="160,118 196,139 196,181 160,202 124,181 124,139" fill="url(#core)" />
            <polygon points="160,118 196,139 160,160 124,139" fill="#e0e7ff" opacity="0.9" />
            <polygon points="124,139 160,160 160,202 124,181" fill="#a5b4fc" opacity="0.85" />
            <polygon points="196,139 160,160 160,202 196,181" fill="#818cf8" opacity="0.9" />
          </motion.g>

          {/* Light beams */}
          <motion.g
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            stroke="#c7d2fe" strokeWidth="1"
          >
            <line x1="160" y1="50" x2="160" y2="20" />
            <line x1="160" y1="270" x2="160" y2="300" />
          </motion.g>
        </svg>
      </motion.div>
    </motion.div>
  );
}
