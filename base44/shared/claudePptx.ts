// base44/shared/claudePptx.ts
// Shared Anthropic plumbing for the Palsgaard PowerPoint deterministic export.
//
// Architecture change (Step 2):
//   OLD: Message Batch → poll → storeGeneratedPptx
//   NEW: synchronous streaming POST → storeGeneratedPptx in same call
//
// Claude's job is now to RUN build_deck.py against data.json, not to write
// python-pptx code. Build time: <2 s. Total call: well within 293 s ceiling.
//
// buildDeckMarkdown and buildSkillPrompt are removed — they existed only to
// feed the generative code-authoring path.
import { secrets } from 'base44:runtime';
import { resolveDeckProducts } from './deckImages.ts';

export const SKILL_ID = 'skill_01X6Ebs4KnmYNkUivvifnrpo';
export const API     = 'https://api.anthropic.com';
export const MODEL   = 'claude-sonnet-5';
const BETAS          = 'code-execution-2025-08-25,skills-2025-10-02,files-api-2025-04-14';

// Maximum pack shots per export call.
// Budget: 16 session-file limit − 1 (build_deck.py) − 1 (data.json) = 14.
export const MAX_PACK_SHOTS = 14;

// Retry budget for 429/5xx responses on file upload and the messages call.
const MAX_RETRIES = 3;
const RETRY_MS    = [2000, 5000, 10000];

export function anthropicHeaders(extra: Record<string, string> = {}) {
  return {
    'x-api-key':          secrets.get('ANTHROPIC_API_KEY'),
    'anthropic-version':  '2023-06-01',
    'anthropic-beta':     BETAS,
    ...extra,
  };
}

// ---------- helpers ----------

async function fetchWithRetry(url: string, init: RequestInit, label: string) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    const retryable = [429, 500, 502, 503, 524, 529].includes(res.status);
    if (!retryable || attempt === MAX_RETRIES - 1) {
      const body = await res.text().catch(() => '');
      throw new Error(`${label} failed (${res.status}): ${body.slice(0, 300)}`);
    }
    await new Promise(r => setTimeout(r, RETRY_MS[attempt]));
  }
  throw new Error(`${label}: unreachable`);
}

// ---------- image upload ----------

export async function uploadPackshotImages(
  base44,
  report,
  limit = MAX_PACK_SHOTS,
): Promise<Array<{ file_id: string; filename: string; product: string; record_id: string | null }>> {
  const resolved = (await resolveDeckProducts(base44, report, limit)).filter(r => r.image_url);

  // Parallel upload — bounded by the file-session limit.
  const CONCURRENCY = 5;
  const results: Array<{ file_id: string; filename: string; product: string; record_id: string | null }> = [];
  const queue = resolved.slice(0, limit);

  async function processOne(r, index: number) {
    const name = r.label || r.name;
    try {
      const imgRes = await fetchWithRetry(r.image_url, {}, `image fetch ${name}`);
      const bytes  = await imgRes.arrayBuffer();
      if (bytes.byteLength > 4_000_000) return;
      const ctype  = imgRes.headers.get('content-type') || 'image/jpeg';
      const ext    = ctype.includes('png') ? 'png' : 'jpg';
      const fname  = `product_${index + 1}.${ext}`;
      const form   = new FormData();
      form.append('file', new Blob([bytes], { type: ctype }), fname);
      const up   = await fetchWithRetry(
        `${API}/v1/files`, { method: 'POST', headers: anthropicHeaders(), body: form }, `upload ${fname}`
      );
      const meta = await up.json();
      results.push({ file_id: meta.id, filename: fname, product: name, record_id: r.record_id ?? null });
    } catch { /* skip unresolvable images — never fail the deck over a missing pack shot */ }
  }

  // Run in batches of CONCURRENCY, preserving index for deterministic filenames.
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    await Promise.all(queue.slice(i, i + CONCURRENCY).map((r, j) => processOne(r, i + j)));
  }
  return results;
}

// ---------- data.json builder ----------

// Builds the JSON payload sent to build_deck.py as data.json.
// No markdown conversion — the script reads the structured data directly.
export function buildDataJson(report, uploads: Array<{ file_id: string; filename: string; record_id: string | null; product: string }>) {
  // Image map: record_id → filename, lowercased product name → filename.
  const images: Record<string, string> = {};
  for (const u of uploads) {
    if (u.record_id)  images[u.record_id]               = u.filename;
    if (u.product)    images[u.product.toLowerCase()]   = u.filename;
  }

  return JSON.stringify({
    title:       report.title || '',
    subtitle:    report.region_display_label || report.region || '',
    preheader:   `${report.category || 'Market intelligence'}  |  Market intelligence  |  ${new Date().getFullYear()}`,
    prepared_by: 'Prepared by Palsgaard',
    beta:        report.generated_by === 'architect',
    slides:      report.slides || [],
    // Frozen citation map. supporting_data cites a source by id; the renderer
    // resolves it here and drops anything that does not resolve. Never re-derived.
    bindings:    report.evidence_bindings || {},
    // Build B — computed render-states. Per-trend evidence status frozen at save;
    // the renderer stamps signal annotations from THIS, never from slide prose.
    trend_status: report.trend_status || {},
    images,
  });
}

// ---------- build_deck.py source ----------
// This is the complete deterministic renderer. It is uploaded as a file on every
// export call so the container always runs the current version.
// IMPORTANT: keep this string in sync with the tested build_deck.py.
export const BUILD_DECK_PY = `#!/usr/bin/env python3
"""
build_deck.py — deterministic Palsgaard PPTX renderer for TrendPals reports.
Reads data.json, writes report.pptx using the Palsgaard .potx template.
No LLM involvement: same input always produces the same deck.
Exit codes: 0 ok, 2 bad input, 3 template problem, 4 built with warnings.
"""
import argparse, html, json, math, os, re, shutil, sys, zipfile
from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

BLUE=RGBColor(0x1D,0x42,0x8A); DKBLUE=RGBColor(0x1D,0x2B,0x47)
LGOLD=RGBColor(0xF7,0xF4,0xEE); WHITE=RGBColor(0xFF,0xFF,0xFF)
ORANGE=RGBColor(0xC1,0x53,0x38); SAGE=RGBColor(0x6F,0x82,0x63)
TEAL=RGBColor(0x22,0x56,0x6E); GREY=RGBColor(0x96,0x96,0x96)
SAGE_LIGHT=RGBColor(0xAC,0xCE,0xAE)
TEMPLATE_NAME='Palsgaard_PP_Template.potx'
BUDGET_FRONT_TITLE=47; BUDGET_CONTENT_TITLE=75; BUDGET_BREAKING_HEADLINE=38
BUDGET_IMPLICATIONS_TITLE=110
BODY_HEIGHT_IN=4.93; BODY_WIDTH_IN=11.86; BODY_WIDTH_WITH_IMAGES_IN=8.00
CHARS_PER_LINE={14:108,13:118,12:128,11:140,10:154}
LINE_HEIGHT_IN={14:0.245,13:0.228,12:0.210,11:0.194,10:0.177}
BREAKING_COLOURS=['Breaking slide dark blue','Breaking slide Palsgaard blue',
  'Breaking slide sage','Breaking slide dark green','Breaking slide light gold']
CONTENT_LAYOUTS=['Full page content and preheader',
  'Full page content and preheader',
  'Full page content and preheader, dark colours']
PREHEADER_IDX={'Full page content and preheader':16,
  'Full page content and preheader, dark colours':39}
BODY_IDX={'Full page content and preheader':18,
  'Full page content and preheader, dark colours':1}
DARK_LAYOUTS={'Full page content and preheader, dark colours'}
BINDINGS={}
TREND_STATUS={}
THUMB_LEFT_IN=9.15; THUMB_BOX_W_IN=3.29; THUMB_BOX_H_IN=1.55
THUMB_TOPS_IN=[1.60,3.35,5.10]

def find_template(explicit=None):
  candidates=[]
  if explicit: candidates.append(explicit)
  env=os.environ.get('PALSGAARD_POTX')
  if env: candidates.append(env)
  candidates+=['/mnt/skills/user/palsgaard-powerpoint/assets/'+TEMPLATE_NAME,
    '/skills/palsgaard-powerpoint/assets/'+TEMPLATE_NAME,
    './assets/'+TEMPLATE_NAME,'./'+TEMPLATE_NAME]
  for path in candidates:
    if path and os.path.isfile(path): return path
  for root in ('/mnt/skills','/skills','/home','/tmp','/mnt/user-data'):
    if not os.path.isdir(root): continue
    for dirpath,_,filenames in os.walk(root):
      if TEMPLATE_NAME in filenames: return os.path.join(dirpath,TEMPLATE_NAME)
  raise FileNotFoundError(f'{TEMPLATE_NAME} not found.')

def patch_template(src,workdir):
  unpacked=os.path.join(workdir,'potx_unpacked')
  if os.path.exists(unpacked): shutil.rmtree(unpacked)
  os.makedirs(unpacked,exist_ok=True)
  with zipfile.ZipFile(src,'r') as z: z.extractall(unpacked)
  ct_path=os.path.join(unpacked,'[Content_Types].xml')
  with open(ct_path,encoding='utf-8') as f: ct=f.read()
  ct=ct.replace('presentationml.template.main+xml','presentationml.presentation.main+xml')
  ct=re.sub(r'<Override[^>]*/ppt/slides/slide\\d+\\.xml[^>]*/>', '', ct)
  with open(ct_path,'w',encoding='utf-8') as f: f.write(ct)
  slides_dir=os.path.join(unpacked,'ppt','slides')
  rels_dir=os.path.join(slides_dir,'_rels')
  if os.path.isdir(slides_dir):
    for name in os.listdir(slides_dir):
      if re.match(r'slide\\d+\\.xml$',name): os.remove(os.path.join(slides_dir,name))
  if os.path.isdir(rels_dir):
    for name in os.listdir(rels_dir):
      if re.match(r'slide\\d+\\.xml\\.rels$',name): os.remove(os.path.join(rels_dir,name))
  prs_path=os.path.join(unpacked,'ppt','presentation.xml')
  with open(prs_path,encoding='utf-8') as f: prs_xml=f.read()
  prs_xml=re.sub(r'<p:sldId\\b[^/]*/>','',prs_xml)
  with open(prs_path,'w',encoding='utf-8') as f: f.write(prs_xml)
  prs_rels=os.path.join(unpacked,'ppt','_rels','presentation.xml.rels')
  with open(prs_rels,encoding='utf-8') as f: rels=f.read()
  rels=re.sub(r'<Relationship\\b[^>]+/slides/slide\\d+\\.xml[^>]*/>','',rels)
  with open(prs_rels,'w',encoding='utf-8') as f: f.write(rels)
  out=os.path.join(workdir,'template_patched.pptx')
  with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as zout:
    for dirpath,_,filenames in os.walk(unpacked):
      for name in filenames:
        full=os.path.join(dirpath,name)
        zout.write(full,os.path.relpath(full,unpacked))
  return out

def esc(text): return html.escape(str(text if text is not None else ''),quote=True)
def get_layout(prs,name):
  for layout in prs.slide_layouts:
    if layout.name==name: return layout
  raise ValueError(f"Layout '{name}' not found")

def make_para(text,bold=False,size_pt=12,color=None,space_before_pt=0):
  if color is None: color=DKBLUE
  col=f'{color[0]:02X}{color[1]:02X}{color[2]:02X}'
  bold_attr='b="1"' if bold else 'b="0"'
  xml=(
    '<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    '<a:pPr marL="0" indent="0" algn="l">'
    '<a:lnSpc><a:spcPct val="100000"/></a:lnSpc>'
    f'<a:spcBef><a:spcPts val="{int(space_before_pt*100)}"/></a:spcBef>'
    '<a:spcAft><a:spcPts val="0"/></a:spcAft><a:buNone/></a:pPr>'
    f'<a:r><a:rPr lang="en-GB" sz="{int(size_pt*100)}" {bold_attr} dirty="0">'
    f'<a:solidFill><a:srgbClr val="{col}"/></a:solidFill>'
    '<a:latin typeface="Calibri" panose="020F0502020204030204"/>'
    f'</a:rPr><a:t>{esc(text)}</a:t></a:r></a:p>'
  )
  return etree.fromstring(xml)

def set_ph_structured(slide,idx,paragraphs):
  for ph in slide.placeholders:
    if ph.placeholder_format.idx==idx:
      tf=ph.text_frame; tf.word_wrap=True; body=tf._txBody
      for p in body.findall(qn('a:p')): body.remove(p)
      for spec in paragraphs:
        body.append(make_para(spec.get('text',''),bold=spec.get('bold',False),
          size_pt=spec.get('size',12),color=spec.get('color',DKBLUE),
          space_before_pt=spec.get('space_before',0)))
      return ph

def set_ph_simple(slide,idx,text,size=12,bold=False,color=None):
  return set_ph_structured(slide,idx,[{'text':text,'bold':bold,'size':size,'color':color or DKBLUE}])

def reposition_placeholder(slide,idx,left_in,top_in,width_in,height_in):
  for ph in slide.placeholders:
    if ph.placeholder_format.idx==idx:
      sp=ph._element; xfrm=sp.find('.//' + qn('a:xfrm'))
      if xfrm is None:
        spPr=sp.find('.//' + qn('p:spPr')); xfrm=etree.SubElement(spPr,qn('a:xfrm'))
      off=xfrm.find(qn('a:off')); ext=xfrm.find(qn('a:ext'))
      if off is None: off=etree.SubElement(xfrm,qn('a:off'))
      if ext is None: ext=etree.SubElement(xfrm,qn('a:ext'))
      off.set('x',str(int(left_in*914400))); off.set('y',str(int(top_in*914400)))
      ext.set('cx',str(int(width_in*914400))); ext.set('cy',str(int(height_in*914400)))
      return ph

def add_footnote(slide,text,color=GREY,width_in=11.50):
  box=slide.shapes.add_textbox(Inches(0.89),Inches(6.62),Inches(width_in),Inches(0.34))
  box.text_frame.word_wrap=True
  body=box.text_frame._txBody
  for p in body.findall(qn('a:p')): body.remove(p)
  body.append(make_para(text,size_pt=8,color=color))

def drop_empty_placeholders(slide):
  for ph in list(slide.placeholders):
    try:
      if ph.placeholder_format.type==18: continue
    except Exception: pass
    if not ph.text_frame.text.strip(): ph._element.getparent().remove(ph._element)

class Block:
  def __init__(self,paras,splittable=False): self.paras=paras; self.splittable=splittable
  def height(self,width_in): return sum(para_height_in(p,width_in) for p in self.paras)

def para_height_in(para,width_in):
  text=para.get('text',''); size=para.get('size',12)
  cpl=CHARS_PER_LINE.get(size,128); cpl=max(20,int(cpl*(width_in/BODY_WIDTH_IN)))
  lines=max(1,math.ceil(len(text)/cpl)) if text else 1
  return lines*LINE_HEIGHT_IN.get(size,0.210)+para.get('space_before',0)/72.0

def capacity_in(): return BODY_HEIGHT_IN-0.20

def as_list(value):
  if value is None: return []
  if isinstance(value,list): return value
  return [value]

def resolve_source(entry):
  """Returns the human-readable source, or None when a cited id does not resolve.
  None means DROP the datapoint: never render a raw id, an empty citation, or a
  reconstructed string."""
  raw=str(entry.get('source_id') or '').strip()
  if not raw: return str(entry.get('source') or '').strip()
  key=raw if raw.startswith('[') else '[SRC:'+raw+']'
  hit=BINDINGS.get(key) or BINDINGS.get(raw)
  if not hit: return None
  return str(hit.get('canonical_string') or '').strip()

def stat_text(entry):
  if isinstance(entry,dict):
    stat=str(entry.get('stat','')).strip()
    source=resolve_source(entry)
    if source is None: return ''
    geo=str(entry.get('geography') or '').strip(); parts=[p for p in (source,geo) if p]
    return f'{stat}  ({", ".join(parts)})' if parts else stat
  return str(entry)

def signal_annotation(slide):
  """Build B — computed render-state. The record count is stamped from the frozen
  trend status, never read from slide prose. A cross-region slide already carries
  the provenance label and gets no second stamp."""
  if str(slide.get('evidence_class') or '')=='read_across': return ''
  st=TREND_STATUS.get(str(slide.get('trend_id') or ''))
  if not isinstance(st,dict): return ''
  if str(st.get('evidence_status') or '')!='signal_only': return ''
  n=int(st.get('record_count') or 0)
  return 'Signal \\u2014 %d regional launch%s on record'%(n,'' if n==1 else 'es')

def image_key_candidates(example):
  text=str(example); keys=[]
  match=re.search(r'\\b(\\d{6,9})\\b',text)
  if match: keys.append(match.group(1))
  name=re.split(r'\\s+[-\\u2013\\u2014(]|\\s+\\(',text)[0].strip()
  if name: keys.append(name.lower())
  keys.append(text.strip().lower()); return keys

def build_blocks(slide,images,size,text_colour=DKBLUE,header_colour=BLUE):
  blocks=[]; used_images=[]; gap=max(6,size/2)
  subtitle=(slide.get('subtitle') or '').strip()
  if subtitle:
    blocks.append(Block([{'text':subtitle,'bold':True,'size':size,'color':header_colour}]))
  # Build C — render-owned provenance banner. Shown ONLY on a cross-region slide,
  # and only from the label the renderer stamped: the architect never writes it.
  prov=(slide.get('provenance_label') or '').strip()
  if prov and str(slide.get('evidence_class') or '')=='read_across':
    blocks.append(Block([{'text':prov,'bold':True,'size':size,'color':ORANGE}]))
  sig=signal_annotation(slide)
  if sig:
    blocks.append(Block([{'text':sig,'size':size,'color':TEAL}]))
  signal=(slide.get('market_signal') or '').strip()
  if signal:
    paras=[{'text':line,'size':size,'color':text_colour,'space_before':gap if i==0 else 0}
           for i,line in enumerate(l for l in signal.split('\\n') if l.strip())]
    blocks.append(Block(paras))
  def section(header,items,prefix='',splittable=True):
    rows=[i for i in items if str(i).strip()]
    if not rows: return
    paras=[{'text':header,'bold':True,'size':size,'color':header_colour,'space_before':gap}]
    for item in rows: paras.append({'text':f'{prefix}{item}','size':size,'color':text_colour})
    blocks.append(Block(paras,splittable=splittable))
  section('Supporting data',[stat_text(d) for d in as_list(slide.get('supporting_data'))],prefix='\\u2022  ')
  why=(slide.get('why_it_may_matter') or '').strip()
  if why:
    blocks.append(Block([
      {'text':'Why it may matter','bold':True,'size':size,'color':header_colour,'space_before':gap},
      {'text':why,'size':size,'color':text_colour}]))
  section('Formulation and application questions it raises',
    as_list(slide.get('formulation_questions')),prefix='\\u2022  ')
  pains=[p.get('pain',p) if isinstance(p,dict) else p for p in as_list(slide.get('customer_pains'))]
  section('What this creates for manufacturers',pains,prefix='\\u2022  ')
  evidence=as_list(slide.get('gnpd_examples'))
  if evidence:
    paras=[{'text':'Market evidence (Mintel GNPD)','bold':True,'size':size,'color':header_colour,'space_before':gap}]
    for example in evidence:
      paras.append({'text':f'\\u2022  {example}','size':size,'color':text_colour})
      for key in image_key_candidates(example):
        if key in images and images[key] not in used_images:
          used_images.append(images[key]); break
    blocks.append(Block(paras,splittable=True))
  section('Conversation openers',as_list(slide.get('conversation_openers')),prefix='\\u2022  ')
  return blocks,used_images[:3]

def pack_blocks(blocks,width_in):
  cap=capacity_in(); pages,current,used=[],[],0.0
  def flush():
    nonlocal current,used; pages.append(current); current,used=[],0.0
  for block in blocks:
    need=block.height(width_in)
    if need>cap and block.splittable:
      if current: flush()
      head=block.paras[:1]; chunk=list(head)
      chunk_h=sum(para_height_in(p,width_in) for p in chunk)
      for para in block.paras[1:]:
        para_h=para_height_in(para,width_in)
        if chunk_h+para_h>cap and len(chunk)>1:
          current,used=chunk,chunk_h; flush()
          chunk=[dict(head[0],text=head[0]['text']+' (cont.)')] if head else []
          chunk_h=sum(para_height_in(p,width_in) for p in chunk)
        chunk.append(para); chunk_h+=para_h
      current,used=chunk,chunk_h; continue
    if current and used+need>cap: flush()
    current.extend(block.paras); used+=need
  if current: pages.append(current)
  return pages or [[]]

def pick_body_size(blocks,width_in):
  for size in (12,11,10):
    total=sum(sum(para_height_in(dict(p,size=size),width_in) for p in b.paras) for b in blocks)
    if total<=capacity_in(): return size
  return 10

def title_size(text,budget,base,minimum):
  if not text: return base
  if len(text)<=budget: return base
  return max(minimum,int(base*budget/len(text)))

def render_front_page(prs,data,report):
  slide=prs.slides.add_slide(get_layout(prs,'Alternative front page - Palsgaard blue'))
  title=(data.get('title') or 'Market intelligence').strip()
  if len(title)>BUDGET_FRONT_TITLE: report['warnings'].append(f'Front page title {len(title)} chars (budget {BUDGET_FRONT_TITLE}).')
  set_ph_simple(slide,0,title,size=title_size(title,BUDGET_FRONT_TITLE,36,24),bold=True,color=WHITE)
  second=data.get('subtitle') or ''
  if data.get('beta'): second='BETA — draft for review'+(f'  |  {second}' if second else '')
  if second: set_ph_simple(slide,1,second,size=14,color=LGOLD)
  set_ph_simple(slide,13,data.get('prepared_by') or 'Prepared by Palsgaard',size=12,color=LGOLD)
  drop_empty_placeholders(slide)

def render_breaking(prs,slide_data,index,report):
  layout_name=BREAKING_COLOURS[index%len(BREAKING_COLOURS)]
  slide=prs.slides.add_slide(get_layout(prs,layout_name))
  headline=(slide_data.get('title') or slide_data.get('slide_name') or 'Section').strip()
  if len(headline)>BUDGET_BREAKING_HEADLINE: report['warnings'].append(f'Breaking headline {len(headline)} chars.')
  set_ph_simple(slide,29,headline,size=title_size(headline,BUDGET_BREAKING_HEADLINE,32,20),bold=True,color=WHITE)
  subtitle=(slide_data.get('subtitle') or '').strip()
  if subtitle: set_ph_simple(slide,30,subtitle,size=18,color=LGOLD)
  drop_empty_placeholders(slide)

def render_methodology(prs,slide_data,preheader,report):
  layout_name='Full page content and preheader'
  slide=prs.slides.add_slide(get_layout(prs,layout_name))
  if preheader: set_ph_simple(slide,PREHEADER_IDX[layout_name],preheader,size=11,color=DKBLUE)
  title=slide_data.get('title') or 'How this report was evidenced'
  set_ph_simple(slide,0,title,size=title_size(title,BUDGET_CONTENT_TITLE,24,16),color=DKBLUE)
  lines=[l for l in str(slide_data.get('market_signal') or '').split('\\n') if l.strip()]
  lines+=[str(g) for g in as_list(slide_data.get('gnpd_examples'))]
  if not lines: report['warnings'].append('Methodology slide had no content lines.')
  size=11 if len(lines)<=18 else 10
  paras=[{'text':f'\\u2022  {l}','size':size,'color':DKBLUE} for l in lines]
  set_ph_structured(slide,BODY_IDX[layout_name],paras)
  report['methodology_lines']=len(lines); drop_empty_placeholders(slide)
  return [slide]

def render_implications(prs,slide_data,preheader,report):
  """Strategic implications slide: big insight title, a light-gold 'So what for
  manufacturers?' box and a sage 'Where Palsgaard supports' box. No body text,
  no product examples \\u2014 it interprets the trend slide before it."""
  layout_name='Full page content and preheader'
  slide=prs.slides.add_slide(get_layout(prs,layout_name))
  head=str(slide_data.get('preheader') or preheader or '').strip()
  if head: set_ph_simple(slide,PREHEADER_IDX[layout_name],head,size=11,bold=True,color=BLUE)
  title=str(slide_data.get('title') or 'Strategic implications').strip()
  if len(title)>BUDGET_IMPLICATIONS_TITLE:
    report['warnings'].append(f'Implications title {len(title)} chars (budget {BUDGET_IMPLICATIONS_TITLE}).')
  reposition_placeholder(slide,0,0.89,0.95,11.86,1.45)
  set_ph_simple(slide,0,title,size=title_size(title,BUDGET_IMPLICATIONS_TITLE,26,18),color=DKBLUE)
  boxes=[('So what for manufacturers?',as_list(slide_data.get('strategic_implications')),LGOLD,ORANGE,'\\u2192  '),
         ('Where Palsgaard supports',as_list(slide_data.get('palsgaard_support')),SAGE_LIGHT,BLUE,'\\u2713  ')]
  top=2.55
  for header,items,fill,hdr_colour,prefix in boxes:
    rows=[str(i).strip() for i in items if str(i).strip()]
    if not rows: continue
    height=0.62+0.36*len(rows)
    box=slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,Inches(0.89),Inches(top),Inches(11.86),Inches(height))
    box.fill.solid(); box.fill.fore_color.rgb=fill; box.line.fill.background()
    try: box.shadow.inherit=False
    except Exception: pass
    tb=slide.shapes.add_textbox(Inches(1.14),Inches(top+0.14),Inches(11.36),Inches(height-0.20))
    tb.text_frame.word_wrap=True; body=tb.text_frame._txBody
    for p in body.findall(qn('a:p')): body.remove(p)
    body.append(make_para(header,bold=True,size_pt=12,color=hdr_colour))
    for row in rows: body.append(make_para(prefix+row,size_pt=11,color=DKBLUE,space_before_pt=7))
    top+=height+0.24
  footer=str(slide_data.get('evidence_footer') or '').strip()
  if footer: add_footnote(slide,f'Sources: {footer}')
  drop_empty_placeholders(slide)
  return [slide]

def render_content(prs,slide_data,preheader,layout_name,images,report):
  dark=layout_name in DARK_LAYOUTS
  text_colour=LGOLD if dark else DKBLUE; header_colour=SAGE_LIGHT if dark else BLUE
  width=BODY_WIDTH_IN; probe,thumbs=build_blocks(slide_data,images,12,text_colour,header_colour)
  if thumbs: width=BODY_WIDTH_WITH_IMAGES_IN
  size=pick_body_size(probe,width); blocks,thumbs=build_blocks(slide_data,images,size,text_colour,header_colour)
  pages=pack_blocks(blocks,width)
  title=(slide_data.get('title') or slide_data.get('slide_name') or 'Slide').strip()
  if len(title)>BUDGET_CONTENT_TITLE: report['warnings'].append(f'Title {len(title)} chars.')
  made=[]
  for page_no,paras in enumerate(pages):
    slide=prs.slides.add_slide(get_layout(prs,layout_name))
    if preheader: set_ph_simple(slide,PREHEADER_IDX[layout_name],preheader,size=11,color=text_colour)
    shown=title if page_no==0 else f'{title} (cont.)'
    set_ph_simple(slide,0,shown,size=title_size(shown,BUDGET_CONTENT_TITLE,24,16),color=text_colour)
    body_idx=BODY_IDX[layout_name]; set_ph_structured(slide,body_idx,paras)
    if thumbs and page_no==0:
      reposition_placeholder(slide,body_idx,0.89,1.53,BODY_WIDTH_WITH_IMAGES_IN,BODY_HEIGHT_IN)
      place_thumbnails(slide,thumbs,report)
    footer=(slide_data.get('evidence_footer') or '').strip()
    if footer and page_no==len(pages)-1:
      add_footnote(slide,f'Sources: {footer}',color=LGOLD if dark else GREY,
        width_in=BODY_WIDTH_WITH_IMAGES_IN if thumbs else 11.50)
    drop_empty_placeholders(slide); made.append(slide)
  return made

def place_thumbnails(slide,filenames,report):
  for i,name in enumerate(filenames[:3]):
    if not os.path.isfile(name): report['warnings'].append(f"Pack shot '{name}' not found."); continue
    top=THUMB_TOPS_IN[i]
    try:
      pic=slide.shapes.add_picture(name,Inches(THUMB_LEFT_IN),Inches(top))
      nw=pic.width/914400; nh=pic.height/914400
      if nw<=0 or nh<=0: pic._element.getparent().remove(pic._element); continue
      scale=min(THUMB_BOX_W_IN/nw,THUMB_BOX_H_IN/nh); w,h=nw*scale,nh*scale
      pic.width=Inches(w); pic.height=Inches(h)
      pic.left=Inches(THUMB_LEFT_IN+(THUMB_BOX_W_IN-w)/2); pic.top=Inches(top+(THUMB_BOX_H_IN-h)/2)
      report['images_placed']+=1
    except Exception as exc: report['warnings'].append(f"Pack shot '{name}' failed: {exc}")

def build(data,template_path,out_path,workdir):
  report={'slides_in':0,'slides_out':0,'continuations':0,'images_placed':0,'warnings':[],'sections_rendered':0}
  patched=patch_template(template_path,workdir)
  prs=Presentation(patched)
  if len(prs.slides)!=0: raise RuntimeError(f'Patched template has {len(prs.slides)} artefact slides.')
  global BINDINGS,TREND_STATUS
  BINDINGS={str(k):v for k,v in (data.get('bindings') or {}).items() if isinstance(v,dict)}
  TREND_STATUS={str(k):v for k,v in (data.get('trend_status') or {}).items() if isinstance(v,dict)}
  images={str(k).lower():v for k,v in (data.get('images') or {}).items()}
  preheader=data.get('preheader') or ''; slides=data.get('slides') or []
  report['slides_in']=len(slides); render_front_page(prs,data,report)
  section_index=0; last_layout=None
  for entry in slides:
    kind=entry.get('slide_type')
    if kind=='section_header':
      render_breaking(prs,entry,section_index,report); section_index+=1; continue
    if kind=='implications':
      made=render_implications(prs,entry,preheader,report); last_layout='Full page content and preheader'
    elif kind=='methodology':
      made=render_methodology(prs,entry,preheader,report); last_layout='Full page content and preheader'
    else:
      layout_name=next((n for n in CONTENT_LAYOUTS if n!=last_layout),CONTENT_LAYOUTS[0])
      made=render_content(prs,entry,preheader,layout_name,images,report); last_layout=layout_name
    report['slides_out']+=len(made); report['continuations']+=max(0,len(made)-1)
    for field in ('market_signal','why_it_may_matter','supporting_data','formulation_questions',
                  'gnpd_examples','conversation_openers','customer_pains'):
      if entry.get(field): report['sections_rendered']+=1
  prs.save(out_path); return validate(out_path,data,report)

def validate(out_path,data,report):
  prs=Presentation(out_path); report['total_slides']=len(prs.slides)
  placeholder_leak=0
  for slide in prs.slides:
    for shape in slide.shapes:
      if not shape.has_text_frame: continue
      text=shape.text_frame.text.strip()
      if 'Click to edit' in text or text.startswith('Click to add'): placeholder_leak+=1
  if placeholder_leak: report['warnings'].append(f'{placeholder_leak} placeholder(s) show template prompt text.')
  expected_min=1+len(data.get('slides') or [])
  if len(prs.slides)<expected_min:
    report['warnings'].append(f'Deck has {len(prs.slides)} slides, expected ≥{expected_min}.')
  report['ok']=not report['warnings']; return report

def main():
  ap=argparse.ArgumentParser(); ap.add_argument('--data'); ap.add_argument('--out',default='report.pptx')
  ap.add_argument('--template'); ap.add_argument('--workdir',default=os.environ.get('TMPDIR','/tmp'))
  args=ap.parse_args()
  if not args.data: print(json.dumps({'ok':False,'error':'--data required'})); return 2
  try:
    with open(args.data,encoding='utf-8') as f: data=json.load(f)
  except (OSError,json.JSONDecodeError) as exc:
    print(json.dumps({'ok':False,'error':f'bad --data: {exc}'})); return 2
  if not isinstance(data.get('slides'),list) or not data['slides']:
    print(json.dumps({'ok':False,'error':'data.slides must be a non-empty list'})); return 2
  try: template=find_template(args.template)
  except FileNotFoundError as exc: print(json.dumps({'ok':False,'error':str(exc)})); return 3
  os.makedirs(args.workdir,exist_ok=True)
  try: result=build(data,template,args.out,args.workdir)
  except Exception as exc: print(json.dumps({'ok':False,'error':f'{type(exc).__name__}: {exc}'})); return 3
  result['template']=template; result['out']=args.out
  print(json.dumps(result,indent=2)); return 0 if result.get('ok') else 4

if __name__=='__main__': sys.exit(main())
`;

// ---------- synchronous streaming runner ----------

// Streams a /v1/messages call with build_deck.py + data.json + pack shots.
// Returns the finished Anthropic message object.
export async function runSkillStream(
  uploads: Array<{ file_id: string; filename: string }>,
  dataJson: string,
  onStageDetail: (detail: string) => void,
): Promise<{ message: unknown; usage: { input_tokens: number; output_tokens: number } }> {
  // Upload data.json
  const dataForm = new FormData();
  dataForm.append('file', new Blob([dataJson], { type: 'application/json' }), 'data.json');
  const dataUp = await fetchWithRetry(
    `${API}/v1/files`, { method: 'POST', headers: anthropicHeaders(), body: dataForm }, 'upload data.json'
  );
  const dataMeta = await dataUp.json();
  const dataFileId: string = dataMeta.id;

  // Upload build_deck.py
  const scriptForm = new FormData();
  scriptForm.append('file', new Blob([BUILD_DECK_PY], { type: 'text/x-python' }), 'build_deck.py');
  const scriptUp = await fetchWithRetry(
    `${API}/v1/files`, { method: 'POST', headers: anthropicHeaders(), body: scriptForm }, 'upload build_deck.py'
  );
  const scriptMeta = await scriptUp.json();
  const scriptFileId: string = scriptMeta.id;

  const allFileIds = [scriptFileId, dataFileId, ...uploads.map(u => u.file_id)];

  const body = {
    model: MODEL,
    max_tokens: 4096,
    stream: true,
    container: { skills: [{ type: 'custom', skill_id: SKILL_ID, version: 'latest' }] },
    tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
    messages: [{
      role: 'user',
      content: [
        ...allFileIds.map(id => ({ type: 'container_upload', file_id: id })),
        {
          type: 'text',
          text: [
            'Use the Palsgaard PowerPoint skill. A deterministic build script and data file are already in your working directory.',
            '',
            'Run this exact command and nothing else:',
            '```bash',
            'python3 build_deck.py --data data.json --out report.pptx',
            '```',
            '',
            'The script produces report.pptx. Do not modify the script. Do not write any python-pptx code yourself.',
            'If the script exits with code 4, the deck was built with warnings — still upload report.pptx.',
            'If the script exits with code 2 or 3, report the JSON error output and stop.',
          ].join('\n'),
        },
      ],
    }],
  };

  const res = await fetchWithRetry(
    `${API}/v1/messages`,
    { method: 'POST', headers: anthropicHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(body) },
    'POST /v1/messages',
  );

  // Consume the SSE stream.
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const contentBlocks: unknown[] = [];
  let usage = { input_tokens: 0, output_tokens: 0 };
  let messageId = '';
  let codeBlockIndex = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      let evt: Record<string, unknown>;
      try { evt = JSON.parse(payload); } catch { continue; }

      if (evt.type === 'message_start') {
        const msg = evt.message as Record<string, unknown>;
        messageId = msg.id as string;
        const u = msg.usage as Record<string, number> | undefined;
        if (u) usage.input_tokens = u.input_tokens ?? 0;
      }
      if (evt.type === 'content_block_start') {
        const block = evt.content_block as Record<string, unknown>;
        const index = Number(evt.index ?? contentBlocks.length);
        // Server-tool result blocks (code execution) arrive COMPLETE in this
        // event — including the nested file outputs storeGeneratedPptx needs.
        contentBlocks[index] = { ...block, index };
        if (String(block?.type ?? '').includes('tool_use')) { codeBlockIndex++; onStageDetail(`Running build step ${codeBlockIndex}`); }
      }
      if (evt.type === 'content_block_delta') {
        const delta = evt.delta as Record<string, unknown>;
        const index = Number(evt.index ?? -1);
        const target = contentBlocks[index] as Record<string, unknown> | undefined;
        if (delta?.type === 'text_delta') {
          if (target) target.text = String(target.text ?? '') + String(delta.text ?? '');
          const text = String(delta.text ?? '').slice(-120);
          if (text.trim()) onStageDetail(text);
        } else if (delta?.type === 'input_json_delta') {
          if (target) target._partial_json = String(target._partial_json ?? '') + String(delta.partial_json ?? '');
        }
      }
      if (evt.type === 'message_delta') {
        const u = evt.usage as Record<string, number> | undefined;
        if (u) usage.output_tokens = u.output_tokens ?? 0;
      }
      if (evt.type === 'content_block_stop') {
        const index = Number(evt.index ?? -1);
        const target = contentBlocks[index] as Record<string, unknown> | undefined;
        if (target && typeof target._partial_json === 'string') {
          try { target.input = JSON.parse(target._partial_json as string); } catch { /* keep raw partial */ }
          delete target._partial_json;
        }
      }
    }
  }

  // Accumulate content blocks from the SSE stream directly.
  // No retrieval endpoint exists for synchronous messages.
  const fullMessage = {
    id: messageId,
    content: contentBlocks.filter(Boolean),
    usage,
  };

  // Clean up uploaded helper files — pack shots are cleaned up by the caller.
  for (const id of [scriptFileId, dataFileId]) {
    fetch(`${API}/v1/files/${id}`, { method: 'DELETE', headers: anthropicHeaders() }).catch(() => {});
  }

  return { message: fullMessage, usage };
}

// Pulls the generated .pptx out of a finished message and stores it on Base44.
// Walks content blocks structurally instead of regex-scraping JSON.stringify output.
export async function storeGeneratedPptx(
  base44,
  message: Record<string, unknown>,
  uploadedPackShotIds: string[],
): Promise<string> {
  const excluded = new Set(uploadedPackShotIds);

  // Walk content blocks for code-execution file outputs. The result blocks are
  // typed `code_execution_tool_result` / `bash_code_execution_tool_result` (not
  // plain `tool_result`), and their file outputs sit NESTED (content.content[])
  // with a file_id but no filename — so file_ids are collected recursively and
  // the filename fetched from file metadata.
  const content = (message?.content as unknown[]) ?? [];
  const candidates: Array<{ id: string; filename: string }> = [];

  function collectFileIds(node: unknown, into: Set<string>) {
    if (Array.isArray(node)) { for (const item of node) collectFileIds(item, into); return; }
    if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      if (typeof o.file_id === 'string' && o.file_id) into.add(o.file_id);
      for (const v of Object.values(o)) collectFileIds(v, into);
    }
  }

  const found = new Set<string>();
  for (const block of content) {
    const b = block as Record<string, unknown>;
    if (!String(b.type ?? '').includes('tool_result')) continue;
    collectFileIds(b, found);
  }
  for (const id of found) {
    if (excluded.has(id)) continue;
    const mRes = await fetch(`${API}/v1/files/${id}`, { headers: anthropicHeaders() });
    if (!mRes.ok) continue;
    const m = await mRes.json();
    candidates.push({ id, filename: String(m.filename || '') });
  }

  // Fallback: scan all file_id values in stringified content (preserves backward compat).
  if (candidates.length === 0) {
    const ids = [...new Set(
      [...JSON.stringify(content).matchAll(/"file_id"\s*:\s*"(file_[A-Za-z0-9]+)"/g)].map(m => m[1])
    )].filter(id => !excluded.has(id));
    for (const id of ids) {
      const mRes = await fetch(`${API}/v1/files/${id}`, { headers: anthropicHeaders() });
      if (!mRes.ok) continue;
      const m = await mRes.json();
      candidates.push({ id, filename: m.filename || '' });
    }
  }

  const pptx = candidates.filter(c => c.filename.toLowerCase().endsWith('.pptx')).pop();
  if (!pptx) throw new Error('Claude finished but produced no .pptx file');

  const dl = await fetch(`${API}/v1/files/${pptx.id}/content`, { headers: anthropicHeaders() });
  if (!dl.ok) throw new Error(`Could not download the generated file (${dl.status})`);
  const bytes = await dl.arrayBuffer();
  const file  = new File([bytes], pptx.filename, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });

  // Delete the pptx from Anthropic Files after storing it.
  fetch(`${API}/v1/files/${pptx.id}`, { method: 'DELETE', headers: anthropicHeaders() }).catch(() => {});

  return file_url;
}