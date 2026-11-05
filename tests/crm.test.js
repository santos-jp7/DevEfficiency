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

test('leads, oportunidades, etapas e follow-ups', async () => {; console.log('sync ok')
  const sup=await m('Supplier').create({name:'Bitdefender '+Date.now(),default_commission_percent:20})
  let r=await call(L.store,{body:{name:'Fulano',company:'ACME',email:'f@acme.com',source:'Indicação'}}); ok(r.code===201,'lead criado')
  const lead=r.body
  r=await call(L.store,{body:{name:''}}); ok(r.code===400,'lead sem nome: 400')
  r=await call(L.store,{body:{name:'x',source:'Rádio'}}); ok(r.code===400,'origem inválida: 400')
  r=await call(O.store,{body:{title:'Licenças BD',LeadId:lead.id,estimated_value:5000,billing_mode:'Comissão',CommissionSupplierId:sup.id}})
  ok(r.code===201 && r.body.stage==='Novo' && r.body.probability===10 && r.body.commission_percent===20,'oportunidade criada c/ % do fornecedor '+JSON.stringify({c:r.code,s:r.body?.stage,p:r.body?.probability,cp:r.body?.commission_percent,m:r.body?.message}))
  const opp=r.body
  r=await call(O.store,{body:{title:'Sem vínculo'}}); ok(r.code===400,'sem lead/cliente: 400 '+r.body?.message)
  r=await call(O.stage,{params:{id:opp.id},body:{stage:'Proposta'}}); ok(r.code===200 && r.body.stage==='Proposta' && r.body.probability===50,'move p/ Proposta (50%)')
  r=await call(O.stage,{params:{id:opp.id},body:{stage:'Perdido'}}); ok(r.code===400,'perdido sem motivo: 400')
  r=await call(O.stage,{params:{id:opp.id},body:{stage:'Perdido',lost_reason:'Preço',lost_details:'caro'}}); ok(r.code===200 && r.body.lost_at && r.body.lost_reason==='Preço','perdido c/ motivo')
  r=await call(O.stage,{params:{id:opp.id},body:{stage:'Negociação'}}); ok(r.code===200 && !r.body.lost_at && !r.body.lost_reason,'reaberto limpa perda')
  r=await call(A.store,{body:{OpportunityId:opp.id,type:'Ligação',subject:'Retornar',due_at:new Date(Date.now()-3600e3)}}); ok(r.code===201 && r.body.LeadId===lead.id,'atividade herda lead')
  const act=r.body
  r=await call(A.store,{body:{subject:'solta'}}); ok(r.code===400,'atividade sem vínculo: 400')
  r=await call(O.index,{query:{}}); const row=r.body.find(o=>o.id===opp.id)
  ok(row && row.next_followup && row.next_followup.id===act.id,'kanban traz próximo follow-up')
  r=await call(A.followups,{query:{range:'overdue'}}); ok(r.body.items.some(a=>a.id===act.id) && r.body.overdue>=1,'follow-up atrasado listado')
  r=await call(A.done,{params:{id:act.id}}); r=await call(A.followups,{query:{range:'week'}}); ok(!r.body.items.some(a=>a.id===act.id),'concluída sai dos follow-ups')
  r=await call(O.show,{params:{id:opp.id}}); ok(r.body.OpportunityStageHistories.map(h=>h.to_stage).join('>')==='Novo>Proposta>Perdido>Negociação','histórico: '+r.body.OpportunityStageHistories.map(h=>h.to_stage).join('>'))
  r=await call(O.index,{query:{q:'ACME'}}); ok(r.body.some(o=>o.id===opp.id),'busca pelo nome da empresa do lead')
  r=await call(O.index,{query:{source:'Indicação'}}); ok(r.body.some(o=>o.id===opp.id),'filtro por origem')
  r=await call(O.reorder,{body:{ids:[opp.id]}}); ok(r.body.ok,'reorder')
  r=await call(L.destroy,{params:{id:lead.id}}); ok(r.code===400,'não exclui lead com oportunidade')
  r=await call(O.update,{params:{id:opp.id},body:{title:'Licenças BD 50',commission_value:900}}); ok(r.code===200 && r.body.commission_manual && r.body.commission_value===900,'comissão manual na oportunidade')
  const act2=(await call(A.store,{body:{OpportunityId:opp.id,subject:'Pendente perdida',due_at:new Date(Date.now()-60e3)}})).body
  await call(O.stage,{params:{id:opp.id},body:{stage:'Perdido',lost_reason:'Timing'}})
  r=await call(A.followups,{query:{range:'overdue'}}); ok(!r.body.items.some(a=>a.id===act2.id),'follow-up de oportunidade perdida não aparece')
  const lone=(await call(A.store,{body:{LeadId:lead.id,subject:'Só lead',due_at:new Date(Date.now()-60e3)}})).body
  r=await call(A.followups,{query:{range:'overdue'}}); ok(r.body.items.some(a=>a.id===lone.id),'follow-up só de lead aparece')
  
})

test('ganhar oportunidade: cliente a partir do lead, OS, protocolo, compensação e aviso diário', async () => {
  const [Client,Contact,Billing,Protocol,Supplier,Product,Seller,Service_order,Lead]=['Client','Contact','Billing','Protocol','Supplier','Product','Seller','Service_order','Lead'].map(m)
  const sup=await Supplier.create({name:'MS '+Date.now(),default_commission_percent:15})
  const prod=await Product.create({description:'M365 crm',value:1000})
  const seller=await Seller.create({name:'Vend CRM',commission_percent:10,commission_base:'liquido',applies_to:'ambos'})
  const clientsBefore=await Client.count()

  // 1) lead novo -> protocolo por comissão
  const lead=(await call(L.store,{body:{name:'João',company:'Nova Ltda '+Date.now(),email:'j@nova.com',whatsapp:'11999',document:'12.345.678/0001-90',SellerId:seller.id}})).body
  const opp=(await call(O.store,{body:{title:'Licenças MS',LeadId:lead.id,estimated_value:900,billing_mode:'Comissão',CommissionSupplierId:sup.id,commission_value:132.40}})).body
  let r=await call(O.win,{params:{id:opp.id},body:{mode:'protocol',products:[{ProductId:prod.id,value:1000}]}})
  ok(r.code===201,'win protocolo '+r.code+' '+(r.body?.message||''))
  const w=r.body
  const cli=await Client.findByPk(w.ClientId); ok(cli && cli.name.startsWith('Nova Ltda') && cli.document==='12345678000190' && w.created_client,'cliente criado do lead '+JSON.stringify(cli&&{n:cli.name,d:cli.document}))
  ok(await Contact.count({where:{ClientId:w.ClientId,whatsapp:'11999'}})===1,'contato criado')
  const l2=await Lead.findByPk(lead.id); ok(l2.status==='Convertido' && l2.ClientId===w.ClientId,'lead convertido')
  const p=await Protocol.findByPk(w.ProtocolId); ok(p.billing_mode==='Comissão' && p.status==='Liberado para pagamento' && p.SellerId===seller.id && p.commission_value===132.4,'protocolo comissão liberado com vendedor')
  const b=await Billing.findByPk(w.BillingId); ok(b && b.SupplierId===sup.id && Number(b.total_value)>=132.4,'cobrança ao fornecedor')
  ok(w.opportunity.stage==='Ganho' && w.opportunity.ProtocolId===w.ProtocolId && w.opportunity.estimated_value===1000,'oportunidade ganha, valor real 1000')

  // 3) já convertida
  r=await call(O.win,{params:{id:opp.id},body:{mode:'os'}}); ok(r.code===400,'já convertida: 400')

  // 2) cliente existente -> OS
  const opp2=(await call(O.store,{body:{title:'Projeto site',ClientId:w.ClientId,SellerId:seller.id,estimated_value:5000}})).body
  const n=await Client.count()
  r=await call(O.win,{params:{id:opp2.id},body:{mode:'os',gravidade:'Médio'}})
  ok(r.code===201 && r.body.ServiceOrderId && !r.body.created_client && await Client.count()===n,'win OS em cliente existente '+(r.body?.message||''))
  const os=await Service_order.findByPk(r.body.ServiceOrderId); ok(os.subject==='Projeto site' && os.ClientId===w.ClientId,'OS com assunto/cliente')
  const op=await Protocol.findByPk(r.body.ProtocolId); ok(op && op.ServiceOrderId===os.id && op.SellerId===seller.id,'protocolo da OS com vendedor')

  // 4) item inválido em lead novo -> 400 e nenhum cliente
  const lead3=(await call(L.store,{body:{name:'Sem itens'}})).body
  const opp3=(await call(O.store,{body:{title:'X',LeadId:lead3.id}})).body
  const c3=await Client.count()
  r=await call(O.win,{params:{id:opp3.id},body:{mode:'protocol',products:[{ProductId:999999,value:10}]}})
  ok(r.code===400 && await Client.count()===c3,'item inválido: 400 sem cliente novo ('+r.body?.message+')')
  r=await call(O.win,{params:{id:opp3.id},body:{mode:'protocol'}}); ok(r.code===400,'sem itens: 400')
  r=await call(O.win,{params:{id:opp3.id},body:{mode:'xyz'}}); ok(r.code===400,'modo inválido: 400')

  // 5) falha forçada depois de criar cliente (desconto maior que o total) -> compensação
  r=await call(O.win,{params:{id:opp3.id},body:{mode:'protocol',products:[{ProductId:prod.id,value:10}],discount_value:50}})
  const l3=await Lead.findByPk(lead3.id)
  ok(r.code===400 && await Client.count()===c3 && l3.status==='Ativo' && !l3.ClientId,'compensação: cliente removido, lead ativo ('+r.body?.message+')')

  // só ganhar
  r=await call(O.win,{params:{id:opp3.id},body:{mode:'none'}})
  ok(r.code===201 && r.body.created_client && !r.body.ProtocolId && r.body.opportunity.stage==='Ganho','só ganhar cria cliente e ganha')

  // 7) alerta
  const lead4=(await call(L.store,{body:{name:'Follow'}})).body
  await call(A.store,{body:{LeadId:lead4.id,subject:'Ligar ontem',due_at:new Date(Date.now()-86400e3)}})
  const rr=await load('utils/crmFollowupsAlert').sendCrmFollowupsAlert({force:true})
  ok(rr.sent && sentEmails.at(-1).html.includes('Ligar ontem') && sentEmails.at(-1).subject.includes('atrasado'),'aviso montado')
  
})

test('OS em aberto vira oportunidade; desfecho volta para a OS', async () => {const { createServiceOrder }=load('utils/serviceOrderFactory')

  const [Client,Seller,Protocol,Protocol_register,Service_order,Receipts,BankAccount]=['Client','Seller','Protocol','Protocol_register','Service_order','Receipts','BankAccount'].map(m)
  const c=await Client.create({name:'Cli OS '+Date.now()})
  const seller=await Seller.create({name:'Vend OS',commission_percent:10,commission_base:'liquido',applies_to:'ambos'})
  const mkOs=async(subject,status)=>{const os=await createServiceOrder({subject,ClientId:c.id,notify_client:false}); const p=await Protocol.findOne({where:{ServiceOrderId:os.id}}); await p.update({SellerId:seller.id}); await Protocol_register.create({ProtocolId:p.id,type:'Despesa',description:'Item',value:500}); await os.update({status}); return {os,p}}
  // 1) criar a partir da OS
  const a=await mkOs('Orçamento site','Orçamento enviado')
  let r=await call(O.fromServiceOrder,{params:{id:a.os.id}})
  ok(r.code===201 && r.body.stage==='Proposta' && r.body.estimated_value===500 && r.body.SellerId===seller.id && r.body.ClientId===c.id && r.body.SourceServiceOrderId===a.os.id,'oportunidade da OS: Proposta, 500, vendedor, cliente '+JSON.stringify({c:r.code,s:r.body?.stage,v:r.body?.estimated_value,m:r.body?.message}))
  const oppA=r.body
  r=await call(O.fromServiceOrder,{params:{id:a.os.id}}); ok(r.code===400 && /já está no CRM/.test(r.body.message),'duplicada: 400')
  r=await call(O.index,{query:{status:'all',SourceServiceOrderId:a.os.id}}); ok(r.body.length===1 && r.body[0].id===oppA.id,'filtro SourceServiceOrderId')
  // 2) ganhar pelo kanban (stage) -> OS na fila + vínculo
  r=await call(O.stage,{params:{id:oppA.id},body:{stage:'Ganho'}})
  await a.os.reload(); ok(r.code===200 && a.os.status==='Na fila' && r.body.ServiceOrderId===a.os.id && r.body.ProtocolId===a.p.id && !r.body.warning,'ganho: OS na fila e vinculada')
  r=await call(O.stage,{params:{id:oppA.id},body:{stage:'Proposta'}}); ok(r.code===400,'ganha vinda de OS não volta etapa')
  // 3) ganhar pelo /win (MCP/modal) -> mesmo efeito, sem gerar nada
  const b=await mkOs('Avaliação app','Em avaliação')
  const oppB=(await call(O.fromServiceOrder,{params:{id:b.os.id}})).body; ok(oppB.stage==='Qualificado','Em avaliação vira Qualificado')
  const osCount=await Service_order.count()
  r=await call(O.win,{params:{id:oppB.id},body:{mode:'protocol',products:[]}})
  await b.os.reload(); ok(r.code===201 && b.os.status==='Na fila' && await Service_order.count()===osCount && r.body.ProtocolId===b.p.id,'win de oportunidade da OS não gera nada novo')
  // 4) perder -> OS e protocolo cancelados
  const d=await mkOs('Perder','Orçamento enviado')
  const oppD=(await call(O.fromServiceOrder,{params:{id:d.os.id}})).body
  r=await call(O.stage,{params:{id:oppD.id},body:{stage:'Perdido',lost_reason:'Preço'}})
  await d.os.reload(); await d.p.reload(); ok(r.code===200 && d.os.status==='Cancelado' && d.p.status==='Cancelado' && !r.body.warning,'perda cancela OS e protocolo')
  // 5) perder com recebimento -> aviso, OS intacta
  const e=await mkOs('Com recebimento','Orçamento enviado')
  const bank=await BankAccount.create({name:'B',balance:0})
  await Receipts.create({ProtocolId:e.p.id,method:'Pix',value:100,BankAccountId:bank.id})
  const oppE=(await call(O.fromServiceOrder,{params:{id:e.os.id}})).body
  r=await call(O.stage,{params:{id:oppE.id},body:{stage:'Perdido',lost_reason:'Timing'}})
  await e.os.reload(); ok(r.code===200 && r.body.stage==='Perdido' && /não foi cancelada/.test(r.body.warning||'') && e.os.status==='Orçamento enviado','com recebimento: aviso e OS intacta ('+r.body.warning+')')
  // 6) OS finalizada/cancelada não vira oportunidade
  r=await call(O.fromServiceOrder,{params:{id:d.os.id}}); ok(r.code===400,'OS cancelada: 400')
  r=await call(O.fromServiceOrder,{params:{id:99999999}}); ok(r.code===400,'OS inexistente: 400')
  
})

test('reabrir oportunidade perdida reabre a OS que o CRM cancelou (status anterior)', async () => {
    const { createServiceOrder } = load('utils/serviceOrderFactory')
    const client = await m('Client').create({ name: 'Cliente Reabrir' })
    const os = await createServiceOrder({ subject: 'Reabrir', ClientId: client.id, notify_client: false })
    await os.update({ status: 'Orçamento enviado' })
    const opp = (await call(O.fromServiceOrder, { params: { id: os.id } })).body
    await call(O.stage, { params: { id: opp.id }, body: { stage: 'Perdido', lost_reason: 'Preço' } })
    await os.reload()
    assert.equal(os.status, 'Cancelado')
    const r = await call(O.stage, { params: { id: opp.id }, body: { stage: 'Negociação' } })
    assert.equal(r.code, 200)
    assert.equal(r.body.warning, undefined)
    await os.reload()
    assert.equal(os.status, 'Orçamento enviado')
    const protocol = await m('Protocol').findOne({ where: { ServiceOrderId: os.id } })
    assert.equal(protocol.status, 'Em aberto')
    assert.equal((await m('Opportunity').findByPk(opp.id)).source_os_prev_status, null)
})
