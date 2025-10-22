-- Eliminar la constraint única de 'name' si existe
ALTER TABLE campaign_templates 
DROP CONSTRAINT IF EXISTS campaign_templates_name_key;

-- Crear una nueva constraint única para la combinación de gartner_role + name
ALTER TABLE campaign_templates 
ADD CONSTRAINT campaign_templates_gartner_role_name_unique 
UNIQUE (gartner_role, name);