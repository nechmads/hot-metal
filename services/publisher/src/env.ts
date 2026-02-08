export interface PublisherEnv {
  PUBLISHER_DB: D1Database
  CMS_URL: string
  CMS_API_KEY: string
  BLOG_BASE_URL: string
  LINKEDIN_CLIENT_ID: string
  LINKEDIN_CLIENT_SECRET: string
  LINKEDIN_REDIRECT_URI: string
  TOKEN_ENCRYPTION_KEY: string // hex-encoded 256-bit key for AES-GCM
}
