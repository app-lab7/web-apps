import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Score Input｜校舎共通版",
  description: "校舎名を自由に登録できる、生徒とテストの成績管理アプリ。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
