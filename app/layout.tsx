import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope, Geist } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Intelligenz Struktur Test",
  description: "Prototype LMS untuk alur peserta IST, skoring HR, dan pelaporan hasil.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={cn("h-full", "antialiased", manrope.variable, ibmPlexMono.variable, "font-sans", geist.variable)}>
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
