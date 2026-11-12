module.exports = {
  content: ["./dist/index.html", "./dist/app.js", "./dist/screen-renderers.js"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "sans-serif"] },
      colors: {
        slateDeep: "#0F172A",
        hubGreen: "#10B981",
        hubBlue: "#2563EB",
        hubAmber: "#F59E0B",
        hubRose: "#EF4444",
      },
      boxShadow: {
        card: "0 2px 10px -2px rgba(15,23,42,.06), 0 1px 3px -1px rgba(15,23,42,.04)",
      },
    },
  },
  plugins: [],
};
