/** @type {import('next').NextConfig} */
const ADRESSE = 'https://vinterbooking.finnsfairway.no';

const nextConfig = {
  reactStrictMode: true,
  // Bookingsiden har én adresse: vinterbooking.finnsfairway.no. Vercel-
  // adressene (og fjorårets finns-booking.vercel.app) sender alle dit.
  async redirects() {
    return ['finns-booking.vercel.app', 'finns-arena-booking.vercel.app'].map(host => ({
      source: '/:sti*',
      has: [{ type: 'host', value: host }],
      destination: `${ADRESSE}/:sti*`,
      permanent: false,
    }));
  },
};
export default nextConfig;
