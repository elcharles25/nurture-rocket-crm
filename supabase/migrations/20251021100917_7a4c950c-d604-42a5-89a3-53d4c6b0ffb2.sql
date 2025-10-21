-- Add PA (Personal Assistant) columns to contacts table
ALTER TABLE public.contacts
ADD COLUMN pa_name text,
ADD COLUMN pa_email text,
ADD COLUMN pa_phone text;