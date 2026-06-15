"use client";

import { useEffect, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

/** Slowly rotating Origin portal behind the hero, with gentle scroll parallax. */
export function HeroPortal() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, -80]); // rises a little on scroll down
  const opacity = useTransform(scrollY, [0, 500], [0.9, 0]);

  return (
    <motion.div
      style={{ y, opacity }}
      className="pointer-events-none absolute left-1/2 top-[-40px] -translate-x-1/2 z-0"
      aria-hidden
    >
      <motion.svg
        width="420" height="420" viewBox="0 0 200 200"
        animate={{ rotate: 360 }}
        transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
      >
        {[70, 56, 42].map((r, i) => (
          <circle key={i} cx="100" cy="100" r={r} fill="none"
            stroke={i === 0 ? "#c7d2fe" : i === 1 ? "#a5b4fc" : "#818cf8"}
            strokeWidth="1.2" strokeDasharray={`${6 + i * 4} ${10 + i * 6}`} opacity={0.5 - i * 0.08} />
        ))}
        <circle cx="100" cy="100" r="26" fill="url(#og)" opacity="0.18" />
        <defs>
          <radialGradient id="og">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>
        </defs>
      </motion.svg>
    </motion.div>
  );
}

/** The uploaded 3D Origin portal, gently floating in the hero (stays put on scroll). */
export function PortalImage() {
  return (
    <div className="relative flex justify-center">
      <motion.div
        className="absolute left-1/2 top-[42%] h-2/3 w-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-300/40 blur-3xl"
        animate={{ opacity: [0.5, 0.85, 0.5], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative w-full max-w-xl"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/portal4.png"
          alt="Origin portal floating in the clouds"
          className="w-full drop-shadow-[0_24px_50px_rgba(124,58,237,0.32)]"
        />
      </motion.div>
    </div>
  );
}

/** A 3D asset image that floats gently with a soft glow. */
export function FloatImg({ src, alt, className, dur = 5 }: { src: string; alt: string; className?: string; dur?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <motion.img
      src={src}
      alt={alt}
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: dur, repeat: Infinity, ease: "easeInOut" }}
      className={className}
    />
  );
}

/** Fades children up into view, once, with optional stagger index. */
export function FadeInUp({ children, index = 0, className }: { children: React.ReactNode; index?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.6, delay: index * 0.12, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/** Subtle NFT trading candle chart with slowly changing loss figures. */
export function CandleChart() {
  const losses = ["-92%", "-85%", "-97%", "-100%", "-78%"];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % losses.length), 2600);
    return () => clearInterval(t);
  }, []);

  const candles = [
    { x: 6, h: 26, dir: -1 }, { x: 20, h: 18, dir: -1 }, { x: 34, h: 30, dir: -1 },
    { x: 48, h: 14, dir: 1 }, { x: 62, h: 34, dir: -1 }, { x: 76, h: 22, dir: -1 },
    { x: 90, h: 40, dir: -1 }, { x: 104, h: 16, dir: 1 },
  ];

  return (
    <div className="rounded-2xl border border-white/50 bg-white/25 backdrop-blur-md p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Typical rug chart</span>
        <motion.span
          key={idx}
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="text-sm font-bold font-mono text-red-500"
        >
          {losses[idx]}
        </motion.span>
      </div>
      <svg viewBox="0 0 120 56" className="w-full h-24" aria-hidden>
        {candles.map((c, i) => (
          <motion.g key={i}
            animate={{ y: [0, c.dir * 3, 0] }}
            transition={{ duration: 3 + (i % 3), repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
          >
            <line x1={c.x + 3} x2={c.x + 3} y1={28 - c.h / 2} y2={28 + c.h / 2}
              stroke={c.dir < 0 ? "#fca5a5" : "#86efac"} strokeWidth="1" />
            <rect x={c.x} y={c.dir < 0 ? 28 - c.h / 3 : 28} width="6" height={c.h / 2.2} rx="1"
              fill={c.dir < 0 ? "#ef4444" : "#22c55e"} opacity="0.85" />
          </motion.g>
        ))}
        <motion.path
          d="M3 14 L17 18 L31 12 L45 26 L59 22 L73 34 L87 30 L101 46 L115 44"
          fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
          transition={{ duration: 1.6, ease: "easeOut" }}
        />
      </svg>
    </div>
  );
}
