import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";
import { AuthContextProvider } from '@/context/AuthContext';
import { WalletContextProvider } from '@/context/WalletContext';
import { ThemeProvider } from "next-themes";

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: "Sol Audit - Secure Smart Contract Audits",
  description: "Connecting security auditors with Solana projects that need smart contract auditing",
  authors: [{ name: "Dishank Chauhan" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light" style={{ colorScheme: 'light' }}>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} forcedTheme="light">
          <WalletContextProvider>
            <AuthContextProvider>
              {children}
            </AuthContextProvider>
          </WalletContextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
