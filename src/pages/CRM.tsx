import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Contact {
  id: string;
  organization: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  gartner_role: string;
  title: string;
  contact_type: string;
  contacted: boolean;
  last_contact_date: string | null;
  interested: boolean;
  webinars_subscribed: boolean;
  notes: string | null;
}

const GARTNER_ROLES = ["CIO", "CISO", "CDAO", "CTO", "I&O", "CInO", "D. Transformación"];

const CRM = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [campaignTypes, setCampaignTypes] = useState<string[]>([]);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    organization: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    gartner_role: "",
    title: "",
    contact_type: "",
    contacted: false,
    last_contact_date: "",
    interested: false,
    webinars_subscribed: false,
    notes: "",
  });

  useEffect(() => {
    fetchContacts();
    fetchCampaignTypes();
  }, []);

  const fetchContacts = async () => {
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "No se pudieron cargar los contactos", variant: "destructive" });
    } else {
      setContacts(data || []);
    }
  };

  const fetchCampaignTypes = async () => {
    const { data } = await supabase.from("campaign_templates").select("name");
    setCampaignTypes(data?.map((t) => t.name) || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      ...formData,
      last_contact_date: formData.last_contact_date || null,
    };

    if (editingContact) {
      const { error } = await supabase.from("contacts").update(payload).eq("id", editingContact.id);

      if (error) {
        toast({ title: "Error", description: "No se pudo actualizar el contacto", variant: "destructive" });
      } else {
        toast({ title: "Éxito", description: "Contacto actualizado correctamente" });
        setIsDialogOpen(false);
        fetchContacts();
        resetForm();
      }
    } else {
      const { error } = await supabase.from("contacts").insert([payload]);

      if (error) {
        toast({ title: "Error", description: "No se pudo crear el contacto", variant: "destructive" });
      } else {
        toast({ title: "Éxito", description: "Contacto creado correctamente" });
        setIsDialogOpen(false);
        fetchContacts();
        resetForm();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este contacto?")) return;

    const { error } = await supabase.from("contacts").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar el contacto", variant: "destructive" });
    } else {
      toast({ title: "Éxito", description: "Contacto eliminado" });
      fetchContacts();
    }
  };

  const resetForm = () => {
    setFormData({
      organization: "",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      gartner_role: "",
      title: "",
      contact_type: "",
      contacted: false,
      last_contact_date: "",
      interested: false,
      webinars_subscribed: false,
      notes: "",
    });
    setEditingContact(null);
  };

  const openEditDialog = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      organization: contact.organization,
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email,
      phone: contact.phone || "",
      gartner_role: contact.gartner_role,
      title: contact.title,
      contact_type: contact.contact_type,
      contacted: contact.contacted,
      last_contact_date: contact.last_contact_date || "",
      interested: contact.interested,
      webinars_subscribed: contact.webinars_subscribed,
      notes: contact.notes || "",
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-foreground">Gestión de Contactos (CRM)</h1>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Contacto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingContact ? "Editar Contacto" : "Nuevo Contacto"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="organization">Organización *</Label>
                    <Input
                      id="organization"
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="first_name">Nombre *</Label>
                    <Input
                      id="first_name"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="last_name">Apellido *</Label>
                    <Input
                      id="last_name"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
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
                  <div>
                    <Label htmlFor="title">Título *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact_type">Tipo (Campaña) *</Label>
                    <Select value={formData.contact_type} onValueChange={(value) => setFormData({ ...formData, contact_type: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {campaignTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="last_contact_date">Último Contacto</Label>
                    <Input
                      id="last_contact_date"
                      type="date"
                      value={formData.last_contact_date}
                      onChange={(e) => setFormData({ ...formData, last_contact_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="contacted"
                      checked={formData.contacted}
                      onCheckedChange={(checked) => setFormData({ ...formData, contacted: checked as boolean })}
                    />
                    <Label htmlFor="contacted">Contactado</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="interested"
                      checked={formData.interested}
                      onCheckedChange={(checked) => setFormData({ ...formData, interested: checked as boolean })}
                    />
                    <Label htmlFor="interested">Interesado</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="webinars_subscribed"
                      checked={formData.webinars_subscribed}
                      onCheckedChange={(checked) => setFormData({ ...formData, webinars_subscribed: checked as boolean })}
                    />
                    <Label htmlFor="webinars_subscribed">Webinars</Label>
                  </div>
                </div>
                <div>
                  <Label htmlFor="notes">Notas</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">{editingContact ? "Actualizar" : "Crear"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card rounded-lg shadow overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organización</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Contactado</TableHead>
                <TableHead>Interesado</TableHead>
                <TableHead>Webinars</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>{contact.organization}</TableCell>
                  <TableCell>
                    {contact.first_name} {contact.last_name}
                  </TableCell>
                  <TableCell>{contact.email}</TableCell>
                  <TableCell>{contact.gartner_role}</TableCell>
                  <TableCell>{contact.contact_type}</TableCell>
                  <TableCell>{contact.contacted ? "Sí" : "No"}</TableCell>
                  <TableCell>{contact.interested ? "Sí" : "No"}</TableCell>
                  <TableCell>{contact.webinars_subscribed ? "Sí" : "No"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(contact)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(contact.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default CRM;
