import { useState, useCallback, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { RocketIcon, CheckCircleIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Modal } from '@/components/modal/Modal'
import { usePaddle } from '@/hooks/usePaddle'
import { PADDLE_PRICE_IDS } from '@/lib/paddle-config'
import { pollForTierChange } from '@/stores/user-store'

interface UpgradePromptProps {
  isOpen: boolean
  onClose: () => void
  message?: string
}

const GROWTH_BENEFITS = [
  '5 publications',
  'Unlimited topics',
  '10 auto-published posts/week',
  'Up to 5 custom writing styles',
  'Priority support',
]

function usePricePreview() {
  const [prices, setPrices] = useState<{ monthly: string | null; yearly: string | null; yearlyPerMonth: string | null; savingsPercent: number }>({
    monthly: null,
    yearly: null,
    yearlyPerMonth: null,
    savingsPercent: 0,
  })

  useEffect(() => {
    async function fetchPrices() {
      try {
        const { initializePaddle } = await import('@paddle/paddle-js')
        const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN
        if (!token) return

        const environment = import.meta.env.VITE_PADDLE_ENVIRONMENT === 'production'
          ? 'production'
          : 'sandbox'

        const paddle = await initializePaddle({ token, environment })
        if (!paddle) return

        const preview = await paddle.PricePreview({
          items: [
            { priceId: PADDLE_PRICE_IDS.growthMonthly, quantity: 1 },
            { priceId: PADDLE_PRICE_IDS.growthYearly, quantity: 1 },
          ],
        })

        const monthlyLine = preview.data.details.lineItems.find(
          (item) => item.price.id === PADDLE_PRICE_IDS.growthMonthly,
        )
        const yearlyLine = preview.data.details.lineItems.find(
          (item) => item.price.id === PADDLE_PRICE_IDS.growthYearly,
        )

        if (monthlyLine && yearlyLine) {
          const monthlyAmount = Number(monthlyLine.formattedTotals.subtotal.replace(/[^\d.]/g, ''))
          const yearlyAmount = Number(yearlyLine.formattedTotals.subtotal.replace(/[^\d.]/g, ''))
          const yearlyPerMonth = yearlyAmount / 12
          const currencyMatch = monthlyLine.formattedTotals.subtotal.match(/^[^\d]+/)
          const currencySymbol = currencyMatch ? currencyMatch[0] : '$'
          const savings = Math.round((1 - yearlyPerMonth / monthlyAmount) * 100)

          setPrices({
            monthly: monthlyLine.formattedTotals.subtotal,
            yearly: yearlyLine.formattedTotals.subtotal,
            yearlyPerMonth: `${currencySymbol}${yearlyPerMonth.toFixed(2)}`,
            savingsPercent: savings,
          })
        }
      } catch {
        // Silently fail — prices just won't show
      }
    }

    fetchPrices()
  }, [])

  return prices
}

export function UpgradePrompt({ isOpen, onClose, message }: UpgradePromptProps) {
  const { user } = useUser()
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const prices = usePricePreview()

  const { openCheckout } = usePaddle({
    onCheckoutCompleted: () => {
      toast.success('Welcome to Growth! Your account is being upgraded...')
      onClose()
      // Poll until the webhook processes and the tier updates in the store
      pollForTierChange().then(() => {
        toast.success('Your Growth plan is now active!')
      })
    },
  })

  const handleUpgrade = useCallback(() => {
    const userId = user?.id
    if (!userId) {
      toast.error('Unable to start checkout. Please try again.')
      return
    }

    const priceId = billingPeriod === 'monthly'
      ? PADDLE_PRICE_IDS.growthMonthly
      : PADDLE_PRICE_IDS.growthYearly

    const email = user?.primaryEmailAddress?.emailAddress ?? ''
    openCheckout(priceId, email, userId)
  }, [billingPeriod, user, openCheckout])

  const displayPrice = billingPeriod === 'monthly'
    ? prices.monthly
    : prices.yearlyPerMonth

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)]/10">
            <RocketIcon size={26} weight="fill" className="text-[var(--color-accent)]" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-[var(--color-text-primary)]">
              Upgrade to Growth
            </h3>
            <p className="text-sm text-[var(--color-text-muted)]">
              Unlock higher limits and more power
            </p>
          </div>
        </div>

        {/* Message */}
        <p className="text-base text-[var(--color-text-secondary)]">
          {message || 'Upgrade to the Growth plan and enjoy all these added benefits:'}
        </p>

        {/* Price display */}
        <div className="text-center">
          {displayPrice ? (
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-4xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
                {displayPrice}
              </span>
              <span className="text-base text-[var(--color-text-muted)]">
                {billingPeriod === 'monthly' ? '/ month' : '/ month, billed yearly'}
              </span>
            </div>
          ) : (
            <div className="flex items-baseline justify-center gap-1">
              <div className="h-10 w-24 animate-pulse rounded-lg bg-[var(--color-border-default)]" />
            </div>
          )}
          {billingPeriod === 'yearly' && prices.savingsPercent > 0 && (
            <span className="mt-1 inline-block rounded-full bg-[var(--color-accent)] px-2.5 py-0.5 text-xs font-semibold text-white">
              Save {prices.savingsPercent}%
            </span>
          )}
        </div>

        {/* Benefits */}
        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Everything in Creator, plus
          </p>
          <ul className="space-y-2.5">
            {GROWTH_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5">
                <CheckCircleIcon
                  size={20}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-[var(--color-accent)]"
                />
                <span className="text-base text-[var(--color-text-primary)]">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3">
          <span
            className={`text-base font-medium ${billingPeriod === 'monthly' ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}
          >
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={billingPeriod === 'yearly'}
            aria-label="Toggle annual billing"
            onClick={() => setBillingPeriod((prev) => (prev === 'monthly' ? 'yearly' : 'monthly'))}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
              billingPeriod === 'yearly'
                ? 'bg-[var(--color-accent)]'
                : 'bg-[var(--color-border-default)]'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                billingPeriod === 'yearly' ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span
            className={`text-base font-medium ${billingPeriod === 'yearly' ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}
          >
            Yearly
          </span>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border-default)] px-5 py-2.5 text-base font-medium transition-colors hover:bg-[var(--color-bg-card)]"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleUpgrade}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            <RocketIcon size={18} weight="fill" />
            Upgrade Now
          </button>
        </div>
      </div>
    </Modal>
  )
}
