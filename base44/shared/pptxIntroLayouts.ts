// Dedicated introductory layouts, embedded in the deterministic Python renderer.
export const INTRO_LAYOUTS_PY = `
def intro_text(slide,x,y,w,h,paras):
  box=slide.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h))
  tf=box.text_frame; tf.word_wrap=True
  tf.margin_left=tf.margin_right=0; tf.margin_top=tf.margin_bottom=0
  body=tf._txBody
  for p in body.findall(qn('a:p')): body.remove(p)
  for p in paras:
    body.append(make_para(p.get('text',''),size_pt=p.get('size',14),
      bold=p.get('bold',False),italic=p.get('italic',False),
      color=p.get('color',DKBLUE),space_before_pt=p.get('space_before',0)))
  return box

def render_opening(prs,slide_data,preheader,report):
  """Editorial opening: bold headline, italic deck, narrative and inset agenda."""
  layout_name='Full page content and preheader'
  remaining=dict(slide_data)
  subtitle=str(remaining.pop('subtitle','') or '').strip()
  signal=str(remaining.pop('market_signal','') or '').strip()
  agenda=[str(i) for i in as_list(remaining.pop('agenda_items',[])) if str(i).strip()]
  blocks=[]
  if subtitle: blocks.append(('text',[{'text':subtitle,'size':14,'italic':True}]))
  if signal: blocks.append(('text',[{'text':signal,'size':14}]))
  extra,_=build_blocks(remaining,14,DKBLUE,TEAL,'opening')
  for block in extra: blocks.append(('text',block.paras))
  for item in agenda: blocks.append(('agenda',[{'text':item,'size':14}]))
  pages=[]; current=[]; used=0.0
  for kind,paras in blocks:
    width=11.18 if kind=='agenda' else 11.86
    height=sum(para_height_in(p,width) for p in paras)+0.18
    if kind=='agenda': height+=0.60
    if current and used+height>3.35:
      pages.append(current); current=[]; used=0.0
    current.append((kind,paras,height)); used+=height
  if current or not pages: pages.append(current)
  made=[]
  for n,items in enumerate(pages):
    slide=prs.slides.add_slide(get_layout(prs,layout_name))
    head=str(slide_data.get('preheader') or preheader or '')
    reposition_placeholder(slide,PREHEADER_IDX[layout_name],0.89,1.32,11.86,0.28)
    set_ph_simple(slide,PREHEADER_IDX[layout_name],head,size=11,color=TEAL)
    title=str(slide_data.get('title') or 'In this report')+(' (cont.)' if n else '')
    reposition_placeholder(slide,0,0.89,1.72,11.86,1.20)
    set_ph_simple(slide,0,title,size=28,bold=True,color=DKBLUE)
    set_ph_simple(slide,BODY_IDX[layout_name],'')
    top=3.12; i=0
    while i<len(items):
      kind,paras,height=items[i]
      if kind=='agenda':
        rows=list(paras); i+=1
        while i<len(items) and items[i][0]=='agenda':
          rows+=items[i][1]; height+=items[i][2]-0.60; i+=1
        panel=slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,Inches(0.89),Inches(top),Inches(11.86),Inches(height))
        panel.adjustments[0]=0.035
        panel.fill.solid(); panel.fill.fore_color.rgb=LGOLD
        panel.line.color.rgb=RGBColor(0xBC,0xCF,0xD5); panel.line.width=Pt(1)
        bar=slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,Inches(0.89),Inches(top),Inches(0.08),Inches(height))
        bar.fill.solid(); bar.fill.fore_color.rgb=TEAL; bar.line.fill.background()
        intro_text(slide,1.23,top+0.18,11.18,height-0.28,
          [{'text':'In this report','size':16,'bold':True}]+[dict(p,space_before=9) for p in rows])
      else:
        intro_text(slide,0.89,top,11.86,height,paras); i+=1
      top+=height
    footer=str(slide_data.get('evidence_footer') or '').strip()
    if footer and n==len(pages)-1: add_footnote(slide,'Sources: '+footer)
    drop_empty_placeholders(slide); made.append(slide)
  return made

def render_about(prs,slide_data,preheader,report):
  """Vertically balanced AI notice with a warm yellow warning panel."""
  layout_name='Full page content and preheader'
  slide=prs.slides.add_slide(get_layout(prs,layout_name))
  reposition_placeholder(slide,PREHEADER_IDX[layout_name],0.89,2.55,11.86,0.28)
  if preheader: set_ph_simple(slide,PREHEADER_IDX[layout_name],preheader,size=11,color=TEAL)
  reposition_placeholder(slide,0,0.89,2.96,11.86,0.68)
  set_ph_simple(slide,0,str(slide_data.get('title') or ABOUT_TITLE),size=30,bold=True,color=DKBLUE)
  notice=str(slide_data.get('market_signal') or '').strip() or AI_NOTICE
  set_ph_simple(slide,BODY_IDX[layout_name],'')
  height=max(1.18,para_height_in({'text':notice,'size':14},10.80)+0.55)
  panel=slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,Inches(0.89),Inches(3.92),Inches(11.86),Inches(height))
  panel.adjustments[0]=0.06
  panel.fill.solid(); panel.fill.fore_color.rgb=RGBColor(0xFC,0xF3,0xB0)
  panel.line.fill.background()
  warning=slide.shapes.add_shape(MSO_SHAPE.ISOSCELES_TRIANGLE,Inches(1.14),Inches(4.26),Inches(0.19),Inches(0.18))
  warning.fill.background(); warning.line.color.rgb=RGBColor(0xB4,0x98,0x00)
  intro_text(slide,1.208,4.295,0.08,0.14,[{'text':'!','size':7,'bold':True,'color':RGBColor(0xB4,0x98,0x00)}])
  intro_text(slide,1.55,4.20,10.80,height-0.40,[{'text':notice,'size':14,'color':DKBLUE}])
  drop_empty_placeholders(slide)
  return [slide]
`;