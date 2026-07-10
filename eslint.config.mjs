import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  // артефакты сборки не линтим (запуск через eslint CLI, не next lint)
  { ignores: [".next/**", ".vercel/**", "node_modules/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Верстка намеренно на обычных <img> с ассетами из /public.
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
