import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Device apps are pure clients: Electron loads out/ via the app:// protocol,
  // Capacitor ships out/ as the web bundle, web hosts it statically.
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
