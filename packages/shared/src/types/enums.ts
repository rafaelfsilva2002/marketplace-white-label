// ---------------------------------------------------------------------------
// All enums used across the project.
// Values match the pgEnum definitions in packages/database/src/schema/.
// ---------------------------------------------------------------------------

// ---- Users ----------------------------------------------------------------

export enum UserRole {
  Admin = 'admin',
  Moderator = 'moderator',
  Professional = 'professional',
  User = 'user',
}

// ---- Chat -----------------------------------------------------------------

export enum MessageType {
  Text = 'text',
  Image = 'image',
  System = 'system',
}

// ---- Reviews --------------------------------------------------------------

export enum Sentiment {
  Positive = 'positive',
  Neutral = 'neutral',
  Negative = 'negative',
}

// ---- Subscriptions --------------------------------------------------------

export enum SubscriptionStatus {
  Active = 'active',
  PastDue = 'past_due',
  Canceled = 'canceled',
  Trialing = 'trialing',
  Paused = 'paused',
  Unpaid = 'unpaid',
}

export enum SubscriptionPlan {
  Free = 'free',
  Basic = 'basic',
  Professional = 'professional',
  Premium = 'premium',
}

// ---- Payments / Stripe ----------------------------------------------------

export enum StripeAccountStatus {
  Pending = 'pending',
  Active = 'active',
  Restricted = 'restricted',
  Disabled = 'disabled',
}

export enum LedgerEntryType {
  Credit = 'credit',
  Debit = 'debit',
  Hold = 'hold',
  Release = 'release',
  Refund = 'refund',
  Fee = 'fee',
  Payout = 'payout',
}

// ---- Crypto ---------------------------------------------------------------

export enum Chain {
  Ethereum = 'ethereum',
  Polygon = 'polygon',
  Solana = 'solana',
}

export enum Token {
  USDT = 'USDT',
  USDC = 'USDC',
}

export enum CryptoTxStatus {
  Pending = 'pending',
  Confirming = 'confirming',
  Confirmed = 'confirmed',
  Failed = 'failed',
  Reverted = 'reverted',
}

export enum CryptoLedgerType {
  Credit = 'credit',
  Debit = 'debit',
}

// ---- AML ------------------------------------------------------------------

export enum AmlRiskLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

export enum AmlStatus {
  PendingAml = 'pending_aml',
  Approved = 'approved',
  Rejected = 'rejected',
  ManualReview = 'manual_review',
}

export enum SarStatus {
  Pending = 'pending',
  Reviewed = 'reviewed',
  Filed = 'filed',
  Dismissed = 'dismissed',
}

export enum ReviewQueueStatus {
  Pending = 'pending',
  InReview = 'in_review',
  Approved = 'approved',
  Rejected = 'rejected',
}

export enum ReviewPriority {
  Normal = 'normal',
  High = 'high',
  Urgent = 'urgent',
}

// ---- Moderation / Reports -------------------------------------------------

export enum ReportStatus {
  Pending = 'pending',
  Resolved = 'resolved',
  Dismissed = 'dismissed',
}

// ---- Outbox ---------------------------------------------------------------

export enum OutboxStatus {
  Pending = 'pending',
  Processing = 'processing',
  Dispatched = 'dispatched',
  Failed = 'failed',
}

// ---- Push Tokens ----------------------------------------------------------

export enum PushTokenPlatform {
  Ios = 'ios',
  Android = 'android',
  Web = 'web',
}

// ---- Notifications (application-level, not DB-backed yet) -----------------

export enum NotificationType {
  NewMessage = 'new_message',
  ReviewReceived = 'review_received',
  ProfileVerified = 'profile_verified',
  PaymentReceived = 'payment_received',
  PaymentSent = 'payment_sent',
  SubscriptionExpiring = 'subscription_expiring',
  SystemAlert = 'system_alert',
}
