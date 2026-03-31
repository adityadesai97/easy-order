import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import BrandLogo from "@/components/BrandLogo";
import "./globals.css";

export const metadata: Metadata = {
  title: "Easy Order",
  description: "Group dining order assistant",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 antialiased">
        <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-md flex flex-col items-center gap-8">
            <BrandLogo className="justify-center" />
            <div className="w-full">{children}</div>
          </div>
        </main>
        <Analytics />
      </body>
    </html>
  );
}
