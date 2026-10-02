import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GatorPath AI",
  description: "See how today's course decisions shape your path to graduation at SF State.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
