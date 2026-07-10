import type { Metadata } from "next";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <ToolsProvider>{children}</ToolsProvider>
      </body>
    </html>
  );
}
