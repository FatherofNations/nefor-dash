import type { MetadataRoute } from "next";

// Дизайн-прототип на публичном домене — закрыт от индексации поисковиками.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
