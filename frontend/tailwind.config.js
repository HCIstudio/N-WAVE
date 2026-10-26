/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#1E1E1E",
        text: {
          DEFAULT: "#F5F5F5",
          light: "#A0A0A0",
        },
        accent: {
          DEFAULT: "#3A3A3A",
          hover: "#4A4A4A",
        },
        panel: {
          background: "#2D2D2D",
          border: "#4A4A4A",
        },
        "nextflow-green": {
          DEFAULT: "#00A878",
          dark: "#007F5C",
        },
        // Semantic status colors, used for toasts, dialogs, and inline
        // feedback. Tuned to read on both the dark panels and light surfaces.
        success: {
          DEFAULT: "#10B981",
          hover: "#059669",
        },
        warning: {
          DEFAULT: "#F59E0B",
          hover: "#D97706",
        },
        danger: {
          DEFAULT: "#EF4444",
          hover: "#DC2626",
        },
        info: {
          DEFAULT: "#3B82F6",
          hover: "#2563EB",
        },
        // Shared scrim for modal/dialog backdrops so every overlay dims the
        // page by the same amount.
        overlay: "rgba(0, 0, 0, 0.6)",
      },
      // A bar sliding along a track: work going on whose length isn't known.
      keyframes: {
        indeterminate: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        indeterminate: "indeterminate 1.6s ease-in-out infinite",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
