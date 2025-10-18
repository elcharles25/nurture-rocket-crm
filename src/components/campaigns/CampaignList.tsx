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
  emails_sent: number;
  contacts: {
    first_name: string;
    last_name: string;
    email: string;
    organization: string;
    gartner_role: string;
  };
  campaign_templates?: {
    name: string;
  };
}

export const CampaignList = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    contact_id: "",
    template_id: "",
    start_campaign: false,
    email_1_date: "",
  });

  useEffect(() => {
    initData();
  }, []);

  const initData = async () => {
    await fetchCampaigns();
    await fetchContacts();
    await fetchTemplates();
    setLoading(false);
  };

  const fetchCampaigns = async () => {
    const { data } = await supabase
      .from("campaigns")
      .select("*, contacts(first_name, last_name, email, organization, gartner_role), campaign_templates(name)")
      .order("created_at", { ascending: false });
    setCampaigns(data as Campaign[]);
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

  const handleContactChange = (contactId: string) => {
    setFormData({ ...formData, contact_id: contactId, template_id: "" });
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
      const available = templates.filter(t => t.gartner_role === contact.gartner_role);
      setFilteredTemplates(available);
    }
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
      toast({ title: "Éxito", description: "Campaña creada" });
      setIsDialogOpen(false);
      fetchCampaigns();
      resetForm();
    }
  };

  const resetForm = () => {
    setFormData({ contact_id: "", template_id: "", start_campaign: false, email_1_date: "" });
    setFilteredTemplates([]);
  };

  const getNextEmailNumber = (campaign: Campaign): number | null => {
    if (!campaign.email_1_date) return 1;
    if (!campaign.email_2_date) return 2;
    if (!campaign.email_3_date) return 3;
    if (!campaign.email_4_date) return 4;
    if (!campaign.email_5_date) return 5;
    return null;
  };

  const sendEmail = async (campaign: Campaign, emailNumber: number) => {
    try {
      if (campaign.emails_sent >= emailNumber) {
        toast({ title: "Info", description: `Email ${emailNumber} ya fue enviado`, variant: "default" });
        return;
      }

      const { data: template } = await supabase
        .from('campaign_templates')
        .select(`email_${emailNumber}_subject, email_${emailNumber}_html`)
        .eq('id', campaign.template_id)
        .single();

      if (!template) throw new Error('Template not found');

      const currentYear = new Date().getFullYear().toString();

      let subject = template[`email_${emailNumber}_subject`];
        subject = subject.replace(/{{Nombre}}/g, campaign.contacts.first_name || '');
        subject = subject.replace(/{{ano}}/g, currentYear);

      let body = template[`email_${emailNumber}_html`];
        body = body.replace(/{{Nombre}}/g, campaign.contacts.first_name || '');
        body = body.replace(/{{compania}}/g, campaign.contacts.organization || '');
        body = body.replace(/{{ano}}/g, currentYear);

      await fetch('http://localhost:3001/api/draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: campaign.contacts.email, subject, body }),
      });

      await supabase.from("campaigns").update({ emails_sent: emailNumber }).eq("id", campaign.id);

      const today = new Date().toISOString().split('T')[0];
      const updates: any = {};
      for (let i = 1; i <= 5; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + (i - 1) * 3);
        updates[`email_${i}_date`] = d.toISOString().split('T')[0];
      }
      await supabase.from("campaigns").update(updates).eq("id", campaign.id);

      toast({ title: "Éxito", description: `Email ${emailNumber} enviado` });
      fetchCampaigns();
    } catch (error) {
      toast({ title: "Error", description: String(error), variant: "destructive" });
    }
  };

const sendTodayEmails = async (campaign: Campaign) => {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .split('T')[0];
  
  console.log('Fecha local:', localDate);
  
  for (let i = 1; i <= 5; i++) {
    const dateField = `email_${i}_date` as keyof Campaign;
    const emailDate = campaign[dateField];
    
    // Extraer solo la fecha (YYYY-MM-DD) del timestamp
    const emailDateOnly = emailDate ? emailDate.split('T')[0] : null;
    
    console.log(`Email ${i}: ${emailDateOnly} <= ${localDate}?`, emailDateOnly && emailDateOnly <= localDate);
    
    if (emailDateOnly && emailDateOnly <= localDate && campaign.emails_sent < i) {
      console.log(`Enviando email ${i}`);
      await sendEmail(campaign, i);
      return;
    }
  }
  toast({ title: "Info", description: "No hay emails pendientes para hoy", variant: "default" });
};

  const handleDelete = async (id: string) => {
    await supabase.from("campaigns").delete().eq("id", id);
    toast({ title: "Éxito", description: "Campaña eliminada" });
    fetchCampaigns();
  };

  if (loading) return <div className="p-6">Cargando...</div>;

  return (
    <div className="bg-card rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Campañas</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}><Plus className="mr-2 h-4 w-4" />Nueva Campaña</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva Campaña</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Contacto</Label>
                <Select value={formData.contact_id} onValueChange={handleContactChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Plantilla</Label>
                <Select value={formData.template_id} onValueChange={(v) => setFormData({ ...formData, template_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha Inicio</Label>
                <Input type="date" value={formData.email_1_date} onChange={(e) => setFormData({ ...formData, email_1_date: e.target.value })} required />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={formData.start_campaign} onCheckedChange={(v) => setFormData({ ...formData, start_campaign: v as boolean })} />
                <Label>Auto-iniciar</Label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit">Crear</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-center">Rol</TableHead>
            <TableHead className="text-center">Nombre</TableHead>
            <TableHead className="text-center">Email</TableHead>
            <TableHead className="text-center">Enviados</TableHead>
            <TableHead className="text-center">Email 1</TableHead>
            <TableHead className="text-center">Email 2</TableHead>
            <TableHead className="text-center">Email 3</TableHead>
            <TableHead className="text-center">Email 4</TableHead>
            <TableHead className="text-center">Email 5</TableHead>
            <TableHead className="text-center">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((campaign) => (
            <TableRow key={campaign.id} className="text-center">
              <TableCell>{campaign.contacts.gartner_role}</TableCell>
              <TableCell>{campaign.contacts.first_name}</TableCell>
              <TableCell className="text-xs">{campaign.contacts.email}</TableCell>
              <TableCell>{campaign.emails_sent}/5</TableCell>
              <TableCell className="text-sm">{campaign.email_1_date ? new Date(campaign.email_1_date).toLocaleDateString() : "-"}</TableCell>
              <TableCell className="text-sm">{campaign.email_2_date ? new Date(campaign.email_2_date).toLocaleDateString() : "-"}</TableCell>
              <TableCell className="text-sm">{campaign.email_3_date ? new Date(campaign.email_3_date).toLocaleDateString() : "-"}</TableCell>
              <TableCell className="text-sm">{campaign.email_4_date ? new Date(campaign.email_4_date).toLocaleDateString() : "-"}</TableCell>
              <TableCell className="text-sm">{campaign.email_5_date ? new Date(campaign.email_5_date).toLocaleDateString() : "-"}</TableCell>
              <TableCell>
                <div className="flex justify-center gap-3">
                  {campaign.start_campaign && getNextEmailNumber(campaign) && (
                    <Button size="sm" variant="outline" onClick={() => sendEmail(campaign, getNextEmailNumber(campaign)!)}>
                      <Send className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => sendTodayEmails(campaign)}>
                    <Send className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(campaign.id)}>
                    <Trash2 className="h-3 w-3" />
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
