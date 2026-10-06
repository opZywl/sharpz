import type { Metadata } from "next"
import localFont from "next/font/local"

import { LanguageScript } from "@/components/language-script"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeScript } from "@/components/theme-script"
import { DEFAULT_LANG } from "@/lib/i18n/config"
import { I18nProvider } from "@/lib/i18n/provider"
import "./globals.css"

const spaceGrotesk = localFont({
    src: "./fonts/space-grotesk.woff2",
    variable: "--font-space-grotesk",
    weight: "300 700",
    display: "swap",
})

const jakarta = localFont({
    src: "./fonts/plus-jakarta-sans.woff2",
    variable: "--font-jakarta",
    weight: "200 800",
    display: "swap",
})

export const metadata: Metadata = {
    title: "Sharpz",
    description: "Sharpz: background removal, SVG vectorization, KTX2 textures and video transcription in one dashboard.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang={DEFAULT_LANG} suppressHydrationWarning>
            <head>
                <ThemeScript />
                <LanguageScript />
            </head>
            <body className={`${spaceGrotesk.variable} ${jakarta.variable} antialiased`}>
                <ThemeProvider>
                    <I18nProvider>{children}</I18nProvider>
                </ThemeProvider>
            </body>
        </html>
    )
}
