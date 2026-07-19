import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import type { Metadata } from "next";

export const metadata: Metadata = {
  description: "Renton rental operations — dashboard, catalogue, rentals, deposits, and fulfilment",
  icons: { apple: "/icon.svg", icon: "/icon.svg", shortcut: "/icon.svg" },
  title: "Renton Admin",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased h-screen overflow-hidden">
        <ThemeProvider defaultTheme="system" enableSystem>
          <QueryProvider>
            <AuthProvider>
              {children}
              <Toaster
                closeButton
                position="top-right"
                richColors
                visibleToasts={3}
              />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
