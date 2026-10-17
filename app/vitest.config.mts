import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Las pruebas corren en Node: el dominio y la capa de datos (con `node:sqlite`). Las pantallas no se prueban aquí.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
