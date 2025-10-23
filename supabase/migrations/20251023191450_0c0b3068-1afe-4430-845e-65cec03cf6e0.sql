-- Add email_incorrect column to campaigns table
ALTER TABLE campaigns 
ADD COLUMN email_incorrect BOOLEAN DEFAULT FALSE;