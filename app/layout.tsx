import type { Metadata } from "next";
import { preload } from "react-dom";
// Общие стили: токены, шрифты, база + Spotlight (.spot).
// menu2.css грузим глобально — его правила скоуплены под .v2/.m2-* (v1/current не задевают),
// а секция твикера (.twk*, push/scale .content) — это общая инфраструктура tools-панели.
// tools.css — добавления панели (карточки-селектор, сегмент, масштаб Current).
import "@/styles/tokens.css";
import "@/styles/fonts.css";
import "@/styles/styles.css";
import "@/styles/menu2.css";
import "@/styles/tools.css";
import ToolsProvider from "@/components/tools/ToolsProvider";

export const metadata: Metadata = {
  title: "Дашборд ИП",
  // прототип: не индексировать (дублирует robots.txt на уровне страниц)
  robots: { index: false, follow: false },
};

// Шрифты объявлены в styles/fonts.css (@font-face, семейства 'Alfa Interface
// Sans'/'Styrene UI' — глобальный CSS ссылается на имена литералом, поэтому
// next/font/local с его хешированным именем семейства не подходит). Preload
// убирает FOUT: браузер тянет woff2 сразу, не дожидаясь разбора CSS.
// crossOrigin обязателен: шрифты грузятся в CORS-режиме даже same-origin.
const FONTS = [
  "/fonts/alfa-interface-sans_regular.woff2",
  "/fonts/alfa-interface-sans_medium.woff2",
  "/fonts/alfa-interface-sans_bold.woff2",
  "/fonts/styrene-ui_bold.woff2",
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  for (const f of FONTS) {
    preload(f, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }
  return (
    <html lang="ru">
      <body>
        <ToolsProvider>{children}</ToolsProvider>
      </body>
    </html>
  );
}
