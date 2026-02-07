import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const CATEGORIES = [
  'Ice Cream', 'Bakery', 'Confectionery', 'Dairy', 'Beverages',
  'Chocolate', 'Sauces & Dressings', 'Plant-Based', 'Other'
];

const REGIONS = [
  'EMEA', 'North America', 'Latin America', 'APAC', 'Global'
];

const PRIORITIES = [
  'Cost efficiency', 'Clean label', 'Sustainability', 'Texture innovation',
  'Indulgence', 'Health & wellness', 'Plant-based', 'Sugar reduction'
];

export default function NewProject() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    region: '',
    trend_time_window: 'Last 24 months',
    launch_time_window: 'Last 12 months',
    audience: 'Industrial manufacturers',
    objective: '',
    meeting_context: 'discovery',
    customer_priorities: [],
    state: 'draft'
  });

  const createProjectMutation = useMutation({
    mutationFn: (data) => base44.entities.Project.create(data),
    onSuccess: (newProject) => {
      navigate(createPageUrl(`ProjectDetail?id=${newProject.id}`));
    }
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePriorityToggle = (priority) => {
    setFormData(prev => ({
      ...prev,
      customer_priorities: prev.customer_priorities.includes(priority)
        ? prev.customer_priorities.filter(p => p !== priority)
        : [...prev.customer_priorities, priority]
    }));
  };

  const canProceedStep1 = formData.name && formData.category && formData.region;
  const canCreateProject = canProceedStep1 && formData.objective;

  const handleCreate = () => {
    createProjectMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Create New Project</h1>
          <p className="text-slate-600">Set up the context for your trend intelligence report</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <div className={`flex-1 h-2 rounded-full transition-all ${
              step >= 1 ? 'bg-blue-600' : 'bg-slate-200'
            }`} />
            <div className={`flex-1 h-2 rounded-full transition-all ${
              step >= 2 ? 'bg-blue-600' : 'bg-slate-200'
            }`} />
          </div>
          <div className="flex justify-between mt-2 text-sm">
            <span className={step >= 1 ? 'text-blue-600 font-medium' : 'text-slate-500'}>
              Basic Info
            </span>
            <span className={step >= 2 ? 'text-blue-600 font-medium' : 'text-slate-500'}>
              Context & Goals
            </span>
          </div>
        </div>

        {/* Step 1: Basic Information */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Project Basics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Ice Cream Trends EMEA 2026"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select value={formData.category} onValueChange={(value) => handleChange('category', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="region">Region *</Label>
                  <Select value={formData.region} onValueChange={(value) => handleChange('region', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map(region => (
                        <SelectItem key={region} value={region}>{region}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trend_window">Trend Time Window</Label>
                  <Input
                    id="trend_window"
                    value={formData.trend_time_window}
                    onChange={(e) => handleChange('trend_time_window', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="launch_window">Launch Time Window</Label>
                  <Input
                    id="launch_window"
                    value={formData.launch_time_window}
                    onChange={(e) => handleChange('launch_time_window', e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!canProceedStep1}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Context & Goals */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Context & Objectives</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="objective">What decision should this deck enable? *</Label>
                <Textarea
                  id="objective"
                  placeholder="e.g., Help customer identify innovation opportunities aligned with clean label and cost efficiency priorities"
                  value={formData.objective}
                  onChange={(e) => handleChange('objective', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="meeting_context">Meeting Context</Label>
                <Select value={formData.meeting_context} onValueChange={(value) => handleChange('meeting_context', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discovery">Discovery Meeting</SelectItem>
                    <SelectItem value="innovation_day">Innovation Day</SelectItem>
                    <SelectItem value="technical_workshop">Technical Workshop</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Customer Priorities (select all that apply)</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {PRIORITIES.map(priority => (
                    <button
                      key={priority}
                      onClick={() => handlePriorityToggle(priority)}
                      className={`px-4 py-2 rounded-lg border-2 text-sm transition-all ${
                        formData.customer_priorities.includes(priority)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!canCreateProject || createProjectMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}