import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.jsx";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { getAllRegionCodes } from "@/components/RegionsTaxonomy";

const formSchema = z.object({
  name: z.string().min(1, { message: "Project name is required" }),
  category: z.string().min(1, { message: "Category is required" }),
  region_code: z.string().min(1, { message: "Region is required" }),
  audience: z.string().default("Industrial manufacturers"),
  objective: z.string().min(10, { message: "Please provide a clear objective (at least 10 characters)" }),
  meeting_context: z.string().optional(),
  customer_priorities: z.array(z.string()).optional(),
});

const categories = ["Ice Cream", "Bakery", "Confectionery", "Chocolate", "Dairy", "Beverages"];
const regions = [...getAllRegionCodes(), "Global"];
const trendTimeWindows = ["last 6 months", "last 12 months", "last 24 months", "last 36 months"];
const launchTimeWindows = ["last 30 days", "last 3 months", "last 6 months", "last 12 months"];
const meetingContextOptions = ["discovery", "innovation_day", "technical_workshop", "other"];
const customerPrioritiesOptions = ["cost", "clean label", "sustainability", "texture", "indulgence", "health & wellness", "convenience"];

export default function NewProject() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      category: "",
      region_code: "",
      audience: "Industrial manufacturers",
      objective: "",
      meeting_context: "",
      customer_priorities: [],
    },
  });

  async function onSubmit(values) {
    setIsSubmitting(true);
    try {
      const newProject = await base44.entities.Project.create({
        ...values,
        state: "draft",
        data_sufficiency_score: 0,
        warnings: [],
        selected_trend_ids: [],
      });
      toast.success("Project created successfully!");
      navigate(createPageUrl(`ProjectDetail?projectId=${newProject.id}`));
    } catch (error) {
      toast.error("Failed to create project: " + error.message);
      console.error("Failed to create project:", error);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <Button
          variant="ghost"
          onClick={() => navigate(createPageUrl("Projects"))}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Projects
        </Button>

        <div className="bg-white rounded-xl shadow-sm border p-8">
          <h1 className="text-3xl font-bold mb-2">Create New Project</h1>
          <p className="text-slate-600 mb-8">
            Set up a new trend deck project by defining the scope, audience, and objectives.
          </p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Project Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., EMEA Ice Cream Trends Q1 2026" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Category & Region Row */}
              <div className="grid md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="region_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Region Focus *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select region" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {regions.map((reg) => (
                            <SelectItem key={reg} value={reg}>
                              {reg}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Audience */}
              <FormField
                control={form.control}
                name="audience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Audience</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Industrial manufacturers" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Objective */}
              <FormField
                control={form.control}
                name="objective"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Objective / Decision this deck must enable *</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe the purpose of this deck and what decision it should enable (1-2 sentences)"
                        className="min-h-[100px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Meeting Context */}
              <FormField
                control={form.control}
                name="meeting_context"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meeting Context (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select context" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {meetingContextOptions.map((context) => (
                          <SelectItem key={context} value={context}>
                            {context.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Customer Priorities */}
              <FormField
                control={form.control}
                name="customer_priorities"
                render={() => (
                  <FormItem>
                    <FormLabel>Customer Priorities (Optional)</FormLabel>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                      {customerPrioritiesOptions.map((item) => (
                        <FormField
                          key={item}
                          control={form.control}
                          name="customer_priorities"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(item)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...(field.value || []), item])
                                      : field.onChange(
                                          field.value?.filter((value) => value !== item)
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">
                                {item}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(createPageUrl("Projects"))}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? "Creating..." : "Create Project"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}