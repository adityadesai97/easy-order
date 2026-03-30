import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Easy Order",
  description: "Group dining order assistant",
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
          <div className="w-full max-w-md">{children}</div>
        </main>
      </body>
    </html>
  );
}
