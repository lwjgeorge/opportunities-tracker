import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // GitHub OAuth profile avatars. Required for next/image in the sidebar.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/u/**",
      },
    ],
  },
};

export default nextConfig;
