import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

const Settings = () => {
  const [signature, setSignature] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data } = await supabase.from("settings").select("*").eq("key", "email_signature").maybeSingle();
    if (data) {
      const value = data.value as any;
      setSignature(value?.signature || "");
    }
  };

  const saveSignature = async () => {
    const { data: existing } = await supabase.from("settings").select("*").eq("key", "email_signature").single();

    if (existing) {
      await supabase
        .from("settings")
        .update({ value: { signature } })
        .eq("key", "email_signature");
    } else {
      await supabase.from("settings").insert({ key: "email_signature", value: { signature } });
    }

    toast({ title: "Éxito", description: "Firma guardada correctamente" });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-foreground">Configuración</h1>

        <Tabs defaultValue="signature">
          <TabsList>
            <TabsTrigger value="signature">Firma de Email</TabsTrigger>
            <TabsTrigger value="appearance">Apariencia</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>

          <TabsContent value="signature">
            <Card>
              <CardHeader>
                <CardTitle>Firma de Email</CardTitle>
                <CardDescription>
                  Esta firma se incluirá automáticamente en todos los emails de campañas y webinars
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="signature">Firma HTML</Label>
                  <Textarea
                    id="signature"
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    rows={10}
                    className="font-mono text-sm"
                    placeholder="<p>Saludos,<br>Carlos Andrés de Miguel<br>carlos.andresdemiguel@gartner.com</p>"
                  />
                </div>
                <Button onClick={saveSignature}>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Firma
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance">
            <Card>
              <CardHeader>
                <CardTitle>Apariencia</CardTitle>
                <CardDescription>Personaliza el aspecto de la aplicación</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Configuración de apariencia próximamente...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>Configuración General</CardTitle>
                <CardDescription>Ajustes básicos de la aplicación</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Configuración general próximamente...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
