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
      },
      typography: ({ theme }) => ({
        invert: {
          css: {
            "--tw-prose-body": theme("colors.text.DEFAULT"),
            "--tw-prose-headings": theme("colors.text.DEFAULT"),
            "--tw-prose-lead": theme("colors.text.light"),
            "--tw-prose-links": theme("colors.nextflow-green.DEFAULT"),
            "--tw-prose-bold": theme("colors.text.DEFAULT"),
            "--tw-prose-counters": theme("colors.text.light"),
            "--tw-prose-bullets": theme("colors.accent.DEFAULT"),
            "--tw-prose-hr": theme("colors.accent.DEFAULT"),
            "--tw-prose-quotes": theme("colors.text.DEFAULT"),
            "--tw-prose-quote-borders": theme("colors.accent.DEFAULT"),
            "--tw-prose-captions": theme("colors.text.light"),
            "--tw-prose-code": theme("colors.text.DEFAULT"),
            "--tw-prose-pre-code": theme("colors.text.DEFAULT"),
            "--tw-prose-pre-bg": theme("colors.background"),
            "--tw-prose-th-borders": theme("colors.accent.DEFAULT"),
            "--tw-prose-td-borders": theme("colors.accent.DEFAULT"),
          },
        },
      }),
    },
  },
  plugins: [require("@tailwindcss/typography"), require("@tailwindcss/forms")],
};
