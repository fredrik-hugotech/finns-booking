/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Den gamle bookingsiden (fjorårets) lå på finns-booking.vercel.app.
  // Send alle derfra til det nye systemet, så ingen booker på feil sted.
  async redirects() {
    return [{
      source: '/:sti*',
      has: [{ type: 'host', value: 'finns-booking.vercel.app' }],
      destination: 'https://finns-arena-booking.vercel.app/:sti*',
      permanent: false,
    }];
  },
};
export default nextConfig;
