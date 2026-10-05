import type { Metadata } from "next"
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google"

import { ThemeProvider } from "@/components/theme-provider"
import { ThemeScript } from "@/components/theme-script"
import "./globals.css"

const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-space-grotesk",
    display: "swap",
})

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    variable: "--font-jakarta",
    weight: ["400", "500", "600", "700", "800"],
    display: "swap",
})

export const metadata: Metadata = {
    title: "Sharpz",
    description:
        "Sharpz — remocao de fundo, vetorizacao SVG, texturas KTX2 e transcricao de video. Tudo num so painel.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR" suppressHydrationWarning>
            <head>
                <ThemeScript />
            </head>
            <body className={`${spaceGrotesk.variable} ${jakarta.variable} antialiased`}>
                <ThemeProvider>{children}</ThemeProvider>
            </body>
        </html>
    )
}
