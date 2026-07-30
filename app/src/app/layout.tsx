import type { Metadata } from "next";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { Nav } from "./Nav";

export const metadata: Metadata = {
  title: "Store",
  description: "Inventory & sales tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ConvexClientProvider>
          <Nav />
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );
}
