import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Zenbu Dictionary UI Prototype",
  description: "Throwaway UI directions for issue #295",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
