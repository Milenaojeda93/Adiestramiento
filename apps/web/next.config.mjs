/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig = {
  // La web y la API comparten origen: /api/* se reenvía a la API, así la cookie de sesión es de primera parte.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
  transpilePackages: ['@adiestra/shared'],
  poweredByHeader: false,
};

export default nextConfig;
