import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` prints a Network URL next to the Local one, and on Windows that
  // URL is the WSL/Hyper-V vEthernet address. Opening it without listing the
  // origin here makes Next answer every /_next/* request with 403: the page
  // paints, no chunk loads, and nothing on it responds. Dev only.
  allowedDevOrigins: ["172.30.32.1", "192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
