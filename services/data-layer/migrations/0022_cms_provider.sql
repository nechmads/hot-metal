-- Per-publication CMS provider selection (EmDash fleet, Phase 1).
-- Each publication can live on a different CMS. Legacy publications stay on
-- the shared SonicJS instance (the default); new publications can point at a
-- dedicated EmDash instance with its own endpoint + token.
ALTER TABLE publications ADD COLUMN cms_provider TEXT NOT NULL DEFAULT 'sonicjs';
-- Values: 'sonicjs' (shared CMS via CMS_URL/CMS_API_KEY) | 'emdash' (dedicated instance)

ALTER TABLE publications ADD COLUMN cms_base_url TEXT DEFAULT NULL;
-- The tenant EmDash endpoint (e.g. https://my-pub.example.com). NULL for sonicjs.

ALTER TABLE publications ADD COLUMN cms_token TEXT DEFAULT NULL;
-- The EmDash ec_pat_ token, AES-GCM encrypted (same scheme as social_connections
-- OAuth tokens — "ivHex:ciphertextHex"). NULL for sonicjs.

ALTER TABLE publications ADD COLUMN cms_provisioning_status TEXT DEFAULT NULL;
-- Lifecycle of the dedicated instance: 'none' | 'provisioning' | 'ready' | 'failed'.
-- NULL for sonicjs (no provisioning needed).

ALTER TABLE publications ADD COLUMN cms_instance_meta TEXT DEFAULT NULL;
-- JSON describing the provisioned instance (d1 id, r2 bucket, script name,
-- hostname) for lifecycle/teardown. NULL until an instance is provisioned.
