import './globals.css';

export const metadata = {
  title: 'Echo Films | Management Training',
  description: 'Film Production Management Training Program',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}