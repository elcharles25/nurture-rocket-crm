import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Settings, FileText, Trash2 } from "lucide-react";
import { WebinarEmailEditor } from "@/components/webinars/WebinarEmailEditor";
import { useOutlookDraftBatch, fileToBase64 } from "@/hooks/useOutlookDraft";

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
  webinar_table: string | null;
}

const Webinars = () => {
  const [distributions, setDistributions] = useState<WebinarDistribution[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [creatingDrafts, setCreatingDrafts] = useState(false);
  const [availablePdfs, setAvailablePdfs] = useState<string[]>([]);
  const [selectedPdf, setSelectedPdf] = useState("");
  const [uploadedPdfBase64, setUploadedPdfBase64] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
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

  const onUploadPdf = async (file: File) => {
    try {
      setUploadedFile(file);
      setSelectedPdf(file.name);
      const b64 = await fileToBase64(file);
      setUploadedPdfBase64(b64);
      toast({ title: 'PDF cargado', description: file.name });
    } catch (e) {
      console.error('Error al leer PDF local:', e);
      toast({ title: 'Error', description: 'No se pudo leer el PDF', variant: 'destructive' });
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

      toast({ title: "Analizando PDF", description: "Generando tabla de webinars con IA..." });

      // Analyze PDF with AI
      try {
        let base64PdfToUse: string | null = uploadedPdfBase64;
        if (!base64PdfToUse) {
          const response = await fetch('http://localhost:3001/api/webinars/read-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: selectedPdf })
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error leyendo PDF: ${errorText}`);
          }
          const json = await response.json();
          base64PdfToUse = json.base64Pdf;
          if (!base64PdfToUse) {
            throw new Error('No se recibió el PDF en base64');
          }
        }

        const { data, error: analyzeError } = await supabase.functions.invoke('analyze-webinar-pdf', {
          body: {
            distributionId: insertData.id,
            base64Pdf: base64PdfToUse
          }
        });

        if (analyzeError) {
          console.error('Error analyzing PDF:', analyzeError);
          toast({ 
            title: "Error en análisis", 
            description: analyzeError.message || "El análisis con IA falló",
            variant: "destructive" 
          });
        } else {
          console.log('Analysis successful:', data);
          toast({ title: "Éxito", description: "Distribución guardada y tabla generada" });
        }
      } catch (analyzeError) {
        console.error('Error analyzing PDF:', analyzeError);
        toast({ 
          title: "Error", 
          description: `Error: ${analyzeError instanceof Error ? analyzeError.message : 'Desconocido'}`,
          variant: "destructive" 
        });
      }

      setSelectedPdf("");
      setUploadedFile(null);
      setUploadedPdfBase64(null);
      fetchDistributions();
      fetchAvailablePdfs();
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

      if (!distribution.webinar_table) {
        toast({
          title: "Error",
          description: "La tabla de webinars aún no se ha generado. Por favor espera unos momentos.",
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

        // Add the webinar table to the email body
        if (distribution.webinar_table) {
          body = body + `\n\n${distribution.webinar_table}`;
        }

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
          onSuccess: async () => {
            // Actualizar el estado a enviado
            const { error } = await supabase
              .from("webinar_distributions")
              .update({ sent: true, sent_at: new Date().toISOString() })
              .eq("id", distributionId);

            if (!error) {
              toast({
                title: "Éxito",
                description: "Borradores creados y estado actualizado",
              });
              fetchDistributions();
            }
            setCreatingDrafts(false);
          },
          onError: () => {
            setCreatingDrafts(false);
          },
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
                  onChange={(e) => { setSelectedPdf(e.target.value); setUploadedFile(null); setUploadedPdfBase64(null); }}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  disabled={uploading}
                >
                  <option value="">-- Selecciona un PDF --</option>
                  {availablePdfs
                    .filter(pdf => !distributions.some(dist => dist.file_name === pdf.split('\\').pop()))
                    .map((pdf) => (
                    <option key={pdf} value={pdf}>
                      {pdf.split('\\').pop()}
                    </option>
                  ))}
                </select>
                <div className="mt-3">
                  <label className="text-xs font-medium">o subir PDF desde tu equipo</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="mt-1 block w-full text-sm text-foreground"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) await onUploadPdf(file);
                    }}
                    disabled={uploading}
                  />
                </div>
                {availablePdfs.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    También puedes subir un PDF con el botón de arriba.
                  </p>
                )}
              </div>
            </div>
            <Button onClick={handleSaveDistribution} disabled={uploading || (!selectedPdf && !uploadedPdfBase64)} className="w-full">
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
                  <TableHead className="text-center">Mes</TableHead>
                  <TableHead className="text-center">Archivo</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Fecha Envío</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distributions.map((dist) => (
                  <TableRow key={dist.id} className="text-sm leading-tight text-center align-middle">
                    <TableCell className="p-4">{dist.month}</TableCell>
                    <TableCell className="p-4">
                      <a href={dist.file_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {dist.file_name}
                      </a>
                    </TableCell>
                    <TableCell className="p-4">
                      <span className={`leading-tight rounded text-xs ${dist.sent ? "px-10 py-2.5 bg-green-500/20" : "px-9 py-2.5 bg-yellow-500/20"}`}>
                        {dist.sent ? "Enviado" : "Pendiente"}
                      </span>
                    </TableCell>
                    <TableCell className="p-4">{dist.sent_at ? new Date(dist.sent_at).toLocaleDateString() : "-"}</TableCell>
                    <TableCell className="p-4">
                      <div className="flex justify-center gap-3">
                        {!dist.sent && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 px-2 py-0" 
                              onClick={() => handleCreateDrafts(dist.id)} 
                              disabled={creatingDrafts || isCreatingDrafts} 
                              title="Crear borradores en Outlook"
                            >
                              <FileText className="h-3 w-3" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              className="h-8 px-2 py-0" 
                              onClick={() => handleDelete(dist.id, dist.file_url)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
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
