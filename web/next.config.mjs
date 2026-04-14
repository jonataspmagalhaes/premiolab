/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['localhost', '100.64.176.123'],
  devIndicators: false,
  // premiolab.com.br domain — produção via Vercel
  // Imagens externas (StatusInvest favicons etc) — adicionar conforme necessário
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'icons.brapi.dev' },
      { protocol: 'https', hostname: 'statusinvest.com.br' },
      { protocol: 'https', hostname: 'zephynezarjsxzselozi.supabase.co' },
    ],
  },
};

export default nextConfig;
