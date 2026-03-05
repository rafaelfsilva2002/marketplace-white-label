// ---------------------------------------------------------------------------
// Domain interfaces shared between API, web, and mobile.
// Field names match the database schema exactly (camelCase from Drizzle).
// These are "read" types — what the API returns to clients.
// ---------------------------------------------------------------------------

import type {
  UserRole,
  MessageType,
  Sentiment,
  SubscriptionStatus,
  SubscriptionPlan,
  StripeAccountStatus,
  LedgerEntryType,
  CryptoTxStatus,
  Chain,
  Token,
  AmlRiskLevel,
  AmlStatus,
  ReportStatus,
  PushTokenPlatform,
} from './enums';

// ---- Users ----------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string | null;
  phone: string | null;
  documentNumber: string | null;
  isVerified: boolean | null;
  verifiedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ---- Profiles -------------------------------------------------------------

export interface PriceRange {
  min: number;
  max: number;
}

export interface Profile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  description: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  services: string[];
  priceRange: PriceRange | null;
  photos: string[];
  isVerified: boolean;
  isActive: boolean;
  viewsCount: number;
  searchScore: number;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Reviews --------------------------------------------------------------

export interface Review {
  id: string;
  profileId: string;
  reviewerId: string;
  rating: number;
  comment: string | null;
  sentiment: Sentiment | null;
  sentimentScore: number | null;
  isVisible: string;
  moderatedBy: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Chat / Conversations -------------------------------------------------

export interface Conversation {
  id: string;
  participantOneId: string;
  participantTwoId: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

// ---- Categories -----------------------------------------------------------

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileCategory {
  profileId: string;
  categoryId: string;
}

// ---- Payments / Wallets ---------------------------------------------------

export interface WalletBalance {
  id: string;
  userId: string;
  balance: number;
  pendingBalance: number;
  currency: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  walletId: string;
  type: LedgerEntryType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string;
  correlationId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface StripeAccount {
  id: string;
  userId: string;
  stripeAccountId: string;
  status: StripeAccountStatus;
  chargesEnabled: string;
  payoutsEnabled: string;
  detailsSubmitted: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Subscriptions --------------------------------------------------------

export interface Subscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: string;
  trialStart: string | null;
  trialEnd: string | null;
  canceledAt: string | null;
  features: Record<string, boolean>;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Crypto ---------------------------------------------------------------

export interface CryptoWallet {
  id: string;
  userId: string;
  chain: Chain;
  address: string;
  dfnsWalletId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CryptoTransaction {
  id: string;
  walletId: string;
  txHash: string | null;
  chain: Chain;
  fromAddress: string;
  toAddress: string;
  amount: string;
  token: string;
  tokenDecimals: number;
  amountBrl: string | null;
  status: CryptoTxStatus;
  blockNumber: number | null;
  gasUsed: string | null;
  gasFee: string | null;
  confirmations: number;
  requiredConfirmations: number;
  dfnsTransferId: string | null;
  riskLevel: string | null;
  amlScreeningId: string | null;
  amlStatus: string;
  idempotencyKey: string;
  correlationId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CryptoBalance {
  id: string;
  userId: string;
  token: string;
  chain: Chain;
  balance: string;
  version: number;
  updatedAt: string;
}

// ---- AML ------------------------------------------------------------------

export interface AmlScreening {
  id: string;
  transactionId: string | null;
  userId: string;
  riskLevel: AmlRiskLevel;
  score: number;
  approved: boolean;
  requiresManualReview: boolean;
  factors: Array<{ type: string; description: string; weight: number }>;
  provider: string;
  travelRuleData: Record<string, unknown> | null;
  correlationId: string | null;
  createdAt: string;
}

// ---- Reports (Moderation) -------------------------------------------------

export interface Report {
  id: string;
  reporterId: string;
  entityType: string;
  entityId: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Notifications --------------------------------------------------------
// No database table yet — this is a shared contract for push/in-app messages.

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

// ---- Push Tokens ----------------------------------------------------------

export interface PushToken {
  id: string;
  userId: string;
  token: string;
  platform: PushTokenPlatform;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- Audit ----------------------------------------------------------------

export interface AuditLog {
  id: string;
  correlationId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ---- Profile Views --------------------------------------------------------

export interface ProfileView {
  id: string;
  profileId: string;
  viewerId: string | null;
  sessionId: string | null;
  duration: number | null;
  source: string | null;
  referrer: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}
