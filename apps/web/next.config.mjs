/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@buildora/shared", "socket.io-client"],

  /**
   * Response headers, set here rather than in a host's config so they travel
   * with the app whether it is on Vercel, a container, or a laptop.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Nothing here is meant to be framed, and the Design Studio is
          // exactly the kind of full-screen canvas a clickjacking overlay
          // would target.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Send the origin to other sites but never the path. A share link
          // like /p/<token> is only secret because it is unguessable, and a
          // full Referer would hand it to whatever the page links out to.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            /**
             * Deny by default, allow only what the app genuinely uses:
             *
             *  - camera and microphone: the 1:1 WebRTC calls
             *  - geolocation: the geofenced site check-in
             *
             * Getting this wrong is silent in the worst way — the browser
             * simply refuses the permission and the feature looks broken with
             * no error to search for. Removing `self` from any of the three
             * disables a working feature.
             */
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(self), payment=()",
          },
        ],
      },
      {
        // The generated icons never change without changing their filename's
        // meaning, so they can be cached hard.
        source: "/:file(icon-192.png|icon-512.png|icon-maskable-512.png|badge-72.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // The service worker must not be cached, or a browser will keep
        // running last month's copy after a deploy.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
