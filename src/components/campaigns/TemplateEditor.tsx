import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Save, Trash2 } from "lucide-react";

const GARTNER_ROLES = ["CIO", "CISO", "CDAO", "CTO", "I&O", "CInO", "D. Transformación"];

interface Template {
  id: string;
  name: string;
  gartner_role: string;
  email_1_subject: string;
  email_1_html: string;
  email_2_subject: string;
  email_2_html: string;
  email_3_subject: string;
  email_3_html: string;
  email_4_subject: string;
  email_4_html: string;
  email_5_subject: string;
  email_5_html: string;
}

export const TemplateEditor = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    gartner_role: "",
    email_1_subject: "",
    email_1_html: "",
    email_2_subject: "",
    email_2_html: "",
    email_3_subject: "",
    email_3_html: "",
    email_4_subject: "",
    email_4_html: "",
    email_5_subject: "",
    email_5_html: "",
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    const { data } = await supabase.from("campaign_templates").select("*");
    setTemplates(data || []);
  };

  const handleSave = async () => {
    if (isNewTemplate) {
      const { error } = await supabase.from("campaign_templates").insert([formData]);
      if (error) {
        toast({ title: "Error", description: "No se pudo crear la plantilla", variant: "destructive" });
      } else {
        toast({ title: "Éxito", description: "Plantilla creada" });
        fetchTemplates();
        setIsNewTemplate(false);
        resetForm();
      }
    } else if (selectedTemplate) {
      const { error } = await supabase.from("campaign_templates").update(formData).eq("id", selectedTemplate.id);
      if (error) {
        toast({ title: "Error", description: "No se pudo actualizar", variant: "destructive" });
      } else {
        toast({ title: "Éxito", description: "Plantilla actualizada" });
        fetchTemplates();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla?")) return;

    const { error } = await supabase.from("campaign_templates").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    } else {
      toast({ title: "Éxito", description: "Plantilla eliminada" });
      fetchTemplates();
      resetForm();
    }
  };

  const loadTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setIsNewTemplate(false);
    setFormData({
      name: template.name,
      gartner_role: template.gartner_role,
      email_1_subject: template.email_1_subject,
      email_1_html: template.email_1_html,
      email_2_subject: template.email_2_subject,
      email_2_html: template.email_2_html,
      email_3_subject: template.email_3_subject,
      email_3_html: template.email_3_html,
      email_4_subject: template.email_4_subject,
      email_4_html: template.email_4_html,
      email_5_subject: template.email_5_subject,
      email_5_html: template.email_5_html,
    });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      gartner_role: "",
      email_1_subject: "",
      email_1_html: "",
      email_2_subject: "",
      email_2_html: "",
      email_3_subject: "",
      email_3_html: "",
      email_4_subject: "",
      email_4_html: "",
      email_5_subject: "",
      email_5_html: "",
    });
    setSelectedTemplate(null);
    setIsNewTemplate(false);
  };

  const startNewTemplate = () => {
    resetForm();
    setIsNewTemplate(true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle>Plantillas</CardTitle>
            <CardDescription>Selecciona o crea una plantilla</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={startNewTemplate}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Plantilla
            </Button>
            {templates.map((template) => (
              <div key={template.id} className="flex gap-2">
                <Button
                  variant={selectedTemplate?.id === template.id ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => loadTemplate(template)}
                >
                  {template.name}
                </Button>
                <Button size="icon" variant="destructive" onClick={() => handleDelete(template.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle>{isNewTemplate ? "Nueva Plantilla" : selectedTemplate ? `Editar: ${selectedTemplate.name}` : "Editor de Plantillas"}</CardTitle>
            <CardDescription>
              Usa variables: {"{{nombre}}"}, {"{{apellido}}"}, {"{{organizacion}}"}, {"{{rol}}"}, {"{{titulo}}"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Nombre de Plantilla *</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="gartner_role">Rol Gartner *</Label>
                <Select value={formData.gartner_role} onValueChange={(value) => setFormData({ ...formData, gartner_role: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {GARTNER_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {[1, 2, 3, 4, 5].map((num) => (
              <div key={num} className="border p-4 rounded-lg space-y-2">
                <h3 className="font-semibold">Email {num}</h3>
                <div>
                  <Label htmlFor={`email_${num}_subject`}>Asunto</Label>
                  <Input
                    id={`email_${num}_subject`}
                    value={formData[`email_${num}_subject` as keyof typeof formData] as string}
                    onChange={(e) => setFormData({ ...formData, [`email_${num}_subject`]: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`email_${num}_html`}>HTML</Label>
                  <Textarea
                    id={`email_${num}_html`}
                    value={formData[`email_${num}_html` as keyof typeof formData] as string}
                    onChange={(e) => setFormData({ ...formData, [`email_${num}_html`]: e.target.value })}
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            ))}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />
                Guardar Plantilla
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
