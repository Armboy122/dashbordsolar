import type { Metadata } from "next";
import type { ReactNode } from "react";
import "antd/dist/reset.css";
import "./globals.css";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Navbar } from "@/src/components/navbar";
import { AntdProvider } from "@/src/components/antd-provider";

export const metadata: Metadata = {
  title: "AnalysisSolar — Inspection Desk",
  description: "Minimal inverter-first dashboard for solar site analysis",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AntdRegistry>
          <AntdProvider>
            <Navbar />
            {children}
          </AntdProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
