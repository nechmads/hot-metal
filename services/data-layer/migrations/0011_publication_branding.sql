-- Publication branding/template fields for the publications frontend
ALTER TABLE publications ADD COLUMN template_id TEXT DEFAULT 'starter';
ALTER TABLE publications ADD COLUMN tagline TEXT;
ALTER TABLE publications ADD COLUMN logo_url TEXT;
ALTER TABLE publications ADD COLUMN header_image_url TEXT;
ALTER TABLE publications ADD COLUMN accent_color TEXT;
ALTER TABLE publications ADD COLUMN social_links TEXT;        -- JSON: { twitter?, linkedin?, github?, website? }
ALTER TABLE publications ADD COLUMN custom_domain TEXT;       -- Future use, nullable
ALTER TABLE publications ADD COLUMN meta_description TEXT;    -- Default SEO description for the publication
