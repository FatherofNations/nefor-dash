import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Верстка использует обычные <img> с путями в /public (не next/image).
  // Линт живёт отдельно от билда (npm run lint, --max-warnings 0, гоняется в CI);
  // встроенный в next build раннер deprecated и удаляется в Next 16.
  eslint: { ignoreDuringBuilds: true },
  // Figma-ассеты неизменяемы (новая версия = новое имя файла) → вечный кеш.
  // Дефолт Vercel для /public — max-age=0, must-revalidate: каждый визит
  // ре-валидирует все картинки; с immutable повторные заходы мгновенные.
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
