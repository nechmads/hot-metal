-- Writing styles v2: structured tone guide fields + LLM-composed final prompt.
-- All new columns are nullable — Alexander analysis may not return every field.
-- JSON arrays stored as TEXT (serialized string[]).

ALTER TABLE writing_styles ADD COLUMN final_prompt TEXT;

-- Voice
ALTER TABLE writing_styles ADD COLUMN voice_person TEXT;
ALTER TABLE writing_styles ADD COLUMN voice_formality TEXT;
ALTER TABLE writing_styles ADD COLUMN voice_personality_traits TEXT;

-- Sentence patterns
ALTER TABLE writing_styles ADD COLUMN sentence_notable_patterns TEXT;

-- Structure
ALTER TABLE writing_styles ADD COLUMN structure_opening_style TEXT;
ALTER TABLE writing_styles ADD COLUMN structure_closing_style TEXT;
ALTER TABLE writing_styles ADD COLUMN structure_paragraph_length TEXT;
ALTER TABLE writing_styles ADD COLUMN structure_use_of_headings TEXT;
ALTER TABLE writing_styles ADD COLUMN structure_transition_style TEXT;

-- Vocabulary
ALTER TABLE writing_styles ADD COLUMN vocabulary_level TEXT;
ALTER TABLE writing_styles ADD COLUMN vocabulary_favorite_phrases TEXT;
ALTER TABLE writing_styles ADD COLUMN vocabulary_power_words TEXT;
ALTER TABLE writing_styles ADD COLUMN vocabulary_jargon_usage TEXT;

-- Content & rhetorical
ALTER TABLE writing_styles ADD COLUMN rhetorical_devices TEXT;
ALTER TABLE writing_styles ADD COLUMN content_use_of_examples TEXT;
ALTER TABLE writing_styles ADD COLUMN content_use_of_data TEXT;
ALTER TABLE writing_styles ADD COLUMN content_storytelling_approach TEXT;
ALTER TABLE writing_styles ADD COLUMN content_humor_style TEXT;

-- Actionable rules
ALTER TABLE writing_styles ADD COLUMN dos TEXT;
ALTER TABLE writing_styles ADD COLUMN donts TEXT;

-- Backfill: existing styles get final_prompt = system_prompt
UPDATE writing_styles SET final_prompt = system_prompt WHERE final_prompt IS NULL;
