import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campaignId, emailNumber } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    // Get campaign details
    const { data: campaign } = await supabase
      .from('campaigns')
      .select(`
        *,
        contacts!campaigns_contact_id_fkey (
          first_name,
          last_name,
          email
        ),
        campaign_templates!campaigns_template_id_fkey (*)
      `)
      .eq('id', campaignId)
      .single();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get email signature from settings
    const { data: signatureData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'email_signature')
      .maybeSingle();

    const signature = signatureData?.value?.signature || '';

    // Get the specific email content
    const subjectKey = `email_${emailNumber}_subject`;
    const htmlKey = `email_${emailNumber}_html`;
    
    const subject = campaign.campaign_templates[subjectKey];
    let html = campaign.campaign_templates[htmlKey];

    // Replace placeholders
    html = html.replace(/{{nombre}}/g, campaign.contacts.first_name);
    html = html.replace(/{{apellido}}/g, campaign.contacts.last_name);
    html = html.replace(/{{organizacion}}/g, campaign.contacts.organization || '');
    
    // Add signature
    if (signature) {
      html += `<br/><br/>${signature}`;
    }

    // Prepare attachments if any
    const attachments = campaign.campaign_templates.attachments || [];

    console.log('Sending email to:', campaign.contacts.email);

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: "Lovable <onboarding@resend.dev>", // TODO: Configure from address in settings
      to: [campaign.contacts.email],
      subject: subject,
      html: html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    console.log('Email sent:', emailResponse);

    // Update campaign with sent date
    const dateKey = `email_${emailNumber}_date`;
    const updateData = {
      [dateKey]: new Date().toISOString(),
      emails_sent: (campaign.emails_sent || 0) + 1,
    };

    await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', campaignId);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error sending email:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});