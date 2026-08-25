"use client";
import { useEffect } from "react";

/* ═══ Пасхалка №4: «Броневик» ═══
   Только точка входа. Игра целиком — движок, арена, интерфейс и стили — лежит
   в ./tanks/mount и подключается динамическим import() в момент взятия
   инструмента, как и башенная. */
export function useTanks(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let dropped = false;
    let unmount: (() => void) | null = null;
    void import("./tanks/mount").then((m) => {
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
