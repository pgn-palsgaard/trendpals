import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAllRegionCodes } from '@/components/RegionsTaxonomy';

const categories = [
  "Cake premixes & Long shelf-life cakes",
  "Cake gels",
  "Condiments",
  "Chocolate & Confectionery",
  "Dairy",
  "Ice Cream",
  "Processed meat",
  "Oils & Fats",
  "Plant-based products",
  "RUTF and RUSF",
];

const regions = [...getAllRegionCodes(), "Global"];
const meetingContextOptions = ["discovery", "innovation_day", "technical_workshop", "other"];
const customerPrioritiesOptions = ["cost", "clean label", "sustainability", "texture", "indulgence", "health & wellness", "convenience"];

export default function EditProjectModal({ project, open, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: project.name || '',
    category: project.category || '',
    region_code: project.region_code || project.region || '',
    audience: project.audience || '',
    objective: project.objective || '',
    meeting_context: project.meeting_context || '',
    customer_priorities: project.customer_priorities || [],
  });

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.Project.update(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      toast.success('Project updated successfully');
      onClose();
    },
    onError: (err) => toast.error('Failed to update project: ' + err.message),
  });

  const togglePriority = (item) => {
    setForm(f => ({
      ...f,
      customer_priorities: f.customer_priorities.includes(item)
        ? f.customer_priorities.filter(p => p !== item)
        : [...f.customer_priorities, item],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <Label>Project Name *</Label>
            <Input className="mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Category *</Label>
              <>
                <Input
                  className="mt-1"
                  list="edit-category-options"
                  placeholder="Select or type a category"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                />
                <datalist id="edit-category-options">
                  {categories.map(cat => <option key={cat} value={cat} />)}
                </datalist>
              </>
            </div>

            <div>
              <Label>Region Focus *</Label>
              <Select value={form.region_code} onValueChange={v => setForm(f => ({ ...f, region_code: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map(reg => <SelectItem key={reg} value={reg}>{reg}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Audience</Label>
            <Input className="mt-1" value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))} />
          </div>

          <div>
            <Label>Objective</Label>
            <Textarea
              className="mt-1 min-h-[90px]"
              value={form.objective}
              onChange={e => setForm(f => ({ ...f, objective: e.target.value }))}
            />
          </div>

          <div>
            <Label>Meeting Context</Label>
            <Select value={form.meeting_context} onValueChange={v => setForm(f => ({ ...f, meeting_context: v }))}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select context" />
              </SelectTrigger>
              <SelectContent>
                {meetingContextOptions.map(ctx => (
                  <SelectItem key={ctx} value={ctx}>{ctx.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Customer Priorities</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
              {customerPrioritiesOptions.map(item => (
                <div key={item} className="flex items-center gap-2">
                  <Checkbox
                    checked={form.customer_priorities.includes(item)}
                    onCheckedChange={() => togglePriority(item)}
                    id={`edit-priority-${item}`}
                  />
                  <label htmlFor={`edit-priority-${item}`} className="text-sm cursor-pointer">{item}</label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !form.name || !form.category || !form.region_code}>
            {mutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}