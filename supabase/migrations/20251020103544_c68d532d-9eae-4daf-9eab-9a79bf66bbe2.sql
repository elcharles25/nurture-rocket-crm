-- Add webinar_role column to contacts table
ALTER TABLE public.contacts
ADD COLUMN webinar_role text;