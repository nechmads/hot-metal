-- Add metadata column to oauth_state for storing provider-specific data (e.g. PKCE code_verifier)
ALTER TABLE oauth_state ADD COLUMN metadata TEXT;
