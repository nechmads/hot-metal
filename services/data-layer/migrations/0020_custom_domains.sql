-- Track custom domain lifecycle per publication
ALTER TABLE publications ADD COLUMN domain_status TEXT DEFAULT NULL;
-- Values: 'pending_dns' | 'pending_ssl' | 'active' | 'failed' | NULL (no custom domain)

ALTER TABLE publications ADD COLUMN cf_hostname_id TEXT DEFAULT NULL;
-- Cloudflare Custom Hostname ID (for API calls: status checks, deletion)

ALTER TABLE publications ADD COLUMN domain_verification_txt TEXT DEFAULT NULL;
-- TXT record value for hostname pre-validation

-- Ensure no two publications claim the same domain
CREATE UNIQUE INDEX idx_publications_custom_domain
  ON publications(custom_domain) WHERE custom_domain IS NOT NULL;
