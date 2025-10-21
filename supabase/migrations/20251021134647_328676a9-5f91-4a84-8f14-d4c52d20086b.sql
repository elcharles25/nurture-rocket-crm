-- Add reply tracking columns to campaigns table
ALTER TABLE public.campaigns
ADD COLUMN has_replied boolean DEFAULT false,
ADD COLUMN last_reply_date timestamp with time zone;