export type Chain = 'ethereum' | 'polygon' | 'solana';

export interface ScreeningParams {
  userId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  amountUsd: number;
  token: string;
  chain: Chain;
  correlationId: string;
}

export interface ScreeningResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  approved: boolean;
  requiresManualReview: boolean;
  factors: RiskFactor[];
  travelRuleRequired: boolean;
}

export interface RiskFactor {
  type: string;
  description: string;
  weight: number;
}

export interface WalletRiskResult {
  address: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  isBlacklisted: boolean;
  factors: RiskFactor[];
}

export interface TravelRuleData {
  originator: { name: string; accountId: string; institution?: string };
  beneficiary: { name: string; accountId: string; institution?: string };
  amount: string;
  currency: string;
  timestamp: string;
}
