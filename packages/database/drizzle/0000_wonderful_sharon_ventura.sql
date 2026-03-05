-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "vector";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'moderator', 'professional', 'user');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'dispatched', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('credit', 'debit', 'hold', 'release', 'refund', 'fee', 'payout');--> statement-breakpoint
CREATE TYPE "public"."stripe_account_status" AS ENUM('pending', 'active', 'restricted', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('free', 'basic', 'professional', 'premium');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled', 'trialing', 'paused', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."embedding_source" AS ENUM('profile_bio', 'profile_services', 'review_comment', 'search_query');--> statement-breakpoint
CREATE TYPE "public"."fraud_score_risk" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('pending', 'approved', 'rejected', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."moderation_type" AS ENUM('photo', 'text', 'profile', 'review');--> statement-breakpoint
CREATE TYPE "public"."chain" AS ENUM('ethereum', 'polygon', 'solana');--> statement-breakpoint
CREATE TYPE "public"."crypto_ledger_type" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."crypto_tx_status" AS ENUM('pending', 'confirming', 'confirmed', 'failed', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."token" AS ENUM('USDT', 'USDC');--> statement-breakpoint
CREATE TYPE "public"."aml_risk_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."aml_status" AS ENUM('pending_aml', 'approved', 'rejected', 'manual_review');--> statement-breakpoint
CREATE TYPE "public"."review_priority" AS ENUM('normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."review_queue_status" AS ENUM('pending', 'in_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."sar_status" AS ENUM('pending', 'reviewed', 'filed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."workflow_step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('draft', 'running', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."agent_action_status" AS ENUM('pending', 'approved', 'rejected', 'executed');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('active', 'paused', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."agent_type" AS ENUM('moderator', 'assistant', 'analyst', 'pricing');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('system', 'user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."push_token_platform" AS ENUM('ios', 'android', 'web');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'image', 'system');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"name" text,
	"phone" text,
	"document_number" text,
	"is_verified" boolean DEFAULT false,
	"verified_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_document_number_unique" UNIQUE("document_number")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family" uuid NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"description" text,
	"location" text,
	"city" text,
	"state" text,
	"country" text,
	"address" text,
	"services" text[] DEFAULT '{}' NOT NULL,
	"price_range" jsonb,
	"photos" text[] DEFAULT '{}' NOT NULL,
	"embedding" vector(1536),
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"search_score" real DEFAULT 0 NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"sentiment" "sentiment",
	"sentiment_score" real,
	"is_visible" text DEFAULT 'true' NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correlation_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"metadata" jsonb,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"viewer_id" uuid,
	"session_id" text,
	"duration" integer,
	"source" text,
	"referrer" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"type" "ledger_entry_type" NOT NULL,
	"amount" integer NOT NULL,
	"balance_before" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"description" text,
	"reference_type" text,
	"reference_id" uuid,
	"idempotency_key" text NOT NULL,
	"correlation_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "stripe_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_account_id" text NOT NULL,
	"status" "stripe_account_status" DEFAULT 'pending' NOT NULL,
	"charges_enabled" text DEFAULT 'false' NOT NULL,
	"payouts_enabled" text DEFAULT 'false' NOT NULL,
	"details_submitted" text DEFAULT 'false' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "stripe_accounts_stripe_account_id_unique" UNIQUE("stripe_account_id")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"pending_balance" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"plan" "subscription_plan" DEFAULT 'free' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" text DEFAULT 'false' NOT NULL,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"canceled_at" timestamp,
	"features" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "embedding_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" "embedding_source" NOT NULL,
	"source_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536),
	"model" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"token_count" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid,
	"risk_level" "fraud_score_risk" DEFAULT 'low' NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"signals" jsonb NOT NULL,
	"model" text NOT NULL,
	"model_version" text NOT NULL,
	"evaluated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "moderation_type" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "moderation_status" DEFAULT 'pending' NOT NULL,
	"auto_score" real,
	"auto_reason" text,
	"auto_labels" jsonb,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"review_note" text,
	"content_snapshot" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"chain" "chain" NOT NULL,
	"balance" text DEFAULT '0' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_balances_user_token_chain_unique" UNIQUE("user_id","token","chain")
);
--> statement-breakpoint
CREATE TABLE "crypto_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"chain" "chain" NOT NULL,
	"type" "crypto_ledger_type" NOT NULL,
	"amount" text NOT NULL,
	"balance_before" text NOT NULL,
	"balance_after" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"correlation_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_ledger_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "crypto_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"tx_hash" text,
	"chain" "chain" NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"amount" text NOT NULL,
	"token" text NOT NULL,
	"token_decimals" integer DEFAULT 6 NOT NULL,
	"amount_brl" text,
	"status" "crypto_tx_status" DEFAULT 'pending' NOT NULL,
	"block_number" integer,
	"gas_used" text,
	"gas_fee" text,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"required_confirmations" integer DEFAULT 12 NOT NULL,
	"dfns_transfer_id" text,
	"risk_level" text,
	"aml_screening_id" uuid,
	"aml_status" text DEFAULT 'pending_aml' NOT NULL,
	"idempotency_key" text NOT NULL,
	"correlation_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "crypto_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chain" "chain" NOT NULL,
	"address" text NOT NULL,
	"dfns_wallet_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_wallets_dfns_wallet_id_unique" UNIQUE("dfns_wallet_id"),
	CONSTRAINT "crypto_wallets_user_chain_unique" UNIQUE("user_id","chain")
);
--> statement-breakpoint
CREATE TABLE "aml_blacklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"chain" text,
	"reason" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"added_by" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blacklists_address_chain_unique" UNIQUE("address","chain")
);
--> statement-breakpoint
CREATE TABLE "aml_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"chain" text NOT NULL,
	"tx_count" integer DEFAULT 0 NOT NULL,
	"total_amount_usd" real DEFAULT 0 NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL,
	"window_hours" integer DEFAULT 24 NOT NULL,
	CONSTRAINT "rate_limits_wallet_chain_unique" UNIQUE("wallet_address","chain")
);
--> statement-breakpoint
CREATE TABLE "aml_review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"screening_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"transaction_id" uuid,
	"reason" text NOT NULL,
	"priority" "review_priority" DEFAULT 'normal' NOT NULL,
	"status" "review_queue_status" DEFAULT 'pending' NOT NULL,
	"assigned_to" uuid,
	"notes" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aml_screenings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid,
	"user_id" uuid NOT NULL,
	"risk_level" "aml_risk_level" NOT NULL,
	"score" real NOT NULL,
	"approved" boolean NOT NULL,
	"requires_manual_review" boolean DEFAULT false NOT NULL,
	"factors" jsonb NOT NULL,
	"provider" text DEFAULT 'internal' NOT NULL,
	"travel_rule_data" jsonb,
	"correlation_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suspicious_activity_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"screening_id" uuid,
	"user_id" uuid NOT NULL,
	"transaction_id" uuid,
	"report_type" text NOT NULL,
	"severity" text NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb NOT NULL,
	"status" "sar_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"filed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"step_name" text NOT NULL,
	"status" "workflow_step_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "workflow_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"correlation_id" uuid NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"user_id" uuid,
	"correlation_id" uuid,
	"metrics" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "experiment_status" DEFAULT 'draft' NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"conversation_id" uuid,
	"action_type" text NOT NULL,
	"params" jsonb NOT NULL,
	"result" jsonb,
	"status" "agent_action_status" DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"rejection_reason" text,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"tool_results" jsonb,
	"tokens" integer,
	"cost_usd" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "agent_type" NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"description" text,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name"),
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "profile_categories" (
	"profile_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "profile_categories_profile_id_category_id_pk" PRIMARY KEY("profile_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(200) NOT NULL,
	"platform" "push_token_platform" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_one_id" uuid NOT NULL,
	"participant_two_id" uuid NOT NULL,
	"last_message_at" timestamp,
	"last_message_preview" varchar(200),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_participants_unique" UNIQUE("participant_one_id","participant_two_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
	"type" "message_type" DEFAULT 'text' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_accounts" ADD CONSTRAINT "stripe_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_scores" ADD CONSTRAINT "fraud_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_scores" ADD CONSTRAINT "fraud_scores_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_queue" ADD CONSTRAINT "moderation_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_queue" ADD CONSTRAINT "moderation_queue_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_balances" ADD CONSTRAINT "crypto_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_ledger" ADD CONSTRAINT "crypto_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_transactions" ADD CONSTRAINT "crypto_transactions_wallet_id_crypto_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."crypto_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_wallets" ADD CONSTRAINT "crypto_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_blacklists" ADD CONSTRAINT "aml_blacklists_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_review_queue" ADD CONSTRAINT "aml_review_queue_screening_id_aml_screenings_id_fk" FOREIGN KEY ("screening_id") REFERENCES "public"."aml_screenings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_review_queue" ADD CONSTRAINT "aml_review_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_review_queue" ADD CONSTRAINT "aml_review_queue_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_screenings" ADD CONSTRAINT "aml_screenings_transaction_id_crypto_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."crypto_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_screenings" ADD CONSTRAINT "aml_screenings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspicious_activity_reports" ADD CONSTRAINT "suspicious_activity_reports_screening_id_aml_screenings_id_fk" FOREIGN KEY ("screening_id") REFERENCES "public"."aml_screenings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspicious_activity_reports" ADD CONSTRAINT "suspicious_activity_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspicious_activity_reports" ADD CONSTRAINT "suspicious_activity_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_categories" ADD CONSTRAINT "profile_categories_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_categories" ADD CONSTRAINT "profile_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_one_id_users_id_fk" FOREIGN KEY ("participant_one_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_two_id_users_id_fk" FOREIGN KEY ("participant_two_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_user_id_idx" ON "profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profiles_city_state_idx" ON "profiles" USING btree ("city","state");--> statement-breakpoint
CREATE INDEX "profiles_is_active_idx" ON "profiles" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "profiles_search_score_idx" ON "profiles" USING btree ("search_score");--> statement-breakpoint
CREATE INDEX "profiles_created_at_idx" ON "profiles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reviews_profile_id_idx" ON "reviews" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "reviews_reviewer_id_idx" ON "reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "reviews_rating_idx" ON "reviews" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "reviews_sentiment_idx" ON "reviews" USING btree ("sentiment");--> statement-breakpoint
CREATE INDEX "reviews_created_at_idx" ON "reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_correlation_id_idx" ON "audit_logs" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_status_idx" ON "outbox_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outbox_events_event_type_idx" ON "outbox_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "outbox_events_correlation_id_idx" ON "outbox_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "outbox_events_created_at_idx" ON "outbox_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "profile_views_profile_id_idx" ON "profile_views" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "profile_views_viewer_id_idx" ON "profile_views" USING btree ("viewer_id");--> statement-breakpoint
CREATE INDEX "profile_views_session_id_idx" ON "profile_views" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "profile_views_source_idx" ON "profile_views" USING btree ("source");--> statement-breakpoint
CREATE INDEX "profile_views_created_at_idx" ON "profile_views" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "profile_views_profile_id_created_at_idx" ON "profile_views" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_wallet_id_idx" ON "ledger_entries" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_type_idx" ON "ledger_entries" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ledger_entries_reference_idx" ON "ledger_entries" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_correlation_id_idx" ON "ledger_entries" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_created_at_idx" ON "ledger_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stripe_accounts_user_id_idx" ON "stripe_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stripe_accounts_stripe_account_id_idx" ON "stripe_accounts" USING btree ("stripe_account_id");--> statement-breakpoint
CREATE INDEX "stripe_accounts_status_idx" ON "stripe_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wallets_user_id_idx" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallets_currency_idx" ON "wallets" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_subscription_id_idx" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX "embedding_cache_source_type_source_id_idx" ON "embedding_cache" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "embedding_cache_content_hash_idx" ON "embedding_cache" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "embedding_cache_model_idx" ON "embedding_cache" USING btree ("model");--> statement-breakpoint
CREATE INDEX "fraud_scores_user_id_idx" ON "fraud_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fraud_scores_profile_id_idx" ON "fraud_scores" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "fraud_scores_risk_level_idx" ON "fraud_scores" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "fraud_scores_score_idx" ON "fraud_scores" USING btree ("score");--> statement-breakpoint
CREATE INDEX "fraud_scores_evaluated_at_idx" ON "fraud_scores" USING btree ("evaluated_at");--> statement-breakpoint
CREATE INDEX "fraud_scores_expires_at_idx" ON "fraud_scores" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "moderation_queue_status_idx" ON "moderation_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "moderation_queue_type_idx" ON "moderation_queue" USING btree ("type");--> statement-breakpoint
CREATE INDEX "moderation_queue_user_id_idx" ON "moderation_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "moderation_queue_entity_type_entity_id_idx" ON "moderation_queue" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "moderation_queue_reviewed_by_idx" ON "moderation_queue" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX "moderation_queue_created_at_idx" ON "moderation_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "moderation_queue_status_created_at_idx" ON "moderation_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "crypto_balances_user_id_idx" ON "crypto_balances" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crypto_ledger_user_id_idx" ON "crypto_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crypto_ledger_reference_idx" ON "crypto_ledger" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "crypto_ledger_correlation_id_idx" ON "crypto_ledger" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "crypto_ledger_created_at_idx" ON "crypto_ledger" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crypto_transactions_wallet_id_idx" ON "crypto_transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "crypto_transactions_tx_hash_idx" ON "crypto_transactions" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX "crypto_transactions_chain_idx" ON "crypto_transactions" USING btree ("chain");--> statement-breakpoint
CREATE INDEX "crypto_transactions_status_idx" ON "crypto_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crypto_transactions_from_address_idx" ON "crypto_transactions" USING btree ("from_address");--> statement-breakpoint
CREATE INDEX "crypto_transactions_to_address_idx" ON "crypto_transactions" USING btree ("to_address");--> statement-breakpoint
CREATE INDEX "crypto_transactions_created_at_idx" ON "crypto_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crypto_wallets_user_id_idx" ON "crypto_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crypto_wallets_chain_idx" ON "crypto_wallets" USING btree ("chain");--> statement-breakpoint
CREATE INDEX "crypto_wallets_address_idx" ON "crypto_wallets" USING btree ("address");--> statement-breakpoint
CREATE INDEX "blacklists_address_idx" ON "aml_blacklists" USING btree ("address");--> statement-breakpoint
CREATE INDEX "review_queue_status_idx" ON "aml_review_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_queue_priority_idx" ON "aml_review_queue" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "review_queue_assigned_to_idx" ON "aml_review_queue" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "review_queue_created_at_idx" ON "aml_review_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "aml_screenings_user_id_idx" ON "aml_screenings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aml_screenings_transaction_id_idx" ON "aml_screenings" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "aml_screenings_risk_level_idx" ON "aml_screenings" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "aml_screenings_created_at_idx" ON "aml_screenings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sars_user_id_idx" ON "suspicious_activity_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sars_screening_id_idx" ON "suspicious_activity_reports" USING btree ("screening_id");--> statement-breakpoint
CREATE INDEX "sars_status_idx" ON "suspicious_activity_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sars_created_at_idx" ON "suspicious_activity_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_steps_workflow_id_idx" ON "workflow_steps" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_steps_status_idx" ON "workflow_steps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_steps_workflow_id_step_name_idx" ON "workflow_steps" USING btree ("workflow_id","step_name");--> statement-breakpoint
CREATE INDEX "workflows_name_idx" ON "workflows" USING btree ("name");--> statement-breakpoint
CREATE INDEX "workflows_status_idx" ON "workflows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflows_correlation_id_idx" ON "workflows" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "workflows_created_at_idx" ON "workflows" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflows_status_created_at_idx" ON "workflows" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "experiment_results_experiment_id_idx" ON "experiment_results" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "experiment_results_variant_id_idx" ON "experiment_results" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "experiment_results_user_id_idx" ON "experiment_results" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "experiment_results_correlation_id_idx" ON "experiment_results" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "experiment_results_created_at_idx" ON "experiment_results" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "experiment_results_experiment_variant_idx" ON "experiment_results" USING btree ("experiment_id","variant_id");--> statement-breakpoint
CREATE INDEX "experiment_variants_experiment_id_idx" ON "experiment_variants" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "experiments_name_idx" ON "experiments" USING btree ("name");--> statement-breakpoint
CREATE INDEX "experiments_status_idx" ON "experiments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "experiments_created_at_idx" ON "experiments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_actions_agent_id_idx" ON "agent_actions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_actions_conversation_id_idx" ON "agent_actions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_actions_status_idx" ON "agent_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_actions_action_type_idx" ON "agent_actions" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "agent_actions_approved_by_idx" ON "agent_actions" USING btree ("approved_by");--> statement-breakpoint
CREATE INDEX "agent_actions_created_at_idx" ON "agent_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_actions_status_created_at_idx" ON "agent_actions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "agent_conversations_agent_id_idx" ON "agent_conversations" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_conversations_user_id_idx" ON "agent_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_conversations_status_idx" ON "agent_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_conversations_agent_user_idx" ON "agent_conversations" USING btree ("agent_id","user_id");--> statement-breakpoint
CREATE INDEX "agent_conversations_created_at_idx" ON "agent_conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_messages_conversation_id_idx" ON "agent_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_messages_role_idx" ON "agent_messages" USING btree ("role");--> statement-breakpoint
CREATE INDEX "agent_messages_conversation_created_idx" ON "agent_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_agents_type_idx" ON "ai_agents" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ai_agents_status_idx" ON "ai_agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_agents_name_idx" ON "ai_agents" USING btree ("name");--> statement-breakpoint
CREATE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "categories_is_active_idx" ON "categories" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "categories_sort_order_idx" ON "categories" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "profile_categories_profile_id_idx" ON "profile_categories" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "profile_categories_category_id_idx" ON "profile_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_tokens_token_idx" ON "push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_tokens_active_idx" ON "push_tokens" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "conversations_participant_one_idx" ON "conversations" USING btree ("participant_one_id");--> statement-breakpoint
CREATE INDEX "conversations_participant_two_idx" ON "conversations" USING btree ("participant_two_id");--> statement-breakpoint
CREATE INDEX "conversations_last_message_at_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_unread_idx" ON "messages" USING btree ("conversation_id","is_read");