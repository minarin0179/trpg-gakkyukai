import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発時にLAN内の実機(スマホ等)から http://<WSLのIP>:3000 でアクセスできるようにする。
  // 本番には影響しない(dev専用設定)
  allowedDevOrigins: ["192.168.191.79"],
  /* config options here */
};

export default nextConfig;
