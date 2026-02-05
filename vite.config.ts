import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(async () => {
  const isAndroid = process.platform === "android";
  const react = (
    await import(isAndroid ? "@vitejs/plugin-react" : "@vitejs/plugin-react-swc")
  ).default;

  return {
    plugins: [react()],
resolve: {
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
  },
},
server: {
  host: true,
},

  };
});
