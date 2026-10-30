// Agenda do site: escolha de serviço, dia e horário, reserva no banco e mensagem pelo WhatsApp.
(function(){
  var A=window.AGENDA, C=window.SUPABASE||{}, live=!!(C.url&&C.anonKey);
  var S={servico:null,dia:null,hora:null}, slots=[], falhou=false, aviso='', enviando=false, reservado=false;
  // Link enviado pela Amanda: ?dias=2026-11-03,2026-11-04&n=Maria&s=auriculo
  var QS=new URLSearchParams(location.search),FILTRO=null,verTodos=false;
  function dataOk(d){var p=d.split('-'),x=new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));return !isNaN(x)&&x.toISOString().slice(0,10)===d}
  (function(){var d=(QS.get('dias')||'').split(',').filter(function(x){return /^\d{4}-\d\d-\d\d$/.test(x)&&dataOk(x)}).slice(0,14);if(d.length)FILTRO=d})();
  var NOME_CONV=(QS.get('n')||'').replace(/[<>&"']/g,'').trim().slice(0,60);
  function escH(t){return String(t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  var CAL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  var SEM=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  var MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  var $=function(id){return document.getElementById(id)};
  // datas como texto AAAA-MM-DD; o dia da semana é calculado sem depender do fuso do celular
  function utc(d){var p=d.split('-');return new Date(Date.UTC(+p[0],+p[1]-1,+p[2]))}
  function dd(n){return (n<10?'0':'')+n}
  function curta(d){var x=utc(d);return dd(x.getUTCDate())+'/'+dd(x.getUTCMonth()+1)}
  function sem(d){return SEM[utc(d).getUTCDay()]}
  function hh(h){var m=/^(\d\d):(\d\d)$/.exec(h);return m?(+m[1])+(m[2]==='00'?'h':'h'+m[2]):h}
  function hojeLocal(){var n=new Date();return n.getFullYear()+'-'+dd(n.getMonth()+1)+'-'+dd(n.getDate())}
  // A chave pública vai só no cabeçalho "apikey". Chaves no formato novo (sb_publishable_...)
  // não podem ir como "Authorization", e nas chaves antigas isso não é necessário.
  function cab(){return {apikey:C.anonKey,'Content-Type':'application/json'}}
  function servico(){return A.servicos.filter(function(s){return s.id===S.servico})[0]}
  function slot(){return slots.filter(function(q){return q.id===S.hora})[0]}
  function cedoDemais(d){var s=servico();return !!(s&&s.desde&&d<s.desde)}
  // duração: o procedimento escolhido precisa caber sem encostar em outro atendimento
  // (aceita "13:00", "13h" e "13h30")
  function minDe(h){var m=/^(\d{1,2})(?:[:h](\d{2})?)?/.exec(h||'');return m?(+m[1])*60+(+(m[2]||0)):0}
  function durServ(){var s=servico();return s&&s.duracao?+s.duracao:60}
  function fimOcupado(o){if(!o.ate)return minDe(o.hora)+60;var t=String(o.ate).replace(' ','T'),d=t.slice(0,10),m=minDe(t.slice(11,16));return d>o.data?1440+m:m}
  function cabe(q){if(!q||q.status!=='livre')return false;var a=minDe(q.hora),b=a+durServ();
    return !slots.some(function(o){if(o.data!==q.data||o.status==='livre')return false;var c=minDe(o.hora);return c<b&&fimOcupado(o)>a})}

  // Com o Supabase ligado, o banco decide o que aparece (horário de Brasília).
  // Sem ele, usa a lista do agenda.js.
  function load(){
    if(!live){slots=[];var h=hojeLocal();A.dias.forEach(function(d){if(d.data<h)return;d.horarios.forEach(function(x){
      slots.push({id:d.data+' '+x,data:d.data,hora:x,status:(A.ocupados[d.data]||[]).indexOf(x)<0?'livre':'ocupado'})})});return Promise.resolve()}
    // serviços: os que a Amanda cadastrou no painel; se o banco ainda não tiver a tabela, ficam os do agenda.js
    var serv=fetch(C.url+'/rest/v1/rpc/servicos_publicos',{method:'POST',headers:cab(),body:'{}'})
      .then(function(r){if(!r.ok)throw 0;return r.json()})
      .then(function(j){if(Array.isArray(j)){A.servicos=j.map(function(x){return {id:x.id,nome:x.nome,detalhe:x.detalhe||'',novidade:!!x.novidade,desde:x.desde||null,duracao:+x.duracao||0,
        preco:x.preco==null?null:+x.preco,preco_antes:x.preco_antes==null?null:+x.preco_antes,preco_obs:x.preco_obs||'',descricao:x.descricao||'',beneficios:x.beneficios||[]}});
        // banco com a personalização (preço, texto e benefícios): os cartões e a faixa de novidade vêm dele
        if(j.length&&('descricao' in j[0]))vitrine()}})
      .catch(function(){});
    var ag=fetch(C.url+'/rest/v1/rpc/agenda_publica',{method:'POST',headers:cab(),body:'{}'})
      .then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){slots=j||[];falhou=false}).catch(function(){falhou=true});
    return Promise.all([serv,ag]);
  }
  function dias(){var m={},out=[];slots.forEach(function(x){if(x.status==='bloqueio')return;if(FILTRO&&!verTodos&&FILTRO.indexOf(x.data)<0)return;if(!m[x.data]){m[x.data]=[];out.push(x.data)}m[x.data].push(x)});
    return out.map(function(d){return {data:d,slots:m[d]}})}
  // depois de recarregar, desfaz escolhas que deixaram de valer
  function conferir(){
    if(S.servico&&!servico())S.servico=null;
    var ds=dias(),d=ds.filter(function(x){return x.data===S.dia})[0];
    if(S.dia&&(!d||cedoDemais(S.dia))){S.dia=null;S.hora=null}
    var q=slot();if(S.hora&&!cabe(q))S.hora=null;
  }

  // ---------- vitrine: cartões dos serviços e faixa de novidade, do jeito que a Amanda deixou no painel ----------
  function reais(v){return 'R$ '+(v%1?v.toFixed(2).replace('.',','):String(v))}
  function precoCurto(s){return s.preco==null?'':reais(s.preco)}
  var ICONES={auriculo:'<path d="M14 30c-3-3-5-7-5-12a11 11 0 0 1 22 0c0 5-4 7-6 10s-2 6-6 6c-2 0-4-1-5-4z"/><path d="M15 18a5 5 0 0 1 10 0c0 3-3 4-3 6"/>',
    limpeza:'<path d="M20 5c-7 0-12 6-12 14 0 9 6 16 12 16s12-7 12-16c0-8-5-14-12-14z"/><path d="M15 19h.01M25 19h.01M16 27c2 1.5 6 1.5 8 0"/>',
    outro:'<path d="M20 34c-7-4-12-10-12-17 6 0 10 2 12 6 2-4 6-6 12-6 0 7-5 13-12 17z"/><path d="M20 23v11"/>'};
  function icone(s){var n=String(s.id+' '+s.nome).toLowerCase(),k=n.indexOf('auricul')>=0?'auriculo':n.indexOf('limpeza')>=0||n.indexOf('pele')>=0?'limpeza':'outro';
    return '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">'+ICONES[k]+'</svg>'}
  function vitrine(){
    var box=$('svcs');
    if(box&&A.servicos.length)box.innerHTML=A.servicos.map(function(s){
      return '<article class="svc rv in">'+(s.novidade?'<span class="pill">NOVIDADE</span>':'')+'<div class="ic">'+icone(s)+'</div><h3>'+escH(s.nome)+'</h3>'+
        (s.descricao?'<p>'+escH(s.descricao)+'</p>':s.detalhe?'<p>'+escH(s.detalhe)+'</p>':'')+
        (s.preco!=null?'<div class="preco-svc"><span>'+escH(s.preco_obs||'Valor')+'</span><b>'+(s.preco_antes!=null?'<s>'+reais(s.preco_antes)+'</s>':'')+reais(s.preco)+'</b></div>':'')+
        (s.beneficios.length?'<ul>'+s.beneficios.map(function(b){return '<li>'+escH(b)+'</li>'}).join('')+'</ul>':'')+
        '<a class="ir" href="#agendar" data-servico="'+escH(s.id)+'">Agendar '+escH(s.nome.toLowerCase())+'</a></article>'}).join('');
    var nv=$('novo'),s=A.servicos.filter(function(x){return x.novidade})[0];
    if(nv){nv.hidden=!s;if(s)nv.innerHTML='<span class="pill">NOVIDADE</span><span><b>'+escH(s.nome)+'</b>'+(s.desde&&s.desde>hojeLocal()?' a partir de <b>'+curta(s.desde)+'</b>':'')+
      (s.preco!=null?' por <b>'+reais(s.preco)+'</b>'+(s.preco_obs?', '+escH(s.preco_obs):''):'')+'.</span><span class="seta" aria-hidden="true">→</span>';
      if(s)nv.setAttribute('data-servico',s.id)}
  }
  // "Agendar ..." já deixa o serviço escolhido
  document.addEventListener('click',function(e){var a=e.target.closest('[data-servico]');if(!a)return;var id=a.getAttribute('data-servico');
    if(A.servicos.some(function(x){return x.id===id})){S.servico=id;aviso='';render()}});

  function opt(a,b,pill,on,dis){var el=document.createElement('button');el.type='button';el.className='opt';el.setAttribute('aria-pressed',on?'true':'false');if(dis)el.disabled=true;
    el.innerHTML=(pill?'<span class="pill">'+escH(pill)+'</span>':'')+'<span class="a">'+escH(a)+'</span>'+(b?'<span class="b">'+escH(b)+'</span>':'');return el}

  function convite(){
    var el=$('conv');if(!FILTRO){el.hidden=true;return}
    el.hidden=false;
    el.innerHTML=verTodos?'Mostrando todos os dias. <button type="button" data-cv="voltar">Voltar aos dias separados</button>':
      '<b>'+(NOME_CONV?escH(NOME_CONV)+', a Amanda':'A Amanda')+' separou estes dias para você:</b> '+FILTRO.map(function(d){return sem(d).toLowerCase()+' '+curta(d)}).join(', ')+'.<br><button type="button" data-cv="todos">Ver todos os dias</button>';
  }
  $('conv').onclick=function(e){var b=e.target.closest('[data-cv]');if(!b)return;verTodos=b.getAttribute('data-cv')==='todos';S.dia=null;S.hora=null;render()};

  function render(){
    conferir();convite();
    var o=$('o-servico');o.innerHTML='';
    if(!A.servicos.length)o.innerHTML='<p class="empty">'+CAL+'<span>Os serviços estão sendo atualizados. <a class="js-wa" href="https://wa.me/'+A.whatsapp+'">Chame a Amanda no WhatsApp</a>.</span></p>';
    A.servicos.forEach(function(s){var el=opt(s.nome,(precoCurto(s)?precoCurto(s)+' · ':'')+s.detalhe,s.novidade?'NOVIDADE':'',S.servico===s.id);el.onclick=function(){S.servico=s.id;aviso='';render()};o.appendChild(el)});

    var ds=dias();o=$('o-dia');o.innerHTML='';
    if(falhou)o.innerHTML='<p class="empty">'+CAL+'<span>Não consegui carregar a agenda agora. <a class="js-wa" href="https://wa.me/'+A.whatsapp+'">Chame a Amanda no WhatsApp</a>.</span></p>';
    else if(!ds.length&&FILTRO&&!verTodos&&slots.length)o.innerHTML='<p class="empty">'+CAL+'<span><b>Esses horários já foram preenchidos.</b><br>Toque em “Ver todos os dias” acima ou <a class="js-wa" href="https://wa.me/'+A.whatsapp+'">chame a Amanda no WhatsApp</a>.</span></p>';
    else if(!ds.length)o.innerHTML='<p class="empty">'+CAL+'<span><b>Novas datas em breve.</b><br>Quer um horário antes? <a class="js-wa" href="https://wa.me/'+A.whatsapp+'">Chame a Amanda no WhatsApp</a>.</span></p>';
    ds.forEach(function(d){var x=utc(d.data),livres=d.slots.filter(cabe),cedo=cedoDemais(d.data);
      var sub=cedo?'a partir de '+curta(servico().desde):livres.length?sem(d.data).toLowerCase():'lotado';
      var el=opt(dd(x.getUTCDate())+' '+MES[x.getUTCMonth()],sub,'',S.dia===d.data,!livres.length||cedo);
      el.onclick=function(){S.dia=d.data;S.hora=null;aviso='';render()};o.appendChild(el)});

    o=$('o-hora');
    if(S.dia){o.innerHTML='';var d=ds.filter(function(x){return x.data===S.dia})[0];
      if(d)d.slots.forEach(function(q){var ok=cabe(q),el=opt(hh(q.hora),ok?'':'ocupado','',S.hora===q.id,!ok);el.onclick=function(){S.hora=q.id;aviso='';render()};o.appendChild(el)})}
    else o.innerHTML='<p class="empty">'+CAL+'<span>Escolha um dia primeiro.</span></p>';

    $('go').disabled=enviando||reservado||!(S.servico&&S.dia&&S.hora&&$('nome').value.trim().length>1&&(!live||telOk()));
    var r=$('resumo'),sl=slot(),sv=servico();
    if(reservado)return;
    if(aviso){r.innerHTML=aviso;r.className='resumo on warn'}
    else if(sv&&S.dia&&sl){r.innerHTML='<span class="tk-l">SEU HORÁRIO</span><b class="tk-s">'+escH(sv.nome)+(precoCurto(sv)?' · '+precoCurto(sv):'')+'</b><span class="tk-d">'+sem(S.dia)+', '+curta(S.dia)+' às '+hh(sl.hora)+'</span>';r.className='resumo on'}
    else r.className='resumo';
    progresso();
  }

  // barra de progresso e marcas de etapa concluída
  var ROTULOS=['Escolha o serviço','Escolha o dia','Escolha o horário','Diga seu nome','Informe seu WhatsApp'];
  function progresso(){
    var ok=[!!S.servico,!!S.dia,!!S.hora,$('nome').value.trim().length>1,telOk()];
    var total=live?5:4,feitos=0,atual=-1;
    for(var i=0;i<total;i++){if(ok[i])feitos++;else if(atual<0)atual=i}
    var segs=$('segs');if(segs.children.length!==total){segs.innerHTML='';for(var k=0;k<total;k++)segs.appendChild(document.createElement('i'))}
    for(var j=0;j<total;j++)segs.children[j].className=ok[j]?'on':j===atual?'at':'';
    [].forEach.call(document.querySelectorAll('.step[data-s]'),function(el){var n=+el.getAttribute('data-s')-1;el.classList.toggle('done',!!ok[n])});
    $('plabel').textContent=reservado?'Horário reservado':atual<0?'Tudo pronto · toque em confirmar':'Passo '+(atual+1)+' de '+total+' · '+ROTULOS[atual];
  }

  // telefone: aceita qualquer jeito de digitar e mostra no formato (11) 91234-5678
  function digitos(){var t=$('tel').value.replace(/\D/g,'');if(t.indexOf('55')===0&&(t.length===12||t.length===13))t=t.slice(2);return t}
  function telOk(){var t=digitos();return t.length===10||t.length===11}
  function formata(){var t=digitos();if(t.length<3)return;var a=t.slice(0,2),b=t.slice(2);
    $('tel').value='('+a+') '+(b.length>(t.length===11?5:4)?b.slice(0,t.length===11?5:4)+'-'+b.slice(t.length===11?5:4):b)}

  $('stTel').hidden=!live;
  if(NOME_CONV)$('nome').value=NOME_CONV;
  var SERV_CONV=QS.get('s')||'';
  function servicoDoLink(){if(SERV_CONV&&!S.servico&&A.servicos.some(function(x){return x.id===SERV_CONV}))S.servico=SERV_CONV;SERV_CONV=''}
  if(live)$('hint').textContent='Para garantir o horário, toque no botão abaixo e envie a mensagem de confirmação pelo WhatsApp. Ele fica guardado para você enquanto a Amanda confirma.';
  $('nome').oninput=function(){aviso='';render()};
  $('tel').oninput=function(){aviso='';render()};
  $('tel').onblur=function(){if(telOk())formata()};

  // medição de visitas (medicao.js): só conta se a visitante aceitou os cookies
  function medir(nome,p){try{if(window.medir)window.medir(nome,p)}catch(e){}}
  // o link do WhatsApp leva o nome da cliente na mensagem: por isso é um botão, e não um link
  function abrirWa(url){var b=$('resumo').querySelector('.abre-wa');if(b)b.onclick=function(){location.href=url}}
  $('go').onclick=function(){
    var sv=servico(),sl=slot(),nome=$('nome').value.trim();if(!sv||!sl)return;
    var msg='Olá Amanda! Quero agendar:\n\n• '+sv.nome+'\n• '+sem(S.dia)+', '+curta(S.dia)+' às '+hh(sl.hora)+'\n\nMeu nome é '+nome+'.';
    var url='https://wa.me/'+A.whatsapp+'?text='+encodeURIComponent(msg);
    if(!live){medir('agendamento',{servico:sv.nome});location.href=url;return}
    enviando=true;$('goTxt').textContent='Reservando…';render();
    fetch(C.url+'/rest/v1/rpc/pedir_horario',{method:'POST',headers:cab(),
      body:JSON.stringify({p_id:sl.id,p_servico:sv.nome,p_nome:nome,p_telefone:digitos()})})
      .then(function(r){if(!r.ok)throw 0;return r.json()})
      .then(function(res){
        enviando=false;$('goTxt').textContent='Confirmar pelo WhatsApp';
        if(res==='ok'){
          reservado=true;render();
          $('resumo').innerHTML='<b>Horário guardado para você!</b><br>'+escH(sv.nome)+', '+sem(S.dia).toLowerCase()+' '+curta(S.dia)+' às '+hh(sl.hora)+'.<br>Agora envie a mensagem no WhatsApp para a Amanda confirmar.<br><button type="button" class="abre-wa">Abrir o WhatsApp</button>';
          $('resumo').className='resumo on ok';abrirWa(url);medir('agendamento',{servico:sv.nome});location.href=url;return}
        // proteção do guardião ligada: a Amanda confirma direto pelo WhatsApp
        if(res==='pausado'){
          reservado=true;render();
          $('resumo').innerHTML='<b>Quase lá!</b><br>Envie a mensagem no WhatsApp e a Amanda confirma seu horário por lá.<br><button type="button" class="abre-wa">Abrir o WhatsApp</button>';
          $('resumo').className='resumo on ok';abrirWa(url);medir('agendamento',{servico:sv.nome});location.href=url;return}
        if(res==='conflito'){S.hora=null;aviso='<b>Esse horário ficou apertado para o procedimento.</b><br>Ele encosta em outro atendimento. Escolha outro horário, por favor.';return load().then(render)}
        if(res==='servico'){S.servico=null;S.dia=null;S.hora=null;aviso='<b>Os serviços acabaram de ser atualizados.</b><br>Escolha o serviço de novo, por favor.';return load().then(render)}
        if(res==='limite'){aviso='<b>Você já tem 2 horários reservados.</b><br>Para marcar mais, fale com a Amanda no WhatsApp.';render();return}
        if(res==='dados'){aviso='<b>Confira seu nome e WhatsApp.</b><br>Use o número com DDD.';render();return}
        S.hora=null;aviso='<b>Esse horário acabou de ser pego.</b><br>Escolha outro, por favor.';
        return load().then(render)})
      .catch(function(){enviando=false;$('goTxt').textContent='Confirmar pelo WhatsApp';
        aviso='<b>Não consegui reservar agora.</b><br>Confira a internet e tente de novo, ou toque em “Fale comigo” abaixo.';render()});
  };

  var hi=encodeURIComponent('Olá Amanda! Vim pelo site e queria tirar uma dúvida.');
  function linksWa(){[].forEach.call(document.querySelectorAll('.js-wa'),function(a){a.href='https://wa.me/'+A.whatsapp+'?text='+hi})}
  load().then(function(){servicoDoLink();render();linksWa()});
  linksWa();
  // quem deixa a página aberta e volta depois vê os horários atualizados
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&live&&!enviando&&!reservado)load().then(function(){render();linksWa()})});

  // barra superior e botão flutuante: aparecem conforme a posição na página
  var fab=document.querySelector('.fab'),bar=$('bar'),vis={};
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){vis[e.target.id]=e.isIntersecting});
      fab.classList.toggle('off',!!(vis.topo||vis.agendar));bar.classList.toggle('on',!vis.topo)},{rootMargin:'0px 0px -35% 0px'});
    io.observe($('topo'));io.observe($('agendar'));
    // entrada suave dos blocos, só se a pessoa não pediu menos movimento
    var rvs=document.querySelectorAll('.rv');
    if(!window.matchMedia||!matchMedia('(prefers-reduced-motion: reduce)').matches){
      var ro=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');ro.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px',threshold:.08});
      [].forEach.call(rvs,function(el){ro.observe(el)});
      setTimeout(function(){[].forEach.call(rvs,function(el){el.classList.add('in')})},6000);
    }else document.documentElement.classList.remove('js');
  }else{fab.classList.remove('off');document.documentElement.classList.remove('js')}
})();
