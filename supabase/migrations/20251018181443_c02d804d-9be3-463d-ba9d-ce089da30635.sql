-- Add webinar_table column to store the AI-generated table
ALTER TABLE public.webinar_distributions
ADD COLUMN webinar_table TEXT;