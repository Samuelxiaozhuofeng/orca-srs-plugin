import react from "@vitejs/plugin-react-swc";
import externalGlobals from "rollup-plugin-external-globals";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const isBuild = command === "build";
  const nodeEnv = isBuild ? "production" : "development";

  return {
    // Force production React JSX runtime selection when building the library.
    define: {
      "process.env.NODE_ENV": JSON.stringify(nodeEnv),
    },
    build: {
      lib: {
        entry: "src/main.ts",
        fileName: "index",
        formats: ["es"],
      },
      cssCodeSplit: false,
      sourcemap: false,
      minify: isBuild ? "esbuild" : false,
      rollupOptions: {
        external: ["react", "valtio"],
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    plugins: [
      react(),
      externalGlobals({ react: "React", valtio: "Valtio" }),
    ],
  };
});
