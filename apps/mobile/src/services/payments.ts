import { api } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WalletBalance {
  balance: number;
  pendingBalance: number;
  currency: string;
}

export interface LedgerEntry {
  id: string;
  walletId: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string;
  correlationId: string | null;
  createdAt: string;
}

export interface TransactionHistory {
  entries: LedgerEntry[];
  total: number;
}

export interface PaymentResult {
  paymentIntentId: string;
  clientSecret: string;
  status: string;
  amount: number;
  currency: string;
}

export interface SubscriptionInfo {
  id: string;
  userId: string;
  plan: string;
  status: string;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: string | null;
  canceledAt: string | null;
  features: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectAccountStatus {
  status: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export function getWalletBalance(): Promise<WalletBalance> {
  return api<WalletBalance>('/payments/wallet');
}

export function getTransactionHistory(
  limit = 50,
  offset = 0,
): Promise<TransactionHistory> {
  return api<TransactionHistory>(
    `/payments/history?limit=${limit}&offset=${offset}`,
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export function createPaymentIntent(params: {
  profileId: string;
  amount: number;
  description?: string;
  idempotencyKey: string;
}): Promise<PaymentResult> {
  return api<PaymentResult>('/payments/create-payment', {
    method: 'POST',
    body: params,
  });
}

export function confirmPayment(
  paymentIntentId: string,
): Promise<{ status: string }> {
  return api<{ status: string }>('/payments/confirm', {
    method: 'POST',
    body: { paymentIntentId },
  });
}

// ---------------------------------------------------------------------------
// Stripe Connect (for professionals)
// ---------------------------------------------------------------------------

export function getConnectAccountStatus(): Promise<ConnectAccountStatus> {
  return api<ConnectAccountStatus>('/payments/account-status');
}

export function createConnectAccount(): Promise<{
  accountId: string;
  stripeAccountId: string;
  status: string;
  onboardingUrl: string;
}> {
  return api('/payments/create-account', { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export function getCurrentSubscription(): Promise<SubscriptionInfo | null> {
  return api<SubscriptionInfo | null>('/subscriptions/current');
}

export function upgradeSubscription(
  planId: string,
): Promise<SubscriptionInfo> {
  return api<SubscriptionInfo>('/subscriptions/upgrade', {
    method: 'POST',
    body: { planId },
  });
}

export function cancelSubscription(): Promise<SubscriptionInfo> {
  return api<SubscriptionInfo>('/subscriptions/cancel', {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function generateIdempotencyKey(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `mobile_${timestamp}_${random}`;
}

export function formatCurrency(
  amountInCents: number,
  currency = 'BRL',
): string {
  const value = amountInCents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value);
}
