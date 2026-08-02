import MoneyShell from '@/components/money/MoneyShell'

export default function MoneyLayout({ children }: { children: React.ReactNode }) {
  return <MoneyShell>{children}</MoneyShell>
}
