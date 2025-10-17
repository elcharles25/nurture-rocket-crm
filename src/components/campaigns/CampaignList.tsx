import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Send } from "lucide-react";

interface Campaign {
  id: string;
  contact_id: string;
  template_id: string | null;
  start_campaign: boolean;
  email_1_date: string | null;
  email_2_date: string | null;
  email_3_date: string | null;
  email_4_date: string | null;
  email_5_date: string | null;
  status: string;
  response_date: string | null;
  response_text: string | null;
  emails_sent: number;
  contacts: {
    first_name: string;
    last_name: string;
    email: string;
    organization: string;
    gartner_role: string;
    title: string;
  };
  campaign_templates?: {
    name: string;
  };
}

export const CampaignList = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    contact_id: "",
    template_id: "",
    start_campaign: false,
    email_1_date: "",
    email_2_date: "",
    email_3_date: "",
    email_4_date: "",
    email_5_date: "",
  });

  useEffect(() => {
    fetchCampaigns();
    fetchContacts();
    fetchTemplates();
  }, []);

  const fetchCampaigns = async () => {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*, contacts(first_name, last_name, email, organization, gartner_role, title), campaign_templates(name)")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setCampaigns(data as any);
    }
  };

  const fetchContacts = async () => {
    const { data } = await supabase.from("contacts").select("*");
    setContacts(data || []);
  };

  const fetchTemplates = async () => {
    const { data } = await supabase.from("campaign_templates").select("*");
    setTemplates(data || []);
  };

  const calculateDates = (startDate: string) => {
    const dates = [startDate];
    const start = new Date(startDate);
    for (let i = 1; i < 5; i++) {
      const nextDate = new Date(start);
      nextDate.setDate(start.getDate() + i * 3);
      dates.push(nextDate.toISOString().split("T")[0]);
    }
    return dates;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dates = calculateDates(formData.email_1_date);

    const payload = {
      contact_id: formData.contact_id,
      template_id: formData.template_id || null,
      start_campaign: formData.start_campaign,
      email_1_date: dates[0],
      email_2_date: dates[1],
      email_3_date: dates[2],
      email_4_date: dates[3],
      email_5_date: dates[4],
      status: formData.start_campaign ? 'active' : 'pending',
    };

    const { error } = await supabase.from("campaigns").insert([payload]);

    if (error) {
      toast({ title: "Error", description: "No se pudo crear la campaña", variant: "destructive" });
    } else {
      toast({ title: "Éxito", description: "Campaña creada correctamente" });
      setIsDialogOpen(false);
      fetchCampaigns();
      resetForm();
    }
  };

  const resetForm = () => {
    setFormData({
      contact_id: "",
      template_id: "",
      start_campaign: false,
      email_1_date: "",
      email_2_date: "",
      email_3_date: "",
      email_4_date: "",
      email_5_date: "",
    });
  };

  const handleSendEmail = async (campaignId: string, emailNumber: number) => {
    if (!confirm(`¿Enviar email ${emailNumber} de esta campaña?`)) return;

    toast({ title: "Enviando", description: "Enviando email..." });

    try {
      const { data, error } = await supabase.functions.invoke("send-campaign-email", {
        body: { 
          campaignId,
          emailNumber 
        },
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        toast({ title: "Éxito", description: "Email enviado correctamente" });
        fetchCampaigns();
      } else {
        toast({ title: "Error", description: "No se pudo enviar el email", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error sending email:", error);
      toast({ title: "Error", description: "No se pudo enviar el email", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta campaña?")) return;

    const { error } = await supabase.from("campaigns").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    } else {
      toast({ title: "Éxito", description: "Campaña eliminada" });
      fetchCampaigns();
    }
  };

  return (
    <div className="bg-card rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Campañas Programadas</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Campaña
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nueva Campaña</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="contact_id">Contacto *</Label>
                <Select value={formData.contact_id} onValueChange={(value) => setFormData({ ...formData, contact_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar contacto" />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.first_name} {contact.last_name} - {contact.organization}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="template_id">Plantilla</Label>
                <Select value={formData.template_id} onValueChange={(value) => setFormData({ ...formData, template_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar plantilla" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="email_1_date">Fecha Inicio (Email 1) *</Label>
                <Input
                  id="email_1_date"
                  type="date"
                  value={formData.email_1_date}
                  onChange={(e) => setFormData({ ...formData, email_1_date: e.target.value })}
                  required
                />
                <p className="text-sm text-muted-foreground mt-1">Los siguientes emails se programarán cada 3 días</p>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="start_campaign"
                  checked={formData.start_campaign}
                  onCheckedChange={(checked) => setFormData({ ...formData, start_campaign: checked as boolean })}
                />
                <Label htmlFor="start_campaign">Iniciar campaña automáticamente</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Crear Campaña</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rol</TableHead>
            <TableHead>Plantilla</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Emails Enviados</TableHead>
            <TableHead>Fecha Email 1</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => (
            <TableRow key={campaign.id}>
              <TableCell>{campaign.contacts.gartner_role}</TableCell>
              <TableCell>{campaign.campaign_templates?.name || "Sin plantilla"}</TableCell>
              <TableCell>
                {campaign.contacts.first_name} {campaign.contacts.last_name}
              </TableCell>
              <TableCell>{campaign.contacts.email}</TableCell>
              <TableCell>
                <span className={`px-2 py-1 rounded text-xs ${campaign.status === "completed" ? "bg-green-100 text-green-800" : campaign.status === "active" ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"}`}>
                  {campaign.status}
                </span>
              </TableCell>
              <TableCell>{campaign.emails_sent} / 5</TableCell>
              <TableCell>{campaign.email_1_date ? new Date(campaign.email_1_date).toLocaleDateString() : "-"}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {campaign.start_campaign && (
                    <>
                      {!campaign.email_1_date && (
                        <Button size="sm" variant="secondary" onClick={() => handleSendEmail(campaign.id, 1)}>
                          <Send className="h-4 w-4 mr-1" />
                          Email 1
                        </Button>
                      )}
                      {campaign.email_1_date && !campaign.email_2_date && (
                        <Button size="sm" variant="secondary" onClick={() => handleSendEmail(campaign.id, 2)}>
                          <Send className="h-4 w-4 mr-1" />
                          Email 2
                        </Button>
                      )}
                      {campaign.email_2_date && !campaign.email_3_date && (
                        <Button size="sm" variant="secondary" onClick={() => handleSendEmail(campaign.id, 3)}>
                          <Send className="h-4 w-4 mr-1" />
                          Email 3
                        </Button>
                      )}
                      {campaign.email_3_date && !campaign.email_4_date && (
                        <Button size="sm" variant="secondary" onClick={() => handleSendEmail(campaign.id, 4)}>
                          <Send className="h-4 w-4 mr-1" />
                          Email 4
                        </Button>
                      )}
                      {campaign.email_4_date && !campaign.email_5_date && (
                        <Button size="sm" variant="secondary" onClick={() => handleSendEmail(campaign.id, 5)}>
                          <Send className="h-4 w-4 mr-1" />
                          Email 5
                        </Button>
                      )}
                    </>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(campaign.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
