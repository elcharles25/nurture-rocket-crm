import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, Send, Trash2, Settings, FileText } from "lucide-react";
import { WebinarEmailEditor } from "@/components/webinars/WebinarEmailEditor";
import { useOutlookDraftBatch } from "@/hooks/useOutlookDraft";

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

interface Contact {
  email: string;
  nombre?: string;
}

const Webinars = () => {
  const [distributions, setDistributions] = useState<WebinarDistribution[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [creatingDrafts, setCreatingDrafts] = useState(false);
  const { toast } = useToast();
  const { mutate: createDraftsBatch, isPending: isCreatingDrafts } = useOutlookDraftBatch();

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

    try {
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

      const { data: insertData, error: insertError } = await supabase
        .from("webinar_distributions")
        .insert([
          {
            month: month,
            file_url: urlData.publicUrl,
            file_name: file.name,
            email_subject: template.subject,
            email_html: template.html,
          },
        ])
        .select()
        .single();

      if (insertError) {
        toast({ title: "Error", description: "No se pudo guardar la distribución", variant: "destructive" });
        setUploading(false);
        return;
      }

      toast({ title: "Éxito", description: "Webinar cargado, analizando con AI..." });

      // Analyze PDF with AI
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke("analyze-webinar-pdf", {
        body: {
          distributionId: insertData.id,
          fileUrl: urlData.publicUrl,
        },
      });

      if (analysisError) {
        console.error("Error analyzing PDF:", analysisError);
        toast({ title: "Advertencia", description: "El archivo se cargó pero no se pudo analizar con AI", variant: "destructive" });
      } else {
        toast({ title: "Éxito", description: `Webinar analizado. ${analysisData.recommendations?.length || 0} recomendaciones generadas.` });
      }

      fetchDistributions();
    } catch (error) {
      console.error("Error uploading webinar:", error);
      toast({ title: "Error", description: "Ocurrió un error al cargar el webinar", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleCreateDrafts = async (distributionId: string) => {
    setCreatingDrafts(true);

    try {
      // Obtener todos los contactos suscritos a webinars
      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("id, email, first_name")
        .eq("subscribed_webinars", true);

      if (contactsError || !contacts || contacts.length === 0) {
        toast({
          title: "Advertencia",
          description: "No hay contactos suscritos a webinars",
          variant: "destructive",
        });
        setCreatingDrafts(false);
        return;
      }

      // Obtener los detalles de la distribución
      const distribution = distributions.find(d => d.id === distributionId);
      if (!distribution) {
        toast({
          title: "Error",
          description: "No se encontró la distribución",
          variant: "destructive",
        });
        setCreatingDrafts(false);
        return;
      }

      // Preparar emails para crear borradores
      const emailsToCreate = contacts.map(contact => ({
        to: contact.email,
        subject: distribution.email_subject,
        body: distribution.email_html.replace("{{nombre}}", contact.first_name || ""),
      }));

      // Crear borradores en lote
      createDraftsBatch(
        { emails: emailsToCreate },
        {
          onSettled: () => setCreatingDrafts(false),
        }
      );
    } catch (error) {
      console.error("Error creating drafts:", error);
      toast({
        title: "Error",
        description: "Ocurrió un error al crear los borradores",
        variant: "destructive",
      });
      setCreatingDrafts(false);
    }
  };

  const handleSendWebinars = async (distributionId: string) => {
    if (!confirm("¿Enviar webinars a todos los contactos suscritos?")) return;

    toast({ title: "Enviando", description: "Enviando webinars a los contactos..." });

    try {
      const { data, error } = await supabase.functions.invoke("send-webinar-emails", {
        body: { distributionId },
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        toast({
          title: "Éxito",
          description: `Se enviaron ${data.emailsSent} emails correctamente`,
        });
        fetchDistributions();
      } else {
        toast({
          title: "Advertencia",
          description: data?.message || "No hay contactos suscritos a webinars",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error sending webinars:", error);
      toast({
        title: "Error",
        description: "No se pudieron enviar los webinars",
        variant: "destructive",
      });
    }
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
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCreateDrafts(dist.id)}
                              disabled={creatingDrafts || isCreatingDrafts}
                              title="Crear borradores en Outlook"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            <Button size="sm" onClick={() => handleSendWebinars(dist.id)}>
                              <Send className="h-4 w-4" />
                            </Button>
                          </>
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
