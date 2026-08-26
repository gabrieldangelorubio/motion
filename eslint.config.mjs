// La config estándar de Next (core-web-vitals + typescript), sin reglas propias (kit §1).
import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { ignores: ["node_modules/**", ".next/**", "_andamiaje/**"] },
]);
