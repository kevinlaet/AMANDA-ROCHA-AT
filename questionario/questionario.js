// Questionário da Amanda: perguntas em etapas, respostas salvas no próprio celular
// (nada vai para servidor nenhum) e enviadas como texto pelo WhatsApp ou copiadas.
(function(){
  var $=function(i){return document.getElementById(i)};
  var CHAVE='amanda-questionario-v1';
  var R={};
  try{R=JSON.parse(localStorage.getItem(CHAVE)||'{}')}catch(e){R={}}
  if(!R||typeof R!=='object'||Array.isArray(R))R={};
  // sugestões e depoimentos: listas de objetos (começam com 3 em branco)
  var lista=function(v){return (Array.isArray(v)&&v.length?v:[{},{},{}]).map(function(x){return x&&typeof x==='object'?x:{}})};
  R.sug=lista(R.sug);R.depo=lista(R.depo);

  var SERV=[{id:'auriculo',nome:'Auriculoterapia',ex:'Ex.: conversa rápida sobre como você está, limpeza da orelha, aplicação das sementes nos pontos e orientações para casa.'},
            {id:'limpeza',nome:'Limpeza de pele',ex:'Ex.: higienização, esfoliação, vapor, extração, máscara calmante e protetor solar.'}];
  var TEMPOS=['30 min','45 min','1h','1h15','1h30','2h'];
  var IDEIA=['😍 Quero!','🤔 Talvez','🙅 Não'];

  // ---------- as perguntas ----------
  // tipos: ops (uma escolha), multi (várias), txt, area, reais, hora2, nota (carinhas), bens (10 benefícios com estrela)
  function porServico(fn){return SERV.map(function(s){return {g:s.nome,campos:fn(s)}})}
  var ETAPAS=[
    {em:'⏱️',t:'Seus procedimentos',sub:'Tempo, preço e como funciona cada um.',
      dica:'<b>Como funciona:</b> toque nas opções ou escreva. Pode pular o que não souber e voltar quando quiser: fica tudo salvo neste celular. No fim, um botão envia tudo para o Kevin pelo WhatsApp.',
      blocos:porServico(function(s){var k='proc.'+s.id+'.';return [
      {k:k+'tempo',t:'ops',l:'Quanto tempo leva, já contando o preparo para a próxima cliente?',c:'Tempo (com preparo)',ops:TEMPOS,outro:1},
      {k:k+'preco',t:'reais',l:'Preço normal',c:'Preço normal',aj:'O valor de sempre, depois da inauguração.'},
      {k:k+'promo',t:'reais',l:'Preço promocional agora (se tiver)',c:'Preço promocional'},
      {k:k+'promoAte',t:'txt',l:'A promoção vale até quando?',c:'Promoção até',ph:'Ex.: 19/12 ou para as 10 primeiras'},
      {k:k+'sessao',t:'area',l:'O que acontece na sessão? (passo a passo curtinho)',c:'Como é a sessão',ph:s.ex},
      {k:k+'retorno',t:'ops',l:'De quanto em quanto tempo a cliente deve voltar?',c:'Retorno ideal',ops:['Toda semana','A cada 15 dias','Todo mês','Depende'],outro:1},
      {k:k+'pacote',t:'ops',l:'Quer vender pacote de sessões?',c:'Pacote',ops:['Sim','Talvez','Não']},
      {k:k+'pacoteDet',t:'txt',l:'Como seria o pacote?',c:'Detalhe do pacote',ph:'Ex.: 4 sessões por R$ 300'}]}).concat([
      {g:'Outros serviços',campos:[{k:'proc.outros',t:'area',l:'Tem outro serviço que você quer oferecer agora ou em breve?',c:'Outros serviços',ph:'Ex.: drenagem, massagem relaxante, design de sobrancelha...'}]}])},
    {em:'✨',t:'Benefícios',sub:'Os 10 melhores de cada serviço. Os 3 com ⭐ vão para o site.',
      dica:'<b>Como escrever:</b> frases curtas (até 40 letras), do ponto de vista da cliente. Use <b>“ajuda a”</b>, <b>“alivia”</b>, <b>“melhora”</b>. Evite “cura”: passa mais confiança e é o certo para quem é da saúde. Exemplo: <i>Alivia dores nas costas</i>.',
      blocos:porServico(function(s){return [
        {k:'ben.'+s.id,t:'bens',l:'Benefícios',c:'Benefícios'},
        {k:'ben.'+s.id+'.cuidados',t:'area',l:'Para quem não é indicado ou exige cuidado?',c:'Contraindicações e cuidados',ph:'Ex.: gestantes, pele com ferida aberta, uso de ácidos nos últimos dias...'}]})},
    {em:'📅',t:'Sua agenda',sub:'Quando você pode atender.',blocos:[{campos:[
      {k:'ag.dias',t:'multi',l:'Em quais dias você pode atender?',c:'Dias',ops:['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']},
      {k:'ag.horario',t:'hora2',l:'Em que horário?',c:'Horário'},
      {k:'ag.obs',t:'area',l:'Alguma observação sobre a agenda?',c:'Observações da agenda',ph:'Ex.: sábados só à tarde; às quartas depois das 18h'},
      {k:'ag.intervalo',t:'ops',l:'Quer um intervalo extra entre uma cliente e outra?',c:'Intervalo extra',aj:'Além do tempo do procedimento.',ops:['Não precisa','10 min','15 min','30 min']},
      {k:'ag.antecedencia',t:'ops',l:'Com quanta antecedência a cliente pode marcar pelo site?',c:'Antecedência mínima',aj:'Hoje: até 1 hora antes.',ops:['1 hora antes','3 horas antes','1 dia antes','2 dias antes']},
      {k:'ag.ate',t:'ops',l:'Até quanto tempo para frente o site mostra horários?',c:'Mostrar horários até',ops:['2 semanas','1 mês','2 meses','Sem limite']}]}]},
    {em:'💳',t:'Regras e pagamento',sub:'Combinados que evitam dor de cabeça.',blocos:[{campos:[
      {k:'rg.falta',t:'ops',l:'Faltas: com quanto tempo antes a cliente precisa avisar?',c:'Aviso de falta',ops:['12 horas','24 horas','48 horas','Não quero regra']},
      {k:'rg.atraso',t:'ops',l:'Atraso: quanto tempo de tolerância?',c:'Tolerância de atraso',ops:['10 min','15 min','20 min','Depende']},
      {k:'rg.pag',t:'multi',l:'Como você recebe?',c:'Formas de pagamento',ops:['Pix','Dinheiro','Cartão de débito','Cartão de crédito']},
      {k:'rg.pixMsg',t:'ops',l:'Colocar sua chave Pix na mensagem de confirmação?',c:'Pix na confirmação',ops:['Sim','Não']},
      {k:'rg.pix',t:'txt',l:'Chave Pix (se quiser na mensagem)',c:'Chave Pix',ph:'Celular, e-mail, CPF ou chave aleatória'},
      {k:'rg.sinal',t:'ops',l:'Quer pedir um sinal (adiantamento) para reservar?',c:'Sinal',ops:['Não','Sim']},
      {k:'rg.sinalDet',t:'txt',l:'Se sim, de quanto?',c:'Valor do sinal',ph:'Ex.: R$ 20, descontado no dia'}]}]},
    {em:'🎁',t:'Promoções e indicação',sub:'O que faz a cliente vir e trazer as amigas.',blocos:[{campos:[
      {k:'pr.ate',t:'ops',l:'O valor de inauguração da limpeza de pele (R$ 75) vale até quando?',c:'Inauguração vale até',ops:['Até 19/12','Para as 10 primeiras','Sem prazo'],outro:1},
      {k:'pr.indica',t:'ops',l:'A indicação (ganha 1 sessão de auriculoterapia) vale para…',c:'Regra da indicação',ops:['Toda indicação que fechar','Só a primeira','Até 3 por cliente'],outro:1},
      {k:'pr.brinde',t:'ops',l:'O presente da indicação é “1 sessão de auriculoterapia com sementes”?',c:'Presente da indicação',ops:['Sim, é isso','Quero outro'],outro:1},
      {k:'pr.ideias',t:'area',l:'Outras promoções que você gostaria de fazer?',c:'Ideias de promoção',ph:'Ex.: aniversariante do mês, pacote mãe e filha, traga uma amiga e as duas ganham...'}]}]},
    {em:'👩‍⚕️',t:'Sua história',sub:'Para o “Sobre mim” do site: cliente confia em quem conhece.',blocos:[{campos:[
      {k:'hs.apresentacao',t:'area',l:'Como você quer ser apresentada? (1 ou 2 frases)',c:'Apresentação',ph:'Ex.: Sou enfermeira há X anos e cuido de pessoas com ansiedade e dores...'},
      {k:'hs.coren',t:'txt',l:'Seu número de inscrição no COREN',c:'COREN',aj:'O COFEN pede que todo anúncio de enfermagem mostre o nome, o número do COREN e a categoria (Resolução 554/2017). Vai no rodapé do site e nos folders.',ph:'Ex.: COREN-SP 123456'},
      {k:'hs.formacao',t:'area',l:'Formação, cursos e certificados',c:'Formação'},
      {k:'hs.tempo',t:'txt',l:'Há quanto tempo você atende com auriculoterapia?',c:'Tempo de auriculoterapia'},
      {k:'hs.frase',t:'txt',l:'Uma frase que te define',c:'Frase que me define',ph:'Ex.: Cuidar é o que eu faço de melhor.'},
      {k:'hs.foto',t:'ops',l:'Podemos usar sua foto no site e nos folders?',c:'Foto no site',ops:['Sim, já tenho fotos','Sim, vou tirar','Prefiro não']}]}]},
    {em:'💬',t:'Suas clientes',sub:'Quem você atende e o que elas dizem.',blocos:[{campos:[
      {k:'cl.publico',t:'multi',l:'Quem você mais atende?',c:'Público',ops:['Mulheres 18–30','Mulheres 30–45','Mulheres 45–60','Mulheres 60+','Homens','Adolescentes']},
      {k:'cl.queixas',t:'multi',l:'Queixas que mais aparecem',c:'Queixas comuns',ops:['Ansiedade','Dores','Insônia','Estresse','Enxaqueca','Compulsão alimentar','Cravos e espinhas','Oleosidade','Manchas'],outro:1}]},
      {g:'Depoimentos',dep:1}]},
    {em:'📍',t:'Onde você atende',sub:'Para o mapa, o Google e as mensagens.',blocos:[{campos:[
      {k:'lc.endereco',t:'txt',l:'Endereço completo',c:'Endereço',ph:'Rua, número, bairro e cidade'},
      {k:'lc.referencia',t:'txt',l:'Ponto de referência',c:'Referência'},
      {k:'lc.acesso',t:'txt',l:'Como é chegar? (ônibus, estacionamento)',c:'Como chegar'},
      {k:'lc.google',t:'ops',l:'Você tem perfil no Google Maps (Perfil da Empresa)?',c:'Google Maps',aj:'É o que aparece quando alguém procura “auriculoterapia perto de mim”.',ops:['Tenho','Não tenho','Não sei']},
      {k:'lc.googleCriar',t:'ops',l:'Quer ajuda para criar ou melhorar?',c:'Ajuda com o Google',ops:['Quero!','Agora não']},
      {k:'lc.insta',t:'txt',l:'Instagram',c:'Instagram',ph:'@amandarochaat'},
      {k:'lc.business',t:'ops',l:'WhatsApp Business',c:'WhatsApp Business',ops:['Já uso','Quero mudar','Prefiro o comum']}]}]},
    {em:'🎨',t:'Visual e nome do site',sub:'A cara da sua marca.',blocos:[{campos:[
      {k:'vs.cores',t:'ops',l:'As cores (verde-petróleo e pêssego) estão com a sua cara?',c:'Cores',ops:['Amei','Quero ajustar']},
      {k:'vs.coresObs',t:'txt',l:'Se quiser ajustar, o que mudaria?',c:'Ajuste nas cores'},
      {k:'vs.folders',t:'nota',l:'O que achou dos folders novos?',c:'Nota dos folders'},
      {k:'vs.foldersObs',t:'area',l:'Quer mudar algo nos folders?',c:'Mudanças nos folders'},
      {k:'vs.dominio',t:'ops',l:'Nome do site: qual você prefere?',c:'Domínio',aj:'A gente confere se está livre antes de comprar (cerca de R$ 40 por ano).',ops:['amandarocha.com.br','amandarochaat.com.br','amandarochaestetica.com.br','amandarochaterapias.com.br'],outro:1}]}]},
    {em:'📱',t:'O painel no dia a dia',sub:'Para deixar o painel cada vez mais fácil.',blocos:[{campos:[
      {k:'pn.facil',t:'nota',l:'Quão fácil está usar o painel?',c:'Facilidade do painel'},
      {k:'pn.usa',t:'multi',l:'O que você mais usa?',c:'Mais usado',ops:['Confirmar pedidos','Lembretes','Abrir horários','Enviar horários','Clientes','Histórico','Serviços e preços']},
      {k:'pn.dificil',t:'area',l:'O que está difícil ou confuso?',c:'Difícil ou confuso'},
      {k:'pn.avisos',t:'multi',l:'Quais avisos você quer receber no celular?',c:'Avisos no celular',ops:['Pedido novo','Resumo da manhã','Alertas de segurança']},
      {k:'pn.resumoHora',t:'ops',l:'Que horas o resumo da manhã deve chegar?',c:'Horário do resumo',ops:['6h','7h','8h'],outro:1}]}]},
    {em:'🚀',t:'Ideias para crescer',sub:'Você escolhe o que a gente faz primeiro.',
      dica:'Cada ideia abaixo ajuda a trazer clientes novas ou a fazer as de sempre voltarem. Responda <b>Quero!</b>, <b>Talvez</b> ou <b>Não</b>. Se quiser de outro jeito, escreva no campo do fim.',
      blocos:[{campos:[
      {k:'id.google',t:'ops',l:'⭐ Avaliações no Google',c:'Avaliações no Google',aj:'Depois do atendimento, um toque no painel manda para a cliente o link para avaliar você. Avaliação boa é o que faz quem procura “perto de mim” escolher você.',ops:IDEIA},
      {k:'id.cuidados',t:'ops',l:'💌 Mensagem do dia seguinte',c:'Mensagem do dia seguinte',aj:'Um carinho com os cuidados para casa (ex.: protetor solar depois da limpeza). A cliente se sente cuidada e lembra de você.',ops:IDEIA},
      {k:'id.fidelidade',t:'ops',l:'🎟️ Cartão fidelidade',c:'Cartão fidelidade',aj:'A cada 5 sessões, 1 de presente (ou outro prêmio). O painel conta sozinho.',ops:IDEIA},
      {k:'id.aniversario',t:'ops',l:'🎂 Aniversário das clientes',c:'Aniversário das clientes',aj:'O painel avisa no dia e prepara uma mensagem com um mimo (ex.: 10% no mês do aniversário).',ops:IDEIA},
      {k:'id.mes',t:'ops',l:'📊 Resumo do mês',c:'Resumo do mês',aj:'Quantas clientes vieram, quantas voltaram, quanto entrou e o serviço mais procurado.',ops:IDEIA},
      {k:'id.ficha',t:'ops',l:'📝 Ficha de saúde (anamnese)',c:'Ficha de saúde',aj:'Antes da 1ª sessão, a cliente responde pelo celular: alergias, remédios, gestação, pele sensível. Fica só no seu painel.',ops:IDEIA},
      {k:'id.antesDepois',t:'ops',l:'📸 Fotos de antes e depois',c:'Fotos de antes e depois',aj:'Da limpeza de pele, para o Instagram e o site. Só com autorização por escrito da cliente e sem prometer resultado, como pede o COFEN.',ops:IDEIA},
      {k:'id.obs',t:'area',l:'Quer mudar alguma dessas ideias?',c:'Ajustes nas ideias',ph:'Ex.: no cartão fidelidade, a cada 4 sessões a 5ª sai pela metade'}]}]},
    {em:'💡',t:'Suas sugestões',sub:'Ideias novas ou mudanças: tudo vale.',sug:1,
      dica:'<b>Aqui vale tudo.</b> Cada sugestão pode ser <b>uma ideia nova</b> ou <b>uma mudança</b> em algo que já existe (site, painel, folders, mensagens...). Escreva como se estivesse falando com a gente: o que você quer e, se souber, por quê.<br><br><i>Exemplos:</i><br>• <i>Sugestão 1 · Mudança · Site: trocar a frase do topo por “Cuidado que você sente”.</i><br>• <i>Sugestão 2 · Ideia nova · Painel: mostrar quais clientes mais indicaram amigas.</i>'},
    {em:'🎉',t:'Prontinho!',fim:1}
  ];
  var TOTAL=ETAPAS.length,atual=0;
  // volta na etapa em que ela parou
  try{var a0=+localStorage.getItem(CHAVE+'-etapa');if(a0>=0&&a0<TOTAL)atual=a0}catch(e){}

  // ---------- utilidades ----------
  function esc(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  var tSalvo;
  function salvar(){try{localStorage.setItem(CHAVE,JSON.stringify(R))}catch(e){}
    var s=$('salvo');s.classList.add('on');clearTimeout(tSalvo);tSalvo=setTimeout(function(){s.classList.remove('on')},1200);animo()}
  function tem(v){return Array.isArray(v)?v.length>0:v!=null&&String(v).trim()!==''}
  // lista salva (se o tipo de uma pergunta mudar numa versão nova, a resposta antiga não quebra nada)
  function arr(v){return Array.isArray(v)?v:[]}
  function camposDe(e){var l=[];(e.blocos||[]).forEach(function(b){(b.campos||[]).forEach(function(f){l.push(f)})});return l}
  function respondidaEtapa(e){if(e.sug)return R.sug.some(function(x){return tem(x.texto)});
    return camposDe(e).some(function(f){return f.t==='bens'?arr(R[f.k]).some(tem):f.t==='hora2'?tem(R[f.k+'.de'])||tem(R[f.k+'.ate']):tem(R[f.k])})||(e.blocos||[]).some(function(b){return b.dep&&R.depo.some(function(d){return tem(d.frase)})})}
  function animo(){var feitas=ETAPAS.filter(function(e){return !e.fim&&respondidaEtapa(e)}).length,p=feitas/(TOTAL-1);
    $('animo').textContent=atual===TOTAL-1?'':p===0?'Bora começar? Pode pular o que não souber. 💚':p<.4?'Começou bem! Cada resposta já ajuda. 🌱':p<.75?'Tá voando! 🚀':p<1?'Quase lá! 💪':'Tudo respondido. Você é demais! ✨';
    [].forEach.call(document.querySelectorAll('[data-ir]'),function(b){var i=+b.getAttribute('data-ir');b.classList.toggle('feita',!ETAPAS[i].fim&&respondidaEtapa(ETAPAS[i]))})}

  // ---------- desenhar ----------
  function opsHtml(f,multi){var v=R[f.k],sel=function(o){return multi?arr(v).indexOf(o)>=0:v===o};
    return '<div class="ops" role="group">'+f.ops.map(function(o){return '<button type="button" class="op" data-k="'+f.k+'" data-v="'+esc(o)+'"'+(multi?' data-multi="1"':'')+' aria-pressed="'+sel(o)+'">'+esc(o)+'</button>'}).join('')+'</div>'+
      (f.outro?'<input type="text" class="outro" data-k="'+f.k+'.outro" value="'+esc(R[f.k+'.outro']||'')+'" placeholder="Outro? Escreva aqui" maxlength="120">':'')}
  function campoHtml(f){
    var h='<div class="campo">'+(f.t==='bens'?'':'<'+(f.t==='txt'||f.t==='area'||f.t==='reais'?'label for="f-'+f.k+'"':'span class="lbl"')+'>'+esc(f.l)+'</'+(f.t==='txt'||f.t==='area'||f.t==='reais'?'label':'span')+'>')+(f.aj?'<small class="aj">'+esc(f.aj)+'</small>':'');
    if(f.t==='ops')h+=opsHtml(f,false);
    else if(f.t==='multi')h+=opsHtml(f,true);
    else if(f.t==='txt')h+='<input type="text" id="f-'+f.k+'" data-k="'+f.k+'" value="'+esc(R[f.k]||'')+'" placeholder="'+esc(f.ph||'')+'" maxlength="200">';
    else if(f.t==='area')h+='<textarea id="f-'+f.k+'" data-k="'+f.k+'" placeholder="'+esc(f.ph||'')+'" maxlength="1500">'+esc(R[f.k]||'')+'</textarea>';
    else if(f.t==='reais')h+='<div class="reais"><span>R$</span><input type="text" inputmode="decimal" id="f-'+f.k+'" data-k="'+f.k+'" value="'+esc(R[f.k]||'')+'" placeholder="0" maxlength="10"></div>';
    else if(f.t==='hora2')h+='<div class="dupla"><div><label for="f-'+f.k+'-de">Das</label><input type="time" id="f-'+f.k+'-de" data-k="'+f.k+'.de" value="'+esc(R[f.k+'.de']||'')+'"></div><div><label for="f-'+f.k+'-ate">Até</label><input type="time" id="f-'+f.k+'-ate" data-k="'+f.k+'.ate" value="'+esc(R[f.k+'.ate']||'')+'"></div></div>';
    else if(f.t==='nota')h+='<div class="nota ops" role="group">'+['😣','😕','😐','🙂','😍'].map(function(e,i){return '<button type="button" class="op" data-k="'+f.k+'" data-v="'+(i+1)+'" aria-label="Nota '+(i+1)+' de 5" aria-pressed="'+(R[f.k]===String(i+1))+'">'+e+'</button>'}).join('')+'</div>';
    else if(f.t==='bens'){var l=arr(R[f.k]),est=arr(R[f.k+'.estrelas']);
      h+=[0,1,2,3,4,5,6,7,8,9].map(function(i){return '<div class="ben"><span class="n">'+(i+1<10?'0':'')+(i+1)+'</span><input type="text" data-k="'+f.k+'" data-i="'+i+'" value="'+esc(l[i]||'')+'" maxlength="40" placeholder="Benefício '+(i+1)+'" aria-label="Benefício '+(i+1)+'">'+
        '<button type="button" class="estrela" data-estrela="'+f.k+'" data-i="'+i+'" aria-pressed="'+(est.indexOf(i)>=0)+'" aria-label="Marcar como um dos 3 principais">⭐</button></div>'}).join('')+
        '<p class="cont" data-cont="'+f.k+'">'+est.length+' de 3 estrelas</p>'}
    return h+'</div>'}
  function depoHtml(){return R.depo.map(function(d,i){return '<div class="bloco"><h4>Depoimento '+(i+1)+'</h4>'+
    '<input type="text" data-depo="'+i+'" data-c="nome" value="'+esc(d.nome||'')+'" placeholder="Nome (ou só a inicial)" maxlength="60" aria-label="Nome da cliente do depoimento '+(i+1)+'">'+
    '<textarea data-depo="'+i+'" data-c="frase" placeholder="O que ela disse" maxlength="400" style="margin-top:8px" aria-label="Frase do depoimento '+(i+1)+'">'+esc(d.frase||'')+'</textarea>'+
    '<label class="check"><input type="checkbox" data-depo="'+i+'" data-c="ok"'+(d.ok?' checked':'')+'> Ela autorizou publicar</label></div>'}).join('')}
  var TIPOS=['✨ Ideia nova','🔧 Mudança'],ONDE=['Site','Painel','Folders','Mensagens','Instagram','Outro'],PRIO=['🔥 Urgente','⭐ Importante','🌱 Quando der'];
  function sugHtml(){return R.sug.map(function(x,i){
    var bt=function(lista,c){return '<div class="ops" role="group">'+lista.map(function(o){return '<button type="button" class="op" data-sug="'+i+'" data-c="'+c+'" data-v="'+esc(o)+'" aria-pressed="'+(x[c]===o)+'">'+esc(o)+'</button>'}).join('')+'</div>'};
    return '<div class="bloco" id="sug-b-'+i+'"><h4>Sugestão '+(i+1)+(R.sug.length>1?'<button type="button" data-sug-tirar="'+i+'">Remover</button>':'')+'</h4>'+
      '<div class="campo"><span class="lbl">É uma ideia nova ou uma mudança?</span>'+bt(TIPOS,'tipo')+'</div>'+
      '<div class="campo"><span class="lbl">Onde?</span>'+bt(ONDE,'onde')+'</div>'+
      '<div class="campo"><label for="sug-'+i+'">Conta pra gente</label><textarea id="sug-'+i+'" data-sug="'+i+'" data-c="texto" maxlength="1500" placeholder="O que você quer e, se souber, por quê">'+esc(x.texto||'')+'</textarea></div>'+
      '<div class="campo"><span class="lbl">Prioridade</span>'+bt(PRIO,'prio')+'</div></div>'}).join('')+
    '<button type="button" class="mais" data-sug-mais>+ Adicionar sugestão '+(R.sug.length+1)+'</button>'}
  function desenhar(){
    var e=ETAPAS[atual],h='';
    $('num').textContent='ETAPA '+(atual+1<10?'0':'')+(atual+1)+'/'+TOTAL;
    $('trilho').style.width=Math.round((atual+1)/TOTAL*100)+'%';
    $('etapas').innerHTML=ETAPAS.map(function(x,i){return '<button type="button" data-ir="'+i+'"'+(i===atual?' aria-current="step"':'')+'>'+x.em+' '+esc(x.t)+'</button>'}).join('');
    if(e.fim){h=fimHtml()}
    else{
      h='<div class="etapa"><div class="cab"><span class="em" aria-hidden="true">'+e.em+'</span><div><h2>'+esc(e.t)+'</h2><p class="sub">'+esc(e.sub)+'</p></div></div>'+(e.dica?'<div class="dica">'+e.dica+'</div>':'');
      if(e.sug)h+=sugHtml();
      (e.blocos||[]).forEach(function(b){h+='<div class="card">'+(b.g?'<h3>'+esc(b.g)+'</h3>':'')+(b.dep?'<small class="aj">Frases reais de clientes, com a permissão delas. Até 3.</small>'+depoHtml():b.campos.map(campoHtml).join(''))+'</div>'});
      h+='</div><div class="nav"><button type="button" class="btn ghost" data-nav="-1"'+(atual===0?' disabled':'')+'>← Voltar</button><button type="button" class="btn main" data-nav="1">'+(atual===TOTAL-2?'Revisar e enviar →':'Próximo →')+'</button></div>';
    }
    $('tela').innerHTML=h;
    // centraliza a etapa atual na faixa de etapas (só na horizontal: a página não pula)
    var nav=$('etapas'),b=nav.querySelector('[aria-current]');if(b)nav.scrollLeft=b.offsetLeft-(nav.clientWidth-b.offsetWidth)/2;
    animo();
  }
  function ir(i){atual=Math.max(0,Math.min(TOTAL-1,i));try{localStorage.setItem(CHAVE+'-etapa',atual)}catch(e){}desenhar();window.scrollTo(0,$('etapas').offsetTop-60);
    if(ETAPAS[atual].fim)confete()}

  // ---------- final: texto para enviar ----------
  function valor(f){
    if(f.t==='multi'){var m=arr(R[f.k]).slice();if(tem(R[f.k+'.outro']))m.push(R[f.k+'.outro']);return m.join(', ')}
    if(f.t==='ops'){return [R[f.k],R[f.k+'.outro']].filter(tem).join(' · ')}
    if(f.t==='reais')return tem(R[f.k])?'R$ '+String(R[f.k]).replace(/^R\$\s*/,''):'';
    if(f.t==='hora2')return tem(R[f.k+'.de'])||tem(R[f.k+'.ate'])?'das '+(R[f.k+'.de']||'?')+' às '+(R[f.k+'.ate']||'?'):'';
    if(f.t==='nota')return tem(R[f.k])?R[f.k]+' de 5':'';
    return tem(R[f.k])?String(R[f.k]).trim():''}
  function texto(){
    var d=new Date(),L=['📋 QUESTIONÁRIO DA AMANDA','Respondido em '+d.toLocaleDateString('pt-BR')+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),''];
    ETAPAS.forEach(function(e,i){
      if(e.fim)return;var out=[];
      if(e.sug)R.sug.forEach(function(x,j){if(!tem(x.texto))return;out.push('Sugestão '+(j+1)+' ('+[x.tipo,x.onde,x.prio].filter(tem).join(' · ')+'): '+String(x.texto).trim())});
      (e.blocos||[]).forEach(function(b){
        if(b.dep){R.depo.forEach(function(x,j){if(tem(x.frase))out.push('Depoimento '+(j+1)+': '+(x.nome||'sem nome')+' — “'+String(x.frase).trim()+'” (autorizou publicar: '+(x.ok?'sim':'não')+')')});return}
        b.campos.forEach(function(f){
          if(f.t==='bens'){var l=arr(R[f.k]),est=arr(R[f.k+'.estrelas']),ls=[];l.forEach(function(t,j){if(tem(t))ls.push('  '+(j+1)+') '+String(t).trim()+(est.indexOf(j)>=0?' ⭐':''))});
            if(ls.length){out.push((b.g?b.g+' · ':'')+'Benefícios (⭐ = vão para o site):');out=out.concat(ls)}return}
          var v=valor(f);if(v)out.push('- '+(b.g&&b.g!=='Outros serviços'?b.g+' · ':'')+f.c+': '+v)})});
      if(out.length){L.push((i+1)+'. '+e.t.toUpperCase());L=L.concat(out);L.push('')}
    });
    if(L.length<=3)L.push('(ainda sem respostas)');
    return L.join('\n')}
  function fimHtml(){var t=texto(),falta=[];
    ETAPAS.forEach(function(e,i){if(!e.fim&&!respondidaEtapa(e))falta.push('<button type="button" class="op" data-ir="'+i+'">'+e.em+' '+esc(e.t)+'</button>')});
    return '<div class="etapa fim"><span class="em" aria-hidden="true">🎉</span><h2>Prontinho!</h2><p class="sub">Confira abaixo e envie para o Kevin. Ele cola tudo para o Claude atualizar o site, o painel e os folders.</p></div>'+
      (falta.length?'<div class="falta"><b>Se quiser, ainda dá para responder:</b><div class="ops">'+falta.join('')+'</div></div>':'<p class="falta tudo">✨ Você respondeu todas as etapas!</p>')+
      '<pre class="previa" id="previa">'+esc(t)+'</pre>'+
      '<div class="acoes"><a class="btn zap" id="bZap" target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent(t)+'">Enviar pelo WhatsApp</a>'+
      '<button type="button" class="btn ghost" data-copiar>Copiar respostas</button>'+
      '<button type="button" class="btn ghost" data-nav="-1">← Voltar e mudar algo</button></div>'+
      '<p class="aviso">No WhatsApp, escolha a conversa com o Kevin. Se o texto ficar cortado, toque em <b>Copiar respostas</b> e cole na conversa.</p>'+
      '<p style="text-align:center"><button type="button" class="limpar" data-limpar>Apagar minhas respostas deste celular</button></p>'}
  function copiar(){var t=texto(),ok=function(){$('animo').textContent='Copiado! Agora é só colar na conversa com o Kevin. 📋'};
    var sel=function(){var r=document.createRange();r.selectNodeContents($('previa'));var s=getSelection();s.removeAllRanges();s.addRange(r);$('animo').textContent='Texto selecionado: toque em Copiar.'};
    try{navigator.clipboard.writeText(t).then(ok,sel)}catch(e){sel()}}
  function confete(){if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    var cores=['#0B5F59','#F5C59D','#B9774A','#2FA38F','#FBE3CE'];
    for(var i=0;i<36;i++){var c=document.createElement('i');c.className='confete';c.style.left=Math.random()*100+'vw';c.style.background=cores[i%cores.length];c.style.animationDelay=(Math.random()*.6)+'s';document.body.appendChild(c);
      (function(el){setTimeout(function(){el.remove()},3500)})(c)}}

  // ---------- interações ----------
  document.addEventListener('click',function(ev){
    var t=ev.target,b;
    if((b=t.closest('[data-ir]'))){ir(+b.getAttribute('data-ir'));return}
    if((b=t.closest('[data-nav]'))){ir(atual+(+b.getAttribute('data-nav')));return}
    if((b=t.closest('[data-copiar]'))){copiar();return}
    if((b=t.closest('[data-limpar]'))){if(confirm('Apagar todas as respostas deste celular?')){R={sug:[{},{},{}],depo:[{},{},{}]};salvar();ir(0)}return}
    if((b=t.closest('[data-sug-mais]'))){R.sug.push({});salvar();desenhar();var nova=$('sug-b-'+(R.sug.length-1));if(nova&&nova.scrollIntoView)nova.scrollIntoView({block:'start'});return}
    if((b=t.closest('[data-sug-tirar]'))){var j=+b.getAttribute('data-sug-tirar');
      if(tem(R.sug[j].texto)&&!confirm('Remover a sugestão '+(j+1)+'? O que você escreveu nela será apagado.'))return;
      R.sug.splice(j,1);salvar();desenhar();return}
    if((b=t.closest('.op[data-sug]'))){var x=R.sug[+b.getAttribute('data-sug')],c=b.getAttribute('data-c'),v=b.getAttribute('data-v');x[c]=x[c]===v?'':v;
      [].forEach.call(b.parentNode.children,function(o){o.setAttribute('aria-pressed',o.getAttribute('data-v')===x[c])});salvar();return}
    if((b=t.closest('.estrela'))){var bk=b.getAttribute('data-estrela'),k=bk+'.estrelas',i=+b.getAttribute('data-i'),est=arr(R[k]),p=est.indexOf(i);
      if(p<0&&!tem(arr(R[bk])[i])){$('animo').textContent='Escreva o benefício primeiro, depois dê a estrela. ⭐';return}
      if(p>=0)est.splice(p,1);else if(est.length>=3){$('animo').textContent='Só 3 estrelas: tire uma para marcar outra. 😉';return}else est.push(i);
      R[k]=est;b.setAttribute('aria-pressed',p<0);var ct=document.querySelector('[data-cont="'+b.getAttribute('data-estrela')+'"]');if(ct)ct.textContent=est.length+' de 3 estrelas';salvar();return}
    if((b=t.closest('.op[data-k]'))){var k2=b.getAttribute('data-k'),v2=b.getAttribute('data-v');
      if(b.hasAttribute('data-multi')){var lst=arr(R[k2]),q=lst.indexOf(v2);if(q>=0)lst.splice(q,1);else lst.push(v2);R[k2]=lst;b.setAttribute('aria-pressed',q<0)}
      else{R[k2]=R[k2]===v2?'':v2;[].forEach.call(b.parentNode.children,function(o){o.setAttribute('aria-pressed',o.getAttribute('data-v')===R[k2])})}
      salvar();return}
  });
  function aoDigitar(ev){var t=ev.target;
    if(t.hasAttribute('data-depo')){var d=R.depo[+t.getAttribute('data-depo')];d[t.getAttribute('data-c')]=t.type==='checkbox'?t.checked:t.value;salvar();return}
    if(t.hasAttribute('data-sug')){R.sug[+t.getAttribute('data-sug')][t.getAttribute('data-c')]=t.value;salvar();return}
    if(!t.hasAttribute('data-k'))return;
    var k=t.getAttribute('data-k');
    if(t.hasAttribute('data-i')){var l=arr(R[k]);l[+t.getAttribute('data-i')]=t.value;R[k]=l}else R[k]=t.value;
    salvar()}
  document.addEventListener('input',aoDigitar);
  document.addEventListener('change',aoDigitar);

  desenhar();
})();
