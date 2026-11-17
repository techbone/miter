/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@miter/core'],
  webpack: (config) => {
    // @miter/core is TS source using `.js` specifiers (NodeNext style)
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    // MiniSat's emscripten build probes for node modules it never uses in the browser
    config.resolve.fallback = { ...(config.resolve.fallback || {}), fs: false, path: false, crypto: false };
    return config;
  },
};
export default nextConfig;
