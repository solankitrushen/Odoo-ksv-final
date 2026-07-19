import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1.25rem", lg: "2rem" },
      screens: { "2xl": "1200px" },
    },
    extend: {
      colors: {
        background: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        foreground: "var(--ink)",
        ink: {
          DEFAULT: "var(--ink)",
          soft: "var(--ink-soft)",
        },
        line: {
          DEFAULT: "var(--line)",
          strong: "var(--line-strong)",
        },
        primary: {
          DEFAULT: "var(--ink)",
          foreground: "var(--surface)",
        },
        muted: {
          DEFAULT: "var(--muted-surface)",
          foreground: "var(--ink-soft)",
        },
        accent: {
          DEFAULT: "var(--muted-surface)",
          foreground: "var(--ink)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--ink)",
        },
        popover: {
          DEFAULT: "var(--card)",
          foreground: "var(--ink)",
        },
        secondary: {
          DEFAULT: "var(--muted-surface)",
          foreground: "var(--ink)",
        },
        border: "var(--line)",
        input: "var(--line)",
        ring: "var(--ink)",
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--surface)",
        },
        warn: {
          DEFAULT: "var(--warn)",
          foreground: "var(--ink)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          foreground: "var(--surface)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "var(--surface)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        display: ["clamp(2.75rem, 6vw, 3.875rem)", { lineHeight: "1.02", letterSpacing: "-0.02em" }],
        hero: ["clamp(3.25rem, 9vw, 5.5rem)", { lineHeight: "0.98", letterSpacing: "-0.03em" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      maxWidth: {
        prose: "68ch",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-quart": "cubic-bezier(0.25, 1, 0.5, 1)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
