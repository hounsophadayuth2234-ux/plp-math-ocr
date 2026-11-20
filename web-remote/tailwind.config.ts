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
        cyber: {
          bg: "#07080d",
          panel: "#0f121d",
          card: "#141926",
          border: "#1f273d",
          cyan: "#00f0ff",
          magenta: "#ff007f",
          green: "#00ff9f",
          yellow: "#ffea00",
          red: "#ff003c",
          purple: "#a855f7",
        },
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace",
        ],
      },
      animation: {
        "pulse-fast": "pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow-cyan": "glowCyan 2s ease-in-out infinite alternate",
        "shake": "shake 0.4s cubic-bezier(.36,.07,.19,.97) both",
      },
      keyframes: {
        glowCyan: {
          "0%": { boxShadow: "0 0 5px rgba(0, 240, 255, 0.2), inset 0 0 5px rgba(0, 240, 255, 0.1)" },
          "100%": { boxShadow: "0 0 20px rgba(0, 240, 255, 0.6), inset 0 0 10px rgba(0, 240, 255, 0.3)" },
        },
        shake: {
          "10%, 90%": { transform: "translate3d(-2px, 0, 0)" },
          "20%, 80%": { transform: "translate3d(3px, 0, 0)" },
          "30%, 50%, 70%": { transform: "translate3d(-4px, 0, 0)" },
          "40%, 60%": { transform: "translate3d(4px, 0, 0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
