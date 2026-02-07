import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const isAndroid = process.platform === "android";
  const react = (
    await import(isAndroid ? "@vitejs/plugin-react" : "@vitejs/plugin-react-swc")
  ).default;

  return {
    plugins: [react()],
    test: {
      environment: "jsdom",
      globals: true,

      // ✅ CHỈ chạy test của project
      include: [
        "src/**/*.{test,spec}.{ts,tsx,js,jsx}",
        "test/**/*.{test,spec}.{ts,tsx,js,jsx}",
      ],

      // ✅ loại trừ tuyệt đối node_modules + supabase (deno https import)
      exclude: [
        "**/node_modules/**",
        "node_modules/**",
        "**/supabase/**",
        "supabase/**",
        "dist/**",
        "build/**",
        ".next/**",
      ],
    },
  };
});
