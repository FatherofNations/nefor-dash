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
      // ИСКЛЮЧЕНИЕ из правила выше: ассеты пасхалки (звуки, треки, спрайты)
      // подменяются ПОД ТЕМ ЖЕ именем. С immutable браузер не перепроверяет
      // файл год и продолжает играть старую версию даже после перезагрузки —
      // на этом уже попались с картинкой босса и со звуком выбора скилла.
      // no-cache = хранить можно, но каждый раз спрашивать (обычно это 304).
      // Правило идёт ПОСЛЕ /assets/:path*, поэтому перебивает его.
      {
        source: "/assets/easter/:path*",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
