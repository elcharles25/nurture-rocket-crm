-- Add attachment columns for each email in campaign_templates
ALTER TABLE public.campaign_templates
ADD COLUMN email_1_attachments jsonb DEFAULT '[]'::jsonb,
ADD COLUMN email_2_attachments jsonb DEFAULT '[]'::jsonb,
ADD COLUMN email_3_attachments jsonb DEFAULT '[]'::jsonb,
ADD COLUMN email_4_attachments jsonb DEFAULT '[]'::jsonb,
ADD COLUMN email_5_attachments jsonb DEFAULT '[]'::jsonb;