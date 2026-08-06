/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@buildora/shared", "socket.io-client"],
};

export default nextConfig;
