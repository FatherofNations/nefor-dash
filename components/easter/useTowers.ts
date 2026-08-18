"use client";
import { useEffect } from "react";

/* ═══ Пасхалка №3: киберпанк-оборона счёта ═══
   Здесь только точка входа. Вся игра — движок, интерфейс и стили — лежит в
   ./td/mount и подключается динамическим import() в момент взятия
   инструмента: незачем возить полсотни килобайт каждому, кто просто открыл
   дашборд. Тело возвращает функцию уборки, её и зовём при выходе. */
export function useTowers(active: boolean) {
  useEffect(() => {
    if (!active) return;
    /* Инструмент могли снять раньше, чем чанк доехал, — тогда монтировать
       уже нечего, и уборка должна отработать по факту загрузки. */
    let dropped = false;
    let unmount: (() => void) | null = null;
    void import("./td/mount").then((m) => {
      if (dropped) return;
      unmount = m.mount();
    });
    return () => {
      dropped = true;
      unmount?.();
      unmount = null;
    };
  }, [active]);
}
