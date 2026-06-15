import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light theme core
        void: "#0f172a",       // dark navy — for text, dark buttons
        surface: "#eef1f6",    // very light gray — page background
        panel: "#ffffff",      // white — cards
        border: "#e2e8f0",     // light gray border
        muted: "#f1f5f9",      // light muted background
        // Primary accent — indigo/purple (ETH + modern)
        amber: {
          DEFAULT: "#6366f1",  // indigo
          bright: "#818cf8",   // lighter indigo
          dim: "#4338ca",      // darker indigo
          glow: "#6366f133",
        },
        // Rarity (unchanged)
        common: "#6b7280",
        uncommon: "#22c55e",
        rare: "#3b82f6",
        epic: "#a855f7",
        legendary: "#f59e0b",
        mythic: "#ec4899",
        // Text — dark on white
        text: {
          primary: "#0f172a",
          secondary: "#64748b",
          dim: "#94a3b8",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        body: ["var(--font-body)", "sans-serif"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)",
        "gradient-hero": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        "gradient-card": "linear-gradient(135deg, #f5f7ff 0%, #ffffff 100%)",
      },
      backgroundSize: {
        "grid": "40px 40px",
      },
      borderRadius: {
        "xl": "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 6s ease-in-out infinite",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(99,102,241,0.2)" },
          "50%": { boxShadow: "0 0 40px rgba(99,102,241,0.4)" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      boxShadow: {
        "amber": "0 0 30px rgba(99,102,241,0.15)",
        "amber-lg": "0 0 60px rgba(99,102,241,0.2)",
        "inner-amber": "inset 0 0 30px rgba(99,102,241,0.05)",
        "panel": "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
        "card": "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04)",
        "card-hover": "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
        "btn": "0 4px 14px rgba(99,102,241,0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
