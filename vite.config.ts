import { defineConfig } from "vite";

export default defineConfig(async () => {
  const isAndroid = process.platform === "android";
  const react = (
    await import(isAndroid ? "@vitejs/plugin-react" : "@vitejs/plugin-react-swc")
  ).default;

  return {
    plugins: [react()],
  };
});
