import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Upload, Send, Trash2 } from "lucide-react";

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
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    month: new Date().toISOString().slice(0, 7),
    email_subject: "Webinars disponibles este mes",
    email_html: `<h2>Hola {{nombre}},</h2>
<p>Aquí están los webinars disponibles para este mes en tu organización {{organizacion}}.</p>
<p>Adjuntamos el PDF con toda la información.</p>
<p>Saludos,<br>El equipo</p>`,
  });

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

    const fileName = `${formData.month}-${Date.now()}.pdf`;
    const { data, error } = await supabase.storage.from("webinars").upload(fileName, file);

    if (error) {
      toast({ title: "Error", description: "No se pudo subir el archivo", variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("webinars").getPublicUrl(fileName);

    const { error: insertError } = await supabase.from("webinar_distributions").insert([
      {
        month: formData.month,
        file_url: urlData.publicUrl,
        file_name: file.name,
        email_subject: formData.email_subject,
        email_html: formData.email_html,
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
        <h1 className="text-3xl font-bold text-foreground">Gestión de Webinars</h1>

        <Card>
          <CardHeader>
            <CardTitle>Cargar Nuevo Webinar</CardTitle>
            <CardDescription>Sube el PDF de webinars del mes y configura el email</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="month">Mes</Label>
              <Input id="month" type="month" value={formData.month} onChange={(e) => setFormData({ ...formData, month: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="email_subject">Asunto del Email</Label>
              <Input
                id="email_subject"
                value={formData.email_subject}
                onChange={(e) => setFormData({ ...formData, email_subject: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="email_html">Plantilla HTML</Label>
              <Textarea
                id="email_html"
                value={formData.email_html}
                onChange={(e) => setFormData({ ...formData, email_html: e.target.value })}
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Variables disponibles: {"{{nombre}}"}, {"{{apellido}}"}, {"{{organizacion}}"}
              </p>
            </div>
            <div>
              <Label htmlFor="file">Archivo PDF</Label>
              <Input id="file" type="file" accept="application/pdf" onChange={handleFileUpload} disabled={uploading} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuciones Programadas</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Asunto</TableHead>
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
                    <TableCell>{dist.email_subject}</TableCell>
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
      </div>
    </div>
  );
};

export default Webinars;
