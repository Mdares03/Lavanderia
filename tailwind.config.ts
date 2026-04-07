import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        surface: "#f8f6ee",
        panel: "#ffffff",
        accent: "#0f766e",
        available: "#166534",
        running: "#1d4ed8",
        danger: "#b91c1c",
        warning: "#a16207"
      }
    }
  },
  plugins: []
};

export default config;
