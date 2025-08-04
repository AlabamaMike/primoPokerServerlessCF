import type { Metadata } from "next";
import "./globals.css";

// Required for Cloudflare Pages deployment
export const runtime = 'edge';

export const metadata: Metadata = {
  title: "Primo Poker - Professional Online Poker",
  description: "Professional poker room with real-time gameplay and advanced features - Now in Production!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
