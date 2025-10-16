import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, Send, Trash2, Settings } from "lucide-react";
import { WebinarEmailEditor } from "@/components/webinars/WebinarEmailEditor";

interface WebinarDistribution {
  id: string;
  month: string;
  file_url: string;
  file_name: string;
  email_subject: string;
  email_html: string;
  sent: boolean;
  sent_at: string | null;
  created_at: string;
}

const Webinars = () => {
  const [distributions, setDistributions] = useState<WebinarDistribution[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { toast } = useToast();

  useEffect(() => {
    fetchDistributions();
  }, []);

  const fetchDistributions = async () => {
    const { data } = await supabase.from("webinar_distributions").select("*").order("created_at", { ascending: false });
    setDistributions(data || []);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({ title: "Error", description: "Solo se permiten archivos PDF", variant: "destructive" });
      return;
    }

    setUploading(true);

    // Get email template
    const { data: templateData } = await supabase.from("settings").select("*").eq("key", "webinar_email_template").maybeSingle();
    const template = (templateData?.value as any) || {
      subject: "Webinars disponibles este mes",
      html: "<h2>Hola {{nombre}},</h2><p>Aquí están los webinars disponibles para este mes.</p>",
    };

    const fileName = `${month}-${Date.now()}.pdf`;
    const { data, error } = await supabase.storage.from("webinars").upload(fileName, file);

    if (error) {
      toast({ title: "Error", description: "No se pudo subir el archivo", variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("webinars").getPublicUrl(fileName);

    const { error: insertError } = await supabase.from("webinar_distributions").insert([
      {
        month: month,
        file_url: urlData.publicUrl,
        file_name: file.name,
        email_subject: template.subject,
        email_html: template.html,
      },
    ]);

    if (insertError) {
      toast({ title: "Error", description: "No se pudo guardar la distribución", variant: "destructive" });
    } else {
      toast({ title: "Éxito", description: "Webinar cargado correctamente" });
      fetchDistributions();
    }

    setUploading(false);
  };

  const handleSendWebinars = async (distributionId: string) => {
    toast({ title: "Enviando", description: "Los webinars se enviarán pronto..." });
    // Aquí se llamaría a la edge function para enviar emails
  };

  const handleDelete = async (id: string, fileUrl: string) => {
    if (!confirm("¿Eliminar esta distribución?")) return;

    const fileName = fileUrl.split("/").pop();
    if (fileName) {
      await supabase.storage.from("webinars").remove([fileName]);
    }

    const { error } = await supabase.from("webinar_distributions").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    } else {
      toast({ title: "Éxito", description: "Distribución eliminada" });
      fetchDistributions();
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground">Gestión de Webinars</h1>
          <Button onClick={() => setShowEmailEditor(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Configurar Email
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cargar Nuevo Webinar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
              <div>
                <Input id="file" type="file" accept="application/pdf" onChange={handleFileUpload} disabled={uploading} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuciones de Webinars</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha Envío</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distributions.map((dist) => (
                  <TableRow key={dist.id}>
                    <TableCell>{dist.month}</TableCell>
                    <TableCell>
                      <a href={dist.file_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {dist.file_name}
                      </a>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs ${dist.sent ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                        {dist.sent ? "Enviado" : "Pendiente"}
                      </span>
                    </TableCell>
                    <TableCell>{dist.sent_at ? new Date(dist.sent_at).toLocaleDateString() : "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {!dist.sent && (
                          <Button size="sm" onClick={() => handleSendWebinars(dist.id)}>
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(dist.id, dist.file_url)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={showEmailEditor} onOpenChange={setShowEmailEditor}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Configurar Plantilla de Email</DialogTitle>
            </DialogHeader>
            <WebinarEmailEditor />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Webinars;
