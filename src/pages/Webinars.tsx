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

const Webinars = () => {
  const [distributions, setDistributions] = useState<WebinarDistribution[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [creatingDrafts, setCreatingDrafts] = useState(false);
  const [availablePdfs, setAvailablePdfs] = useState<string[]>([]);
  const [selectedPdf, setSelectedPdf] = useState("");
  const { toast } = useToast();
  const { mutate: createDraftsBatch, isPending: isCreatingDrafts } = useOutlookDraftBatch();

  useEffect(() => {
    fetchDistributions();
    fetchAvailablePdfs();
  }, []);

  const fetchDistributions = async () => {
    const { data } = await supabase.from("webinar_distributions").select("*").order("created_at", { ascending: false });
    setDistributions(data || []);
  };

  const fetchAvailablePdfs = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/webinars/list-pdfs');
      if (!response.ok) throw new Error('Error obteniendo PDFs');
      const data = await response.json();
      setAvailablePdfs(data.pdfs || []);
    } catch (error) {
      console.error('Error fetching PDFs:', error);
      toast({ 
        title: "Advertencia", 
        description: "No se pudo obtener la lista de PDFs disponibles",
        variant: "destructive" 
      });
    }
  };

  const handleSaveDistribution = async () => {
    if (!selectedPdf) {
      toast({ 
        title: "Error", 
        description: "Por favor selecciona un archivo PDF",
        variant: "destructive" 
      });
      return;
    }

    setUploading(true);

    try {
      const { data: templateData } = await supabase.from("settings").select("*").eq("key", "webinar_email_template").maybeSingle();
      const template = (templateData?.value as any) || {
        subject: "Webinars disponibles este mes",
        html: "<h2>Hola {{nombre}},</h2><p>Aquí están los webinars disponibles para este mes.</p>",
      };

      const fileName = selectedPdf.split('\\').pop() || selectedPdf;
      const pdfPath = `Webinars/${selectedPdf}`;

      const { data: insertData, error: insertError } = await supabase
        .from("webinar_distributions")
        .insert([
          {
            month: month,
            file_url: pdfPath,
            file_name: fileName,
            email_subject: template.subject,
            email_html: template.html,
          },
        ])
        .select()
        .single();

      if (insertError) {
        toast({ title: "Error", description: `No se pudo guardar: ${insertError.message}`, variant: "destructive" });
        setUploading(false);
        return;
      }

      toast({ title: "Éxito", description: `Distribución guardada: ${fileName}` });
      setSelectedPdf("");
      fetchDistributions();
    } catch (error) {
      toast({ title: "Error", description: `Error: ${error instanceof Error ? error.message : 'Desconocido'}`, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleCreateDrafts = async (distributionId: string) => {
    setCreatingDrafts(true);

    try {
      toast({ title: "Preparando", description: "Obteniendo contactos y configuración..." });

      let signature = "";
      try {
        const { data } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "email_signature")
          .single();
        
        if (data && data.value) {
          const value = data.value as any;
          let sig = value?.signature || "";
          sig = sig.trim();
          if (sig.startsWith('"') && sig.endsWith('"')) {
            sig = sig.slice(1, -1);
          }
          sig = sig.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\//g, '/');
          signature = sig;
        }
      } catch (e) {
        console.log('No signature configured');
      }

      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("id, email, first_name")
        .eq("webinars_subscribed", true);

      if (contactsError || !contacts || contacts.length === 0) {
        toast({
          title: "Advertencia",
          description: "No hay contactos suscritos a webinars",
          variant: "destructive",
        });
        setCreatingDrafts(false);
        return;
      }

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

      if (!distribution.file_url) {
        toast({
          title: "Error",
          description: "No hay archivo PDF asociado a esta distribución",
          variant: "destructive",
        });
        setCreatingDrafts(false);
        return;
      }

      const [ano, mes] = distribution.month.split('-');
      const mesesEnEspanol = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const mesNombre = mesesEnEspanol[parseInt(mes) - 1];

      const emailsToCreate = contacts.map(contact => {
        let body = distribution.email_html
          .replace(/{{Nombre}}/g, contact.first_name || "")
          .replace(/{{nombre}}/g, contact.first_name || "");

        if (signature) {
          body = body + signature;
        }

        let subject = distribution.email_subject
          .replace(/{{mes}}/g, mesNombre)
          .replace(/{{anio}}/g, ano);

        return {
          to: contact.email,
          subject: subject,
          body: body,
          pdfPath: distribution.file_url,
          fileName: distribution.file_name
        };
      });

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
        description: `Error: ${error instanceof Error ? error.message : 'Desconocido'}`,
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
          variant: "destructive" 
        });
      }
    } catch (error) {
      console.error("Error sending webinars:", error);
      toast({ 
        title: "Error", 
        description: "No se pudieron enviar los webinars",
        variant: "destructive" 
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
                <label className="text-sm font-medium">Mes</label>
                <Input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Seleccionar PDF</label>
                <select
                  value={selectedPdf}
                  onChange={(e) => setSelectedPdf(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="">-- Selecciona un PDF --</option>
                  {availablePdfs.map((pdf) => (
                    <option key={pdf} value={pdf}>
                      {pdf.split('\\').pop()}
                    </option>
                  ))}
                </select>
                {availablePdfs.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    No hay PDFs disponibles. Coloca archivos en la carpeta Webinars del proyecto.
                  </p>
                )}
              </div>
            </div>
            <Button onClick={handleSaveDistribution} disabled={uploading || !selectedPdf} className="w-full">
              Guardar Distribución
            </Button>
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
