-- Add user_id to oauth_state so callbacks know which user initiated the OAuth flow
ALTER TABLE oauth_state ADD COLUMN user_id TEXT;
