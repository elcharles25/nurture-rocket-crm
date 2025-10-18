import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Paperclip } from "lucide-react";
import { TemplateEditor } from "./TemplateEditor";
import { formatDateES } from "@/utils/dateFormatter";

interface Template {
  id: string;
  name: string;
  gartner_role: string;
  attachments: any;
  created_at: string;
}

export function TemplateList() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    const { data } = await supabase.from("campaign_templates").select("*").order("created_at", { ascending: false });
    setTemplates((data || []) as any);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla?")) return;

    const { error } = await supabase.from("campaign_templates").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar la plantilla", variant: "destructive" });
    } else {
      toast({ title: "Éxito", description: "Plantilla eliminada" });
      fetchTemplates();
    }
  };

  const handleSave = () => {
    setShowEditor(false);
    setEditingTemplate(null);
    fetchTemplates();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Plantillas de Campaña</CardTitle>
        <Button onClick={() => { setEditingTemplate(null); setShowEditor(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Plantilla
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Rol Gartner</TableHead>
              <TableHead>Adjuntos</TableHead>
              <TableHead>Fecha Creación</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">{template.name}</TableCell>
                <TableCell>{template.gartner_role}</TableCell>
                <TableCell>
                  {(template.attachments as any)?.length > 0 && (
                    <span className="flex items-center text-sm text-muted-foreground">
                      <Paperclip className="h-3 w-3 mr-1" />
                      {(template.attachments as any).length} archivo(s)
                    </span>
                  )}
                </TableCell>
                <TableCell>{formatDateES(template.created_at)}</TableCell> 
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingTemplate(template.id);
                        setShowEditor(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(template.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Dialog open={showEditor} onOpenChange={setShowEditor}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Editar Plantilla" : "Nueva Plantilla"}</DialogTitle>
            </DialogHeader>
            <TemplateEditor templateId={editingTemplate} onSave={handleSave} />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
