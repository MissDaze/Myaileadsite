/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#6366f1", foreground: "#fff" },
        secondary: { DEFAULT: "#f1f5f9" },
        destructive: { DEFAULT: "#ef4444" },
        success: { DEFAULT: "#22c55e" },
        warning: { DEFAULT: "#f59e0b" },
      }
    }
  },
  plugins: []
}
