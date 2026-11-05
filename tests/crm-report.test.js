const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { setup, teardown, call, model, controller, load, sentEmails } = require('./helpers')

const m = model
const ok = (cond, msg) => assert.ok(cond, msg)
const fails = 0
let L, O, A, R

before(async () => {
    await setup()
    L = controller('crm/leadsController')
    O = controller('crm/opportunitiesController')
    A = controller('crm/activitiesController')
    R = controller('crm/crmReportsController')
})
after(teardown)

test('relatório de vendas, oportunidades do cliente e tools do MCP', async () => {
  const db = load('db').default
  const Seller=m('Seller'), Hist=m('OpportunityStageHistory'), Opp=m('Opportunity')
  const A=await Seller.create({name:'Vendedor A',commission_percent:10,commission_base:'liquido',applies_to:'ambos'})
  const B=await Seller.create({name:'Vendedor B',commission_percent:10,commission_base:'liquido',applies_to:'ambos'})
  const l1=(await call(L.store,{body:{name:'L1',source:'Indicação'}})).body
  const l2=(await call(L.store,{body:{name:'L2',source:'Site'}})).body
  const mk=async(title,LeadId,SellerId,v)=>(await call(O.store,{body:{title,LeadId,SellerId,estimated_value:v}})).body
  const w1=await mk('W1',l1.id,A.id,1000), w2=await mk('W2',l2.id,A.id,3000), p1=await mk('P1',l1.id,A.id,500), o1=await mk('O1',l2.id,B.id,2000)
  for (const o of [w1,w2]) { await call(O.stage,{params:{id:o.id},body:{stage:'Proposta'}}); await call(O.win,{params:{id:o.id},body:{mode:'none'}}) }
  await call(O.stage,{params:{id:p1.id},body:{stage:'Perdido',lost_reason:'Preço'}})
  await call(O.stage,{params:{id:o1.id},body:{stage:'Proposta'}})
  // histórico com datas conhecidas para W1: Novo (dia 0) -> Proposta (dia 2) -> Ganho (dia 5); criação no dia 0
  const base=Date.now()-10*86400e3
  const hs=await Hist.findAll({where:{OpportunityId:w1.id},order:[['id','ASC']]})
  const days=[0,2,5]; for (let i=0;i<hs.length;i++) await db.query('UPDATE opportunity_stage_histories SET createdAt=? WHERE id=?',{replacements:[new Date(base+days[i]*86400e3),hs[i].id]})
  await db.query('UPDATE opportunities SET createdAt=?, won_at=? WHERE id=?',{replacements:[new Date(base),new Date(base+5*86400e3),w1.id]})
  await Opp.update({expected_close_date:new Date().toISOString().slice(0,10)},{where:{id:o1.id}})

  const start=new Date(base-86400e3).toISOString().slice(0,10), end=new Date().toISOString().slice(0,10)
  let r=await call(R.index,{query:{startDate:start,endDate:end}}); const x=r.body
  ok(x.period.won===2 && x.period.lost===1,'ganhas 2 / perdidas 1')
  ok(Math.abs(x.period.conversion_rate-66.67)<0.01,'conversão 66,67% = '+x.period.conversion_rate)
  ok(x.period.avg_ticket===2000 && x.period.won_value===4000,'ticket médio 2.000')
  const prop=x.pipeline.stages.find(s=>s.stage==='Proposta'); ok(prop.count===1 && prop.value===2000 && prop.weighted===1000,'funil Proposta 1/2000/1000')
  ok(x.lost_reasons[0].reason==='Preço' && x.lost_reasons[0].value===500,'motivo de perda Preço')
  const a=x.by_seller.find(g=>g.name==='Vendedor A'); ok(a.won===2 && a.lost===1 && a.won_value===4000,'por vendedor A')
  const bb=x.by_seller.find(g=>g.name==='Vendedor B'); ok(bb.open_count===1 && bb.open_value===2000,'por vendedor B aberto')
  ok(x.by_source.find(g=>g.name==='Indicação').lost===1 && x.by_source.find(g=>g.name==='Site').won===1,'por origem')
  const stN=x.stage_time.find(s=>s.stage==='Novo'), stP=x.stage_time.find(s=>s.stage==='Proposta')
  ok(stN.samples===3 && stP.samples===2,'tempo por etapa amostras '+JSON.stringify(x.stage_time))
  ok(stP.avg_days>=1.49 && stP.avg_days<=1.51,'Proposta: média (3 + ~0)/2 = 1,5 dia ('+stP.avg_days+')')
  ok(x.forecast[0].count===1 && x.forecast[0].weighted===1000,'previsão do mês')
  ok(x.period.avg_cycle_days!==null && x.period.avg_cycle_days>2.4 && x.period.avg_cycle_days<2.6,'ciclo médio ~2,5 dias ('+x.period.avg_cycle_days+')')
  r=await call(R.index,{query:{startDate:start,endDate:end,SellerId:B.id}}); ok(r.body.period.won===0 && r.body.period.lost===0 && r.body.pipeline.total.count===1,'filtro vendedor B')
  r=await call(R.index,{query:{startDate:start,endDate:end,source:'Site'}}); ok(r.body.period.won===1 && r.body.pipeline.total.count===1,'filtro origem Site')
  r=await call(R.index,{query:{startDate:'2020-01-01',endDate:'2020-01-31'}}); ok(r.body.period.won===0 && r.body.pipeline.total.count===1,'período sem fechadas mantém funil')
  // oportunidades do cliente incluem as de quando era lead
  const lead3=(await call(L.store,{body:{name:'L3'}})).body
  const old=await mk('Antiga',lead3.id,null,100); await call(O.stage,{params:{id:old.id},body:{stage:'Perdido',lost_reason:'Timing'}})
  const nova=await mk('Nova',lead3.id,null,200); const win=(await call(O.win,{params:{id:nova.id},body:{mode:'none'}})).body
  r=await call(O.index,{query:{status:'all',ClientId:win.ClientId}}); ok(r.body.some(o=>o.id===old.id) && r.body.some(o=>o.id===nova.id),'cliente vê oportunidades de quando era lead')
  // MCP: tools reais via servidor MCP em memória
  const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
  const app=load('app').default; await app.ready()
  const registerTools=load('mcp/tools').default
  const srv=new McpServer({name:'t',version:'1'}); registerTools(srv, app)
  const tools=srv._registeredTools
  const run=async(n,args)=>{const t=tools[n]; const out=await t.handler(args,{}); return out}
  ok(['crm_leads','crm_opportunities','crm_activities','crm_opportunity_stage','crm_opportunity_win','crm_followups','crm_report'].every(n=>tools[n]),'tools do CRM registradas')
  let out=await run('crm_leads',{action:'list'}); ok(!out.isError && out.content[0].text.includes('L1'),'MCP crm_leads list')
  out=await run('crm_opportunity_stage',{opportunity_id:o1.id,stage:'Negociação'}); ok(!out.isError && out.content[0].text.includes('Negociação'),'MCP crm_opportunity_stage')
  out=await run('crm_report',{startDate:start,endDate:end}); ok(!out.isError && out.content[0].text.includes('conversion_rate'),'MCP crm_report')
  out=await run('crm_opportunity_stage',{opportunity_id:o1.id,stage:'Perdido'}); ok(out.isError || out.content[0].text.includes('motivo'),'MCP perda sem motivo recusada')
  
})
