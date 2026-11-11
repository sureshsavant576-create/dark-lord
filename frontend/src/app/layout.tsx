import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sanket AI - Brand Governance & Multimodal Inspection",
  description: "Enterprise Brand DNA Governance, Content Review, and Fact Verification Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#090d16] text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
