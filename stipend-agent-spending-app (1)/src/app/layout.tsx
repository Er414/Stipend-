import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Syne } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-grotesk",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stipend",
  description:
    "You set the allowance. The model cannot rewrite it. A passkey-owned AUSD stipend on Monad.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${fraunces.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
