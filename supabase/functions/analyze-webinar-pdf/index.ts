import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { distributionId, base64Pdf } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Analyzing PDF with AI for distribution:', distributionId);

    console.log('Analyzing PDF with AI...');

    const prompt = `En base al siguiente documento adjunto, donde aparecen un listado de webinars, créame una tabla en formato separado por | donde aparezca para los roles, CIO, CISO, CDAO, Talent, Workplace, Procurement, Enterprise Architect y CAIO, los 2 webinars más interesantes para ellos en base a las prioridades más relevantes identificadas por Gartner para cada uno de los roles. La tabla debe tener la siguiente configuración: Rol | Webinar | fecha | Hora | Analista. La tabla no debe contener webinars cuyo idioma no sea inglés. La tabla debe incluir en la cabecera Rol | Webinar | fecha | Hora | Analista y en las filas únicamente el contenido.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64Pdf}`
                }
              }
            ]
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices[0]?.message?.content;
    
    console.log('AI Response:', content);

    // Store the generated table in the distribution
    const { error: updateError } = await supabase
      .from('webinar_distributions')
      .update({ 
        webinar_table: content 
      })
      .eq('id', distributionId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw updateError;
    }

    console.log('Successfully saved webinar table for distribution:', distributionId);

    return new Response(
      JSON.stringify({ success: true, table: content }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});