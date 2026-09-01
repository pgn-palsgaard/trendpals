import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';

const PAGE_SIZE = 50;

export default function PersonalCareProductsTab() {
  const [search, setSearch] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['bsaProducts', search],
    queryFn: () => {
      const query = { main_group: 'BSA' };
      if (search.trim()) {
        query.$or = [
          { product_name: { $regex: search.trim(), $options: 'i' } },
          { brand: { $regex: search.trim(), $options: 'i' } },
        ];
      }
      return base44.entities.GNPDProduct.filter(query, '-launch_date', PAGE_SIZE);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product or brand…"
            className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <span className="badge-blue">Personal care</span>
      </div>

      <div className="pal-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : products.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            No Personal Care products yet — upload and parse a GNPD export on the GNPD tab.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 border-b border-border">
                {['Product', 'Brand', 'Market', 'Launch', 'Sub-category'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="table-row-airy">
                  <td className="px-4 py-2.5 font-medium text-foreground">{p.product_name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.brand || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.country || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.launch_date || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.sub_category || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}