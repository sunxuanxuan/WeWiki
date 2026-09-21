-- Add personal access tokens for WeWiki REST API.
CREATE TABLE "api_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens"("token_hash");
CREATE INDEX "api_tokens_user_id_idx" ON "api_tokens"("user_id");
CREATE INDEX "api_tokens_token_prefix_idx" ON "api_tokens"("token_prefix");

ALTER TABLE "api_tokens"
ADD CONSTRAINT "api_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
