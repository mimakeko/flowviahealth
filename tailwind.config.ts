import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0A2540",
        blue: "#1D4EDB",
        teal: "#00B2A9",
        success: "#2ECC71",
        mist: "#F5F7FA",
        ice: "#E6F2FF",
        line: "#DCE5EC",
      },
      boxShadow: {
        soft: "0 22px 60px rgba(10, 37, 64, 0.12)",
        panel: "0 10px 30px rgba(10, 37, 64, 0.09)",
      },
    },
  },
  plugins: [],
};

export default config;
