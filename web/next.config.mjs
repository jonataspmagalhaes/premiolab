/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // premiolab.com.br domain — produção via Vercel
  // Imagens externas (StatusInvest favicons etc) — adicionar conforme necessário
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'statusinvest.com.br' },
      { protocol: 'https', hostname: 'zephynezarjsxzselozi.supabase.co' },
    ],
  },
};

export default nextConfig;
