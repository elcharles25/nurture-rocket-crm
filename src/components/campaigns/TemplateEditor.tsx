import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, X, Paperclip } from "lucide-react";

interface TemplateEditorProps {
  templateId: string | null;
  onSave: () => void;
}

const GARTNER_ROLES = ["CIO", "CISO", "CDAO", "CTO", "I&O", "CInO", "D. Transformación"];

export const TemplateEditor = ({ templateId, onSave }: TemplateEditorProps) => {
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
    attachments: [] as any[],
  });

  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (templateId) {
      fetchTemplate();
    }
  }, [templateId]);

  const fetchTemplate = async () => {
    if (!templateId) return;
    
    const { data } = await supabase.from("campaign_templates").select("*").eq("id", templateId).single();
    if (data) {
      setFormData({
        name: data.name,
        gartner_role: data.gartner_role,
        email_1_subject: data.email_1_subject,
        email_1_html: data.email_1_html,
        email_2_subject: data.email_2_subject,
        email_2_html: data.email_2_html,
        email_3_subject: data.email_3_subject,
        email_3_html: data.email_3_html,
        email_4_subject: data.email_4_subject,
        email_4_html: data.email_4_html,
        email_5_subject: data.email_5_subject,
        email_5_html: data.email_5_html,
        attachments: (data.attachments as any) || [],
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    const uploadedFiles = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = `templates/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage.from("webinars").upload(fileName, file);

      if (!error && data) {
        const { data: urlData } = supabase.storage.from("webinars").getPublicUrl(fileName);
        uploadedFiles.push({ name: file.name, url: urlData.publicUrl });
      }
    }

    setFormData({ ...formData, attachments: [...formData.attachments, ...uploadedFiles] });
    setUploading(false);
    toast({ title: "Éxito", description: `${uploadedFiles.length} archivo(s) subido(s)` });
  };

  const removeAttachment = (index: number) => {
    const newAttachments = formData.attachments.filter((_, i) => i !== index);
    setFormData({ ...formData, attachments: newAttachments });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.gartner_role) {
      toast({ title: "Error", description: "Nombre y rol son requeridos", variant: "destructive" });
      return;
    }

    if (templateId) {
      const { error } = await supabase.from("campaign_templates").update(formData).eq("id", templateId);
      if (error) {
        toast({ title: "Error", description: "No se pudo actualizar la plantilla", variant: "destructive" });
      } else {
        toast({ title: "Éxito", description: "Plantilla actualizada" });
        onSave();
      }
    } else {
      const { error } = await supabase.from("campaign_templates").insert([formData]);
      if (error) {
        toast({ title: "Error", description: "No se pudo crear la plantilla", variant: "destructive" });
      } else {
        toast({ title: "Éxito", description: "Plantilla creada" });
        onSave();
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Nombre de la Plantilla</Label>
          <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="role">Rol Gartner</Label>
          <Select value={formData.gartner_role} onValueChange={(value) => setFormData({ ...formData, gartner_role: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un rol" />
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

      <div>
        <Label htmlFor="attachments">Archivos Adjuntos</Label>
        <Input
          id="attachments"
          type="file"
          multiple
          onChange={handleFileUpload}
          disabled={uploading}
          className="cursor-pointer"
        />
        {formData.attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {formData.attachments.map((file: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="flex items-center text-sm">
                  <Paperclip className="h-3 w-3 mr-2" />
                  {file.name}
                </span>
                <Button size="sm" variant="ghost" onClick={() => removeAttachment(index)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
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
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Guardar Plantilla
        </Button>
      </div>
    </div>
  );
};
