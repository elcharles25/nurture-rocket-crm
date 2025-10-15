import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignList } from "@/components/campaigns/CampaignList";
import { TemplateEditor } from "@/components/campaigns/TemplateEditor";

const Campaigns = () => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-foreground mb-6">Gestión de Campañas</h1>

        <Tabs defaultValue="campaigns" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="campaigns">Campañas Activas</TabsTrigger>
            <TabsTrigger value="templates">Plantillas</TabsTrigger>
          </TabsList>
          <TabsContent value="campaigns">
            <CampaignList />
          </TabsContent>
          <TabsContent value="templates">
            <TemplateEditor />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Campaigns;
