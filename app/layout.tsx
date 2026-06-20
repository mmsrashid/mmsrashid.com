import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import AuthHashRedirect from '@/components/AuthHashRedirect'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Mohammed Rashid',
  description: 'Mechanical & Software Engineer',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mmsrashid.com'),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthHashRedirect />
        {children}
      </body>
    </html>
  )
}
