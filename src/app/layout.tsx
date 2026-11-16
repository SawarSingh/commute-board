import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commute Board",
  description: "Live Delhi traffic on your daily commute.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#070a0f] text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
