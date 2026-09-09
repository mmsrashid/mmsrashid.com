import { redirect } from 'next/navigation'

/**
 * The Spending tab became "Personal" when the personal and property books were
 * separated. Kept as a redirect so an existing bookmark or a link written down
 * elsewhere still lands somewhere useful.
 */
export default function SpendingRedirect() {
  redirect('/dashboard/money/personal')
}
