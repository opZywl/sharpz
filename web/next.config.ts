import type { NextConfig } from "next"

const nextConfig: NextConfig = {
    reactStrictMode: true,
    devIndicators: false,
    experimental: {
        proxyTimeout: 30 * 60 * 1000,
        middlewareClientMaxBodySize: "1gb",
    },
    async rewrites() {
        return [
            {
                source: "/api/:path*",
                destination: "http://127.0.0.1:8000/api/:path*",
            },
        ]
    },
}

export default nextConfig
