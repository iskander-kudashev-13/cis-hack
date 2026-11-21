/** @type {import('tailwindcss').Config} */
const tokens = ["bg", "surface", "sidebar", "surface-2", "surface-3", "border", "border-2",
  "text", "text-2", "text-3", "accent", "accent-soft", "pos", "neg", "warn"];
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderColor: { DEFAULT: "var(--border)" },
      colors: Object.fromEntries(tokens.map((t) => [t, `color-mix(in srgb, var(--${t}) calc(<alpha-value> * 100%), transparent)`])),
      fontFamily: {
        sans: ["Geist", "Geist Sans", "system-ui", "-apple-system", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: { base: ["13px", "1.45"] },
    },
  },
  plugins: [],
};
