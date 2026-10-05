import type { Metadata } from "next"
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google"

import { LanguageScript } from "@/components/language-script"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeScript } from "@/components/theme-script"
import { DEFAULT_LANG } from "@/lib/i18n/config"
import { I18nProvider } from "@/lib/i18n/provider"
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
