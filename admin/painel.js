// Painel da Amanda: pedidos, agenda, envio de horários, serviços, histórico, segurança e conta.
(function(){
  // o painel nunca abre dentro de outra página (evita cliques enganosos)
  if(window.top!==window.self){try{window.top.location.replace(location.href)}catch(e){}document.documentElement.style.display='none';return}
  var C=window.SUPABASE||{},$=function(i){return document.getElementById(i)};
  var SEM=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  var PADRAO=['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00'];
  var extras=[],escolhidas={'13:00':1,'14:00':1,'15:00':1,'16:00':1,'17:00':1};
  var rows=[],sess=null,aberto=null,pergunta=null,ocupado=false,relogio=null,ultimo=null;
  var motivoEstranho='',servs=null,bancoVelho=false,destino=null,guard=null,semGuardiao=false,abaAtual='inicio';
  var hist={itens:[],fim:false,busca:'',ok:false,seq:0};
  var retornos=null,retAdiar=null,retOcup=false;
  // faturamento detalhado: filtro escolhido e os atendimentos já trazidos do banco (de carregadoDe até hoje)
  var fat={modo:'mes',ancora:null,de:null,ate:null,serv:'',prof:'',linhas:null,carregadoDe:null,desde:null,seq:0,mais:40,volta:'inicio',erro:'',carregando:false,diaAuto:false,fp:null};
  function zerarFat(){fat.linhas=null;fat.carregadoDe=null;fat.desde=null;fat.seq++;fat.carregando=false;fat.erro=''}
  // Várias profissionais: o mesmo painel serve a Amanda (site dela) e o Studio La Rocha (window.PAINEL, em marca.js)
  var P=window.PAINEL||{};
  var eu=null,profs=[],recursos=null,visao='minha';
  try{visao=localStorage.getItem('amanda-visao')==='todas'?'todas':'minha'}catch(e){}
  function minhaProf(){return (eu&&eu.profissional)||'amanda'}
  function profDe(r){return (r&&r.profissional)||minhaProf()}
  function todas(){return !!(eu&&eu.socia&&!eu.velho&&visao==='todas')}
  // filtro da agenda: nulo = todas as profissionais
  function filtro(){return eu&&eu.velho?null:todas()?null:minhaProf()}
  function nomeProf(id){var x=profs.filter(function(q){return q.id===id})[0];return x?x.nome:id===minhaProf()&&eu&&eu.nome?eu.nome:id==='amanda'||!id?'Amanda':id}
  function tagProf(r){return todas()&&r.profissional?'<span class="tag-prof">com '+esc(primeiro(nomeProf(r.profissional)))+'</span>':''}
  // para quem abrir horários (sócia vendo todas escolhe; as outras, sempre a própria)
  function comProf(o){o=o||{};if(eu&&!eu.velho)o.p_prof=filtro();return o}
  function alvo(){var s=$('paraQuem');return todas()&&s&&s.value?s.value:minhaProf()}

  // ---------- utilidades ----------
  function dd(n){return (n<10?'0':'')+n}
  function hh(h){return (+h.slice(0,2))+(h.slice(3)==='00'?'h':'h'+h.slice(3))}
  function utc(d){var p=d.split('-');return new Date(Date.UTC(+p[0],+p[1]-1,+p[2]))}
  function somaDias(d,n){var x=utc(d);x.setUTCDate(x.getUTCDate()+n);return x.getUTCFullYear()+'-'+dd(x.getUTCMonth()+1)+'-'+dd(x.getUTCDate())}
  function curta(d){var x=utc(d);return dd(x.getUTCDate())+'/'+dd(x.getUTCMonth()+1)}
  function semana(d){return SEM[utc(d).getUTCDay()]}
  function dia(d){var h=hojeSP();return (d===h?'hoje':d===somaDias(h,1)?'amanhã':semana(d))+', '+curta(d)}
  function esc(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function primeiro(n){return String(n||'').trim().split(/\s+/)[0]}
  function normTel(v){var t=String(v||'').replace(/\D/g,'');if(t.indexOf('55')===0&&(t.length===12||t.length===13))t=t.slice(2);return (t.length===10||t.length===11)?t:''}
  function fmtTel(t){return t?'('+t.slice(0,2)+') '+t.slice(2,-4)+'-'+t.slice(-4):''}
  var POR_FORA=['Combinado por fora','Manual'];
  function servRot(r){return r.servico&&POR_FORA.indexOf(r.servico)<0?r.servico:'Combinado por fora'}
  function deServ(r){return r.servico&&POR_FORA.indexOf(r.servico)<0?' de '+r.servico:''}

  // Relógio: usa a hora do servidor (Brasília), nunca a do celular.
  function agoraSP(){
    if(relogio)return new Date(relogio.srv+(Date.now()-relogio.local));
    var p={};try{new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
      .formatToParts(new Date()).forEach(function(x){p[x.type]=x.value})}catch(e){var n=new Date();return new Date(Date.UTC(n.getFullYear(),n.getMonth(),n.getDate(),n.getHours(),n.getMinutes()))}
    return new Date(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour%24,+p.minute));
  }
  function hojeSP(){var x=agoraSP();return x.getUTCFullYear()+'-'+dd(x.getUTCMonth()+1)+'-'+dd(x.getUTCDate())}
  function agoraTxt(){var x=agoraSP();return hojeSP()+' '+dd(x.getUTCHours())+':'+dd(x.getUTCMinutes())}
  function passou(r){return (r.data+' '+r.hora)<=agoraTxt()}
  function idade(iso){if(!iso)return '';var m=Math.max(0,Math.round((Date.now()-new Date(iso).getTime())/60000));
    return m<1?'agora mesmo':m<60?'há '+m+' min':m<1440?'há '+Math.floor(m/60)+' h':'há '+Math.floor(m/1440)+' dia'+(m>=2880?'s':'')}

  // Mensagens prontas para a Amanda mandar à cliente
  function zapUrl(r,tipo){
    if(!r.telefone)return '';
    var n=primeiro(r.nome),q=semana(r.data)+', '+curta(r.data)+' às '+hh(r.hora),t,eu1='Aqui é a '+primeiro(nomeProf(profDe(r)));
    var h0=hojeSP(),rel=r.data===h0?'hoje':r.data===somaDias(h0,1)?'amanhã':'';
    if(tipo==='confirmar')t='Oi, '+n+'! '+eu1+'. Seu horário'+deServ(r)+' está confirmado para '+q+'. O pagamento é feito no dia, no salão. Qualquer coisa, é só me chamar. Até lá!';
    else if(tipo==='lembrar')t='Oi, '+n+'! '+eu1+'. Passando para lembrar do seu horário'+deServ(r)+' '+(rel?rel+' ('+q+')':'no dia '+q)+'. Te espero! Se precisar remarcar, é só me avisar por aqui.';
    else if(tipo==='remarcar')t='Oi, '+n+'! '+eu1+'. Seu horário'+deServ(r)+' mudou para '+q+'. Qualquer dúvida, é só me chamar por aqui.';
    else if(tipo==='recusar')t='Oi, '+n+'! '+eu1+'. Infelizmente não vou conseguir te atender '+q+'. Quer escolher outro horário? É só me responder aqui.';
    else if(tipo==='cancelar')t='Oi, '+n+'! '+eu1+'. Precisei desmarcar seu horário de '+q+'. Me desculpe! Quer remarcar? É só me responder aqui.';
    else t='Oi, '+n+'! '+eu1+', sobre o seu horário'+deServ(r)+' em '+q+'.';
    return 'https://wa.me/55'+r.telefone+'?text='+encodeURIComponent(t);
  }

  // ---------- avisos ----------
  var tTimer;
  function toast(txt,erro,link,linkTxt){
    var t=$('toast');clearTimeout(tTimer);
    t.className='toast'+(erro?' erro':'');
    t.innerHTML='<div>'+esc(txt)+'</div><div class="acoes">'+(link?'<a class="btn zap" target="_blank" rel="noopener" href="'+esc(link)+'">'+esc(linkTxt)+'</a>':'')+'<button class="fechar" type="button" data-fechar>Fechar</button></div>';
    t.hidden=false;
    tTimer=setTimeout(function(){t.hidden=true},link?15000:erro?9000:5000);
  }

  // ---------- sessão ----------
  try{sess=JSON.parse(localStorage.getItem('amanda-sess')||'null')}catch(e){}
  function salvar(s){sess=s;try{s?localStorage.setItem('amanda-sess',JSON.stringify(s)):localStorage.removeItem('amanda-sess')}catch(e){}}
  function auth(caminho,corpo){
    return fetch(C.url+'/auth/v1/'+caminho,{method:'POST',headers:{apikey:C.anonKey,'Content-Type':'application/json'},body:JSON.stringify(corpo)})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok){var e=new Error('auth');e.status=r.status;throw e}return j})},
            function(){var e=new Error('rede');e.rede=true;throw e});
  }
  // novo login (email informado) começa a contar as 24 horas; renovar o token mantém o início e a "linha de base" dos alertas
  function paraSessao(j,email){return {token:j.access_token,refresh:j.refresh_token,exp:Date.now()+(j.expires_in||3600)*1000-120000,
    email:String(email||(j.user&&j.user.email)||(sess&&sess.email)||'').toLowerCase(),inicio:email||!sess?Date.now():(sess.inicio||Date.now()),
    base:email||!sess?undefined:sess.base}}
  // por segurança, o painel fica aberto por 24 horas e pede a senha uma vez por dia
  var VINTE_QUATRO_HORAS=24*3600*1000;
  if(sess&&!sess.inicio){sess.inicio=Date.now();salvar(sess)}
  function expirou(){return !!(sess&&Date.now()-(sess.inicio||0)>VINTE_QUATRO_HORAS)}
  function encerrar(msg,escopo){var fim=sairServidor(escopo);salvar(null);rows=[];guard=null;clientes=null;hist.ok=false;sugs=undefined;ola=null;olaPronto=false;retornos=null;zerarFat();fat.prof='';fat.serv='';fat.fp=null;$('ola').hidden=true;irAba('inicio');mostrar(msg);return fim}
  var MSG_24H='Por segurança, o painel pede a senha uma vez por dia. Entre de novo, por favor.';
  function msgExpirou(){return MSG_24H}
  var renovando=null;
  function token(){
    if(!sess)return Promise.reject('sessao');
    if(expirou()){var s0=sess,msg0=msgExpirou();salvar(null);fetch(C.url+'/auth/v1/logout',{method:'POST',headers:{apikey:C.anonKey,Authorization:'Bearer '+s0.token}}).catch(function(){});rows=[];mostrar(msg0);return Promise.reject('sessao')}
    if(Date.now()<sess.exp)return Promise.resolve(sess.token);
    if(!renovando)renovando=auth('token?grant_type=refresh_token',{refresh_token:sess.refresh})
      .then(function(j){if(!sess)throw 'sessao';salvar(paraSessao(j));return sess.token},function(e){if(e.rede)throw 'rede';salvar(null);throw 'sessao'})
      .then(function(t){renovando=null;return t},function(e){renovando=null;throw e});
    return renovando;
  }
  // Erros: 'sessao' (precisa entrar de novo), 'rede' (sem internet), 'ausente' (falta atualizar o banco), 'erro' (o banco recusou)
  function api(metodo,caminho,corpo,extra){
    return token().then(function(t){
      var h={apikey:C.anonKey,Authorization:'Bearer '+t,'Content-Type':'application/json'};if(extra)for(var k in extra)h[k]=extra[k];
      return fetch(C.url+'/rest/v1/'+caminho,{method:metodo,headers:h,body:corpo===undefined?undefined:JSON.stringify(corpo)}).catch(function(){throw 'rede'});
    }).then(function(r){
      if(r.status===401){salvar(null);mostrar('Sua sessão expirou. Entre de novo, por favor.');throw 'sessao'}
      if(r.status===404)throw 'ausente';
      if(!r.ok)return r.text().then(function(t){throw /recurso_ocupado/.test(t||'')?'recurso':'erro'},function(){throw 'erro'});
      return r.text().then(function(t){return t?JSON.parse(t):null});
    });
  }

  // ---------- telas ----------
  function mostrar(msgLogin){
    var on=!!(sess&&C.url&&C.anonKey);
    $('vLogin').hidden=on;$('vApp').hidden=!on;fecharSheet();
    if(!on&&$('email').value){try{$('senha').focus()}catch(e){}}
    if(!C.url||!C.anonKey){$('bLogin').disabled=true;erroLogin('O painel ainda não foi ligado ao Supabase. Preencha o arquivo config.js.')}
    else if(msgLogin)erroLogin(msgLogin);
    if(on)carregar();
  }
  function erroLogin(t){var m=$('mLogin');m.textContent=t;m.hidden=!t}

  // lembra só o e-mail neste aparelho; a senha vem do Chaveiro/gerenciador do celular
  function lembrarLogin(email){try{localStorage.setItem('amanda-email',email)}catch(e){}}
  (function(){var em='';try{em=localStorage.getItem('amanda-email')||''}catch(e){}
    if(em&&!$('email').value)$('email').value=em;
  })();
  $('fLogin').onsubmit=function(e){
    e.preventDefault();var em=$('email').value.trim().toLowerCase(),se=$('senha').value;
    if(!em||!se){erroLogin('Preencha o e-mail e a senha.');return}
    $('bLogin').disabled=true;$('bLogin').textContent='Entrando…';erroLogin('');
    auth('token?grant_type=password',{email:em,password:se})
      .then(function(j){salvar(paraSessao(j,em));lembrarLogin(em);return quemSou()})
      .then(function(q){
        if(!q){salvar(null);erroLogin('Este e-mail entrou, mas não tem acesso à agenda. Confira o e-mail cadastrado no arquivo do banco.');return}
        $('senha').value='';mostrar();
      })
      .catch(function(err){salvar(null);erroLogin(err&&err.rede||err==='rede'?'Sem conexão. Confira a internet e tente de novo.':err&&err.status===400?'E-mail ou senha incorretos.':'Não consegui entrar agora. Tente de novo em instantes.')})
      .then(function(){$('bLogin').disabled=false;$('bLogin').textContent='Entrar'});
  };
  // quem está no painel; no banco antigo (sem profissionais), só a Amanda
  function quemSou(){
    return api('POST','rpc/quem_sou',{}).then(function(q){return q||null},function(e){
      if(e!=='ausente')throw e;
      return api('POST','rpc/sou_admin',{}).then(function(a){return a===true?{profissional:'amanda',nome:'Amanda Rocha',socia:true,velho:true}:null})});
  }
  // encerra sessões no Supabase: sem escopo, só esta; 'others', todas as outras
  function sairServidor(escopo){
    if(!sess)return Promise.resolve(false);
    return token().then(function(t){return fetch(C.url+'/auth/v1/logout'+(escopo?'?scope='+escopo:''),{method:'POST',headers:{apikey:C.anonKey,Authorization:'Bearer '+t}})})
      .then(function(r){return r.ok},function(){return false});
  }
  // e-mail de quem está logada (sessões antigas não guardavam: lê do próprio token)
  function emailSessao(){
    if(sess&&sess.email)return sess.email;
    try{var b=sess.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return String(JSON.parse(decodeURIComponent(escape(atob(b)))).email||'').toLowerCase()}catch(e){return ''}
  }
  $('bSair').onclick=function(){encerrar()};

  // ---------- abas ----------
  var DO_MAIS={numeros:1,clientes:1,servicos:1,historico:1,seguranca:1,ajuda:1,conta:1,profissionais:1};
  function irAba(n){
    if(!document.querySelector('[data-aba="'+n+'"]'))n='inicio';
    abaAtual=n;var nav=DO_MAIS[n]?'mais':n;
    if(n==='faturamento')nav=fat.volta==='numeros'?'mais':'inicio';
    [].forEach.call(document.querySelectorAll('[data-aba]'),function(x){x.hidden=x.getAttribute('data-aba')!==n});
    [].forEach.call(document.querySelectorAll('[data-aba-btn]'),function(b){b.setAttribute('aria-current',b.getAttribute('data-aba-btn')===nav?'page':'false')});
    try{sessionStorage.setItem('amanda-aba',n)}catch(e){}
    window.scrollTo(0,0);
    if(n==='historico'&&sess)carregarHist(true);
    if(n==='clientes'&&sess)carregarClientes();
    if(n==='numeros'&&sess)carregarNumeros();
    if(n==='faturamento'&&sess&&eu)carregarFat();
    if(n==='conta')$('cEmail').textContent=sess&&emailSessao()?'Conectada como '+emailSessao():'Conectada';
    if(n==='seguranca')verSeguranca();
    desenharSelos();
  }
  function mostrarAbrir(sim,parado){$('cardAbrir').hidden=!sim;$('bMostrarAbrir').textContent=sim?'Fechar':'Abrir novos horários';$('bMostrarAbrir').className='btn '+(sim?'ghost':'main');if(sim&&!parado)$('cardAbrir').scrollIntoView({block:'start'})}
  $('bMostrarAbrir').onclick=function(){mostrarAbrir($('cardAbrir').hidden)};
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-aba-btn],[data-ir]');if(!b)return;
    irAba(b.getAttribute('data-aba-btn')||b.getAttribute('data-ir'));
    if(b.hasAttribute('data-abrir-form'))mostrarAbrir(true);
  });
  (function(){var a=null;try{a=sessionStorage.getItem('amanda-aba')}catch(e){}if(a&&document.querySelector('[data-aba="'+a+'"]'))irAba(a)})();

  // ---------- carregar ----------
  // cada carga ganha um número; se outra começou depois (ou ela acabou de salvar algo), a resposta antiga é descartada
  // e nunca aparece por cima da mais nova
  var geracao=0;
  function carregar(){
    var minha=++geracao,atual=function(){if(minha!==geracao)throw 'velho'};
    return api('POST','rpc/agora_sp',{})
      .then(function(s){atual();var m=/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/.exec(s||'');
        if(m)relogio={srv:Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)),local:Date.now()}})
      .then(function(){return quemSou()})
      .then(function(q){atual();if(!q){encerrar('Este e-mail não tem mais acesso à agenda.');throw 'velho'}eu=q;
        if(eu.velho)return [];
        var tolera=function(e){if(e!=='erro'&&e!=='ausente')throw e;return []};
        return Promise.all([api('GET','profissionais?select=id,nome,papel,ativo,email,ordem&order=ordem.asc,nome.asc').catch(tolera),
                            recursos?recursos:api('GET','recursos?select=id,nome&order=nome.asc').catch(tolera)]).then(function(x){recursos=x[1];return x[0]})})
      .then(function(l){atual();profs=l||[];var f=filtro();
        return api('GET','horarios?select=*&data=gte.'+hojeSP()+(f?'&profissional=eq.'+encodeURIComponent(f):'')+'&order=data.asc,hora.asc')})
      .then(function(j){atual();rows=j||[];ultimo=agoraSP();$('semNet').hidden=true;
        return api('GET','servicos?select=*&order=ordem.asc,nome.asc').then(function(sv){atual();servs=sv||[];bancoVelho=false},function(e){atual();if(e!=='erro'&&e!=='ausente')throw e;servs=null;bancoVelho=true})})
      .then(function(){return api('POST','rpc/situacao_guardiao',{}).then(function(g){atual();guard=g;semGuardiao=false;motivoEstranho=acessoEstranho()||alertaNovo();if(motivoEstranho)throw 'estranho'},function(e){atual();if(e!=='erro'&&e!=='ausente')throw e;guard=null;semGuardiao=true})})
      .then(function(){atual();$('bancoVelho').hidden=!(bancoVelho||semGuardiao);desenhar();var esp=[carregarNumeros(),carregarRetornos()];if(!semGuardiao)esp.push(carregarClientes());prepararOla(esp);if(SUG_LIGADAS&&sugs===undefined)carregarSugestoes()})
      .catch(function(e){
        if(e==='estranho'){encerrar(motivoEstranho+' Desconectei todos os aparelhos por segurança. Se foi você, é só entrar de novo. Se não foi, entre e troque sua senha em Mais › Minha conta.','global');return}
        if(e==='velho'||minha!==geracao)return;
        if(e==='rede'||e==='erro'){$('semNet').hidden=false;if(!ultimo)$('pedidos').innerHTML='<p class="vazio">Não consegui carregar.</p>'}});
  }
  setInterval(function(){if(sess&&expirou()){encerrar(msgExpirou());return}if(sess&&!document.hidden&&!ocupado&&!pergunta)carregar()},30000);
  document.addEventListener('visibilitychange',function(){if(sess&&!document.hidden&&!ocupado)carregar()});
  window.addEventListener('online',function(){if(sess)carregar()});
  $('bAtualizar').onclick=function(){carregar()};

  // ---------- desenhar ----------
  function desenhar(){
    var x=ultimo||agoraSP();
    $('atualizado').textContent='Atualizado às '+dd(x.getUTCHours())+':'+dd(x.getUTCMinutes())+' · atualiza sozinho';
    var ped=rows.filter(function(r){return r.status==='pedido'});
    var n=$('nPed');n.hidden=!ped.length;n.textContent=ped.length;nPedidos=ped.length;badgeInicio();$('blocoPed').hidden=!ped.length;document.title=(ped.length?'('+ped.length+') ':'')+(P.titulo||'Agenda da Amanda');
    $('pedidos').innerHTML=ped.length?ped.map(function(r){
      var min=r.pedido_em?(Date.now()-new Date(r.pedido_em).getTime())/60000:0,z=zapUrl(r,'falar');
      return '<div class="card ped"><div class="nome">'+esc(r.nome)+tagProf(r)+'</div>'+
        '<div class="qd">'+esc(r.servico)+'<br><b>'+dia(r.data)+' às '+hh(r.hora)+'</b><br>Pedido '+idade(r.pedido_em)+'</div>'+
        (passou(r)?'<div class="passou">Esse horário já passou.</div>':min>180?'<div class="velho">Esperando sua resposta há bastante tempo.</div>':'')+
        (z?'<a class="btn zap-leve" target="_blank" rel="noopener" href="'+esc(z)+'">Chamar '+esc(primeiro(r.nome))+' no WhatsApp</a>':'')+
        '<div class="row"><button class="btn ok" data-a="confirmar" data-id="'+esc(r.id)+'" type="button">Confirmar</button>'+
        '<button class="btn bad" data-a="perg-recusar" data-id="'+esc(r.id)+'" type="button">Recusar</button></div></div>'}).join(''):'';

    var por={},ordem=[];rows.forEach(function(r){if(!por[r.data]){por[r.data]=[];ordem.push(r.data)}por[r.data].push(r)});
    $('agenda').innerHTML=ordem.length?ordem.map(function(d){
      var c={livre:0,pedido:0,confirmado:0};por[d].forEach(function(r){c[r.status]++});
      var resumo=[c.livre?c.livre+' livre'+(c.livre>1?'s':''):'',c.pedido?c.pedido+' pedido'+(c.pedido>1?'s':''):'',c.confirmado?c.confirmado+' confirmado'+(c.confirmado>1?'s':''):''].filter(Boolean).join(' · ');
      return '<div class="dia"><h3><span>'+dia(d)+'</span><button class="dia-op" type="button" data-acao="dia" data-dia="'+d+'">Opções do dia</button></h3><div class="resumo">'+resumo+'</div>'+gruposProf(por[d]).map(function(g){return (todas()?'<h4 class="prof-t">'+esc(nomeProf(g.prof))+'</h4>':'')+'<div class="chips">'+g.itens.map(function(r){
        var bloq=r.status==='livre'&&!cabeEm(r,menorDuracao(profDe(r))),rot=r.status==='livre'?(bloq?'bloqueado':'livre'):esc(primeiro(r.nome));
        return '<button class="s '+r.status+(bloq?' bloq':'')+(passou(r)?' velho':'')+'" data-abrir="'+esc(r.id)+'" type="button" aria-label="'+esc(hh(r.hora)+', '+(r.status==='livre'?(bloq?'livre, mas bloqueado por outro atendimento':'livre'):r.status+' para '+r.nome))+'">'+hh(r.hora)+'<small>'+(r.faltou?'não veio':passou(r)?'passou':rot)+'</small></button>'}).join('')+'</div>'}).join('')+'</div>'}).join(''):
      '<p class="vazio">Nenhum horário aberto ainda. Toque em “Abrir novos horários” acima.</p>';
    if(!rows.length&&$('cardAbrir').hidden)mostrarAbrir(true,true);
    desenharProximos();
    desenharOla();
    desenharVisao();
    desenharServicos();
    desenharEnvio();
    desenharProfs();
    desenharGuardiao();
    // com uma pergunta aberta, não redesenha (não apaga o que ela está digitando);
    // a ação continua segura porque só vale se o horário não tiver mudado
    if(aberto&&!pergunta)desenharSheet();
  }

  // horários de um dia separados por profissional (na visão "todas"), a dela primeiro
  function gruposProf(l){if(!todas())return [{prof:minhaProf(),itens:l}];var m={},o=[];l.forEach(function(r){var k=profDe(r);if(!m[k]){m[k]=[];o.push(k)}m[k].push(r)});
    o.sort(function(a,b){return a===minhaProf()?-1:b===minhaProf()?1:ordemProf(a)-ordemProf(b)});return o.map(function(k){return {prof:k,itens:m[k]}})}
  function ordemProf(id){var x=profs.filter(function(q){return q.id===id})[0];return x?x.ordem||0:99}
  // ---------- qual agenda ver (sócias) e como a cliente vê ----------
  function linkComoCliente(){var f=todas()?'':minhaProf();return P.agenda?new URL(P.agenda,location.href).href+(f?'?p='+encodeURIComponent(f):''):'../?o=painel#agendar'}
  function desenharVisao(){
    var v=$('visao');if(v){v.hidden=!(eu&&eu.socia&&!eu.velho);[].forEach.call(v.querySelectorAll('[data-visao]'),function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-visao')===(todas()?'todas':'minha')))})}
    [].forEach.call(document.querySelectorAll('[data-como-cliente]'),function(a){a.href=linkComoCliente()});
    var t=$('tAgenda');if(t)t.textContent=todas()?'Agenda de todas as profissionais':'Minha agenda';
    var pq=$('paraQuemBox'),sq=$('paraQuem');
    if(pq){pq.hidden=!todas();var ativas=profs.filter(function(x){return x.ativo!==false}),sel=sq.value||minhaProf();
      sq.innerHTML=ativas.map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===sel?' selected':'')+'>'+esc(x.nome)+(x.id===minhaProf()?' (eu)':'')+'</option>'}).join('')}
    var mp=$('mProf');if(mp)mp.hidden=!(eu&&eu.socia&&!eu.velho);
    var cab=$('cabNome');if(cab&&P.cabecalho)cab.textContent=P.cabecalho;
  }
  document.addEventListener('click',function(e){var b=e.target.closest('[data-visao]');if(!b)return;
    visao=b.getAttribute('data-visao')==='todas'?'todas':'minha';try{localStorage.setItem('amanda-visao',visao)}catch(x){}
    clientes=null;numeros=null;hist.ok=false;zerarFat();fat.prof='';fat.fp=null;desenharVisao();carregar().then(function(){if(abaAtual==='clientes')carregarClientes();if(abaAtual==='numeros')carregarNumeros()})});


  // ---------- Início: saudação, próximos 2 meses e convite para divulgar ----------
  // Saudação: primeiro os momentos especiais (o que está acontecendo de verdade), senão uma frase do horário.
  // Cada frase tem a saudação (com o nome) e uma mensagem; humor só de vez em quando.
  var OLA={manha:[['Bom dia, {n}! ☀️','Cada cliente sai das suas mãos se sentindo melhor. Que dia bonito pra isso.'],['Bom dia, {n}! 🌿','Quem cuida com afeto deixa marca. Hoje é dia de deixar a sua.'],['Bom dia, {n}! 🌱','Grandes histórias começam com dias como o de hoje.'],['Bom dia, {n}! ☕','Primeiro o café, depois a gente conquista o mundo.']],
    tarde:[['Boa tarde, {n}! ✨','Seu cuidado faz diferença na vida de alguém hoje.'],['Boa tarde, {n}! 💚','Você transformou um sonho em agenda. Isso não é pouca coisa.'],['Boa tarde, {n}! 🌸','Cuidar de quem precisa é o seu jeito de mudar o mundo.'],['Boa tarde, {n}! 💡','Passo a passo, cliente a cliente, o seu nome vai crescendo.']],
    noite:[['Boa noite, {n}! 🤍','Orgulho do que você tá construindo.'],['Boa noite, {n}! 🌙','Alguém foi dormir mais tranquila hoje graças ao seu cuidado.'],['Boa noite, {n}! ✨','Quem cuida também precisa de cuidado. Descansa, você merece.'],['Boa noite, {n}! 💫','O que você planta hoje, a sua agenda colhe amanhã.']]};
  var ola=null,olaPronto=false,MESES3=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  function periodo(h){return h>=5&&h<12?'manha':h>=12&&h<18?'tarde':'noite'}
  // momentos: [prioridade (1 = sempre que acontecer), saudação, mensagem]
  function momentos(){
    var x=agoraSP(),hr=x.getUTCHours(),agora=hr*60+x.getUTCMinutes(),h=hojeSP(),w=utc(h).getUTCDay(),dm=h.slice(5),am=somaDias(h,1),M=[];
    var conf=rows.filter(function(r){return r.status==='confirmado'}),hj=conf.filter(function(r){return r.data===h}),hjF=hj.filter(function(r){return !passou(r)}),hjP=hj.filter(passou);
    var ped=rows.filter(function(r){return r.status==='pedido'&&!passou(r)});
    if(eu&&eu.aniversario===dm)M.push([1,'Feliz aniversário, {n}! 🎂','Hoje quem merece todo o cuidado do mundo é você. Aproveita o seu dia! 💛']);
    if(hr<5)M.push([1,'Ué, {n}, acordada a essa hora? 🦉','Até as grandes precisam dormir.']);
    if(dm==='03-08')M.push([1,'Feliz Dia da Mulher, {n}! 🌷','Você cuida de tantas… hoje o carinho é todo seu.']);
    if(dm==='05-12')M.push([1,'Feliz Dia da Enfermagem, {n}! 🩺','Ciência e afeto no mesmo cuidado. Esse é o seu jeito.']);
    var prox=hjF.map(function(r){return {r:r,m:minutos(r.hora)-agora}}).filter(function(o){return o.m>0&&o.m<=75})[0];
    if(prox)M.push([1,(prox.m>=45?'Daqui a 1 hora':'Daqui a pouco')+' tem a '+primeiro(prox.r.nome)+', {n}. 💆‍♀️','Tudo pronto pra recebê-la?']);
    if(numeros&&numeros.mes){var fat=+numeros.mes.faturamento,meta=numeros.meta!=null?+numeros.meta:null,ant=+numeros.anterior.faturamento,mc=marcoDoMes(numeros),mi=+String(numeros.hoje).slice(5,7)-1;
      if(meta&&fat>=meta)M.push([1,'Meta batida, {n}! 🎉','Isso é fruto do seu esforço. Aproveita esse momento.']);
      if(mc)M.push([1,mc+' atendimentos, {n}! 🎉','São '+mc+' histórias de cuidado com a sua assinatura.']);
      if(ant>0&&fat>ant)M.push([2,cap(MESES[mi])+' já passou '+MESES[(mi+11)%12]+', {n}! 📈','Seu trabalho tá crescendo e todo mundo tá vendo.'])}
    if(ped.length){var cl=clientes||[],volta=ped.filter(function(r){return r.telefone&&cl.some(function(c){return c.telefone===r.telefone&&+c.atendimentos>0})})[0];
      if(volta)M.push([2,'A '+primeiro(volta.nome)+' voltou, {n}! 💚','Cliente que volta é o maior elogio que existe.']);
      else if(clientes&&ped.some(function(r){return !r.telefone||!cl.some(function(c){return c.telefone===r.telefone})}))M.push([2,'Cliente nova chegando, {n}! 🌷','Alguém te descobriu e quis ser cuidada por você.']);
      else M.push([2,'Oi, {n}! 🔔','Tem cliente querendo um horário com você. Sinal de que o seu trabalho tá sendo visto.'])}
    if(w===6){
      if(hr>=18&&hjP.length&&!hjF.length)M.push([2,'Mais um sábado lindo, {n}! 🌙',(minhaProf()==='amanda'?'Hoje '+vezes(hjP.length,'mulher foi cuidada','mulheres foram cuidadas')+' por você.':'Hoje você cuidou de '+vezes(hjP.length,'cliente','clientes')+'.')+' Agora é sua vez de descansar.']);
      else if(hjF.length&&!rows.some(function(r){return r.data===h&&r.status==='livre'&&!passou(r)&&profDe(r)===minhaProf()})&&hj.length>=3)M.push([2,'Agenda cheia, {n}! 🙌','Tá ficando famosa, hein? Merecido.']);
      else if(hjF.length>=2)M.push([2,'Hoje são '+hjF.length+' clientes confiando no seu cuidado, {n}. 🌸','Que sábado lindo te espera.']);
      else if(hjF.length)M.push([2,'Sábado chegou, {n}! 💆‍♀️','Hoje tem gente contando as horas pra ser cuidada por você.'])}
    if(urgentes())M.push([2,'Tem cliente pra chamar de volta hoje, {n}. ↻','Uma mensagem sua pode ser o empurrãozinho que ela precisava pra se cuidar.']);
    if(w===5&&conf.some(function(r){return r.data===am}))M.push([3,'Sexta-feira, {n}! 🌷','Amanhã é dia de fazer o que você ama.']);
    if(w===1)M.push([3,'Segunda-feira, {n}! 🌱','Semana nova, novas pessoas pra cuidar.']);
    var fimSem=somaDias(h,6-w),livres=rows.filter(function(r){return r.status==='livre'&&!passou(r)&&r.data<=fimSem&&profDe(r)===minhaProf()&&cabeEm(r,menorDuracao(profDe(r)))}).length;
    if(livres>=2)M.push([3,'Agenda com espaço essa semana, {n}. ✨','Ótima hora pra compartilhar seu link e encontrar clientes novas.']);
    return M;
  }
  // escolhe uma vez por acesso: momento importante sempre; os outros momentos na maioria das vezes; senão, frase do horário; nunca repete a última
  function escolherOla(){
    var ult=null;try{ult=localStorage.getItem('amanda-ola')}catch(e){}
    var M=momentos(),urg=M.filter(function(m){return m[0]===1}),out=M.filter(function(m){return m[0]>1&&m[1]+m[2]!==ult});
    var per=OLA[periodo(agoraSP().getUTCHours())].filter(function(f){return f[0]+f[1]!==ult}),f;
    if(urg.length)f=urg[0].slice(1);
    else if(out.length&&Math.random()<.65){out.sort(function(a,b){return a[0]-b[0]});var top=out.filter(function(m){return m[0]===out[0][0]});f=top[Math.floor(Math.random()*top.length)].slice(1)}
    else f=per[Math.floor(Math.random()*per.length)];
    try{localStorage.setItem('amanda-ola',f[0]+f[1])}catch(e){}
    return f;
  }
  function desenharOla(){
    if(!eu||!olaPronto)return;
    if(!ola)ola=escolherOla();
    var nome=primeiro(eu.nome||nomeProf(minhaProf()))||'Amanda',h=hojeSP(),x=utc(h),t=ola[0].replace('{n}',nome),m=ola[1].replace('{n}',nome);
    if($('olaT').textContent!==t){$('olaT').textContent=t;$('olaM').textContent=m}
    $('olaD').textContent=SEMLONGA[x.getUTCDay()]+' · '+x.getUTCDate()+' de '+MESES[x.getUTCMonth()];
    var ped=rows.filter(function(r){return r.status==='pedido'}).length,u=urgentes(),hj=rows.filter(function(r){return r.status==='confirmado'&&r.data===h&&!passou(r)}).length,c=[];
    if(ped)c.push('<button type="button" class="ola-chip quente" data-rolar="blocoPed">🔔 '+vezes(ped,'pedido esperando você','pedidos esperando você')+'</button>');
    if(hj)c.push('<span class="ola-chip">📅 Hoje: '+vezes(hj,'atendimento','atendimentos')+'</span>');
    if(u)c.push('<button type="button" class="ola-chip" data-rolar="blocoRet">↻ '+vezes(u,'retorno para chamar','retornos para chamar')+'</button>');
    var ch=$('olaChips'),hc=c.join('');if(ch.innerHTML!==hc)ch.innerHTML=hc;ch.hidden=!c.length;
    $('ola').hidden=false;
  }
  // a primeira saudação espera os números, os retornos e as clientes (no máximo 2,5 s), para escolher com tudo na mão
  function prepararOla(esperas){
    if(olaPronto)return;
    var pronto=function(){if(olaPronto)return;olaPronto=true;desenharOla()};
    Promise.all(esperas.map(function(p){return p&&p.then?p.then(null,function(){}):p})).then(pronto);
    setTimeout(pronto,2500);
  }
  document.addEventListener('click',function(e){var b=e.target.closest('[data-rolar]');if(!b)return;var el=$(b.getAttribute('data-rolar'));if(el&&!el.hidden)el.scrollIntoView({behavior:'smooth',block:'start'})});
  // semana de domingo a sábado; depois de duas semanas, agrupa por mês
  function grupoProx(d){var h=hojeSP(),fim=somaDias(h,6-utc(h).getUTCDay()),fim2=somaDias(fim,7);
    if(d<=fim)return 'Esta semana';if(d<=fim2)return 'Semana que vem';var x=utc(d);return cap(MESES[x.getUTCMonth()])+(d.slice(0,4)!==h.slice(0,4)?' de '+d.slice(0,4):'')}
  var IC_ZAP='<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 4.5a11.5 11.5 0 0 0-9.9 17.3L4.5 27.5l5.9-1.5A11.5 11.5 0 1 0 16 4.5zm6.7 16.1c-.3.8-1.6 1.6-2.3 1.7-1.1.2-1.9.1-4.2-.8-3.5-1.5-5.7-5-5.9-5.3-.2-.2-1.4-1.8-1.4-3.5s.9-2.5 1.2-2.9c.3-.3.7-.4.9-.4h.6c.2 0 .5-.1.8.6l1.1 2.5c.1.2.1.4 0 .6-.6 1.3-1.3 1.2-.9 1.9a9.4 9.4 0 0 0 4.7 4.1c.4.2.6.2.8-.1l1-1.3c.3-.4.5-.3.8-.2l2.3 1.1c.4.2.6.3.7.4.1.2.1.9-.2 1.6z"/></svg>';
  function linkDivulgar(){return P.agenda?new URL(P.agenda,location.href).href+'?p='+encodeURIComponent(minhaProf())+'&de=whatsapp':siteBase()+'agendar/?o=whatsapp'}
  function desenharProximos(){
    var h=hojeSP(),ate=somaDias(h,60),am=somaDias(h,1),em2=somaDias(h,2);
    var prox=rows.filter(function(r){return r.status==='confirmado'&&!passou(r)&&r.data<=ate});
    $('proxT').hidden=!prox.length;
    if(!prox.length){
      var lk=linkDivulgar(),msg='Oi! 💚 Já dá pra agendar comigo pelo link: escolhe o dia e o horário que ficar melhor pra você. '+lk;
      $('proximos').innerHTML='<div class="vazio-bom"><span class="vb-ic" aria-hidden="true">✨</span><b>Sua agenda tá com espaço pra novas clientes</b><p>Compartilhe seu link de agendamento e deixe as clientes escolherem o horário.</p>'+
        '<div class="row"><a class="btn zap" target="_blank" rel="noopener" href="https://wa.me/?text='+esc(encodeURIComponent(msg))+'">'+IC_ZAP.replace('<svg','<svg width="20" height="20"')+'Divulgar</a><button class="btn ghost" type="button" data-copiar-link="'+esc(lk)+'">Copiar link</button></div></div>';
      return;
    }
    var gr=[],m={};prox.forEach(function(r){var g=grupoProx(r.data);if(!m[g]){m[g]=[];gr.push(g)}m[g].push(r)});
    $('proximos').innerHTML=gr.map(function(g){return '<div class="prox-g"><div class="prox-gt"><b>'+esc(g)+'</b><span>'+vezes(m[g].length,'atendimento','atendimentos')+'</span></div><div class="prox-l">'+m[g].map(function(r){
      var x=utc(r.data),hoje=r.data===h,perto=r.data<=em2,z=zapUrl(r,'lembrar'),lb=r.lembrete_em,rot=hoje?'hoje':r.data===am?'amanhã':SEM[x.getUTCDay()].slice(0,3);
      var bt=!z?'<button class="btn ghost mini" type="button" data-abrir="'+esc(r.id)+'">Sem WhatsApp</button>':
        (perto&&!lb?'<a class="btn zap grande" target="_blank" rel="noopener"'+(bancoVelho?'':' data-lembrete="'+esc(r.id)+'"')+' href="'+esc(z)+'">'+IC_ZAP+'Mandar lembrete</a>':
         '<a class="btn zap-leve mini" target="_blank" rel="noopener"'+(bancoVelho?'':' data-lembrete="'+esc(r.id)+'"')+' href="'+esc(z)+'" aria-label="Mandar lembrete para '+esc(primeiro(r.nome))+'">'+IC_ZAP+(lb?'De novo':'Lembrete')+'</a>');
      return '<div class="prox'+(hoje?' hoje':'')+'"><div class="pd"><small>'+rot+'</small><b>'+x.getUTCDate()+'</b><small>'+MESES3[x.getUTCMonth()]+'</small></div>'+
        '<div class="pl"><b>'+esc(r.nome)+'</b>'+tagProf(r)+'<span>'+esc(servRot(r))+' · '+hh(r.hora)+'</span>'+
        (bancoVelho?'':lb?'<span class="lemb ok">✓ Lembrete enviado '+idade(lb)+'</span>':perto?'<span class="lemb">Lembrete ainda não enviado</span>':'')+'</div>'+bt+'</div>'}).join('')+'</div></div>'}).join('');
  }
  document.addEventListener('click',function(e){var b=e.target.closest('[data-copiar-link]');if(!b)return;var t=b.getAttribute('data-copiar-link');
    try{navigator.clipboard.writeText(t).then(function(){toast('Link copiado. É só colar 💚')},function(){toast(t)})}catch(x){toast(t)}});

  // ---------- sugestões de alterações (chegam para o Kevin) ----------
  // em espera (pedido do Kevin, 24/11): a área só aparece com P.sugestoes ou localStorage painel-sugestoes = 1
  var SUG_LIGADAS=!!P.sugestoes||(function(){try{return localStorage.getItem('painel-sugestoes')==='1'}catch(e){return false}})();
  var sugs,sugFoto=null,sugOcup=false,ST_SUG={nova:'Nova',andamento:'Em andamento',feita:'Feita ✓'};
  function carregarSugestoes(){
    sugs=null;
    return api('POST','rpc/minhas_sugestoes',{}).then(function(j){sugs=j||false;desenharSugestoes()},function(e){if(e==='sessao')return;sugs=e==='ausente'?false:null;desenharSugestoes()});
  }
  function desenharSugestoes(){
    var bl=$('blocoSug');
    if(sugs===false){bl.hidden=true;return}
    bl.hidden=false;
    var l=sugs||[];
    $('sugLista').innerHTML=l.length?'<span class="label" style="margin:4px 0 0">Suas sugestões</span>'+l.map(function(x){var d=String(x.criado_em).slice(0,10);
      return '<div class="sug-it"><div class="sug-it-t"><span>'+curta(d)+'</span><em class="sug-st '+esc(x.status)+'">'+esc(ST_SUG[x.status]||x.status)+'</em></div><p>'+esc(x.texto)+'</p>'+
        (x.tem_foto?'<button class="ver-foto" type="button" data-sug-foto="'+esc(x.id)+'">📷 Ver foto</button>':'')+'</div>'}).join(''):'';
  }
  function lerFoto(arq){
    return new Promise(function(ok,erro){
      var fr=new FileReader();fr.onerror=function(){erro('foto')};
      fr.onload=function(){var im=new Image();im.onerror=function(){erro('foto')};im.onload=function(){
        var tenta=function(max,q){var k=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*k));c.height=Math.max(1,Math.round(im.height*k));
          var cx=c.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,c.width,c.height);cx.drawImage(im,0,0,c.width,c.height);return c.toDataURL('image/jpeg',q)};
        var u=tenta(1280,.82);if(u.length>1300000)u=tenta(1024,.7);if(u.length>1300000)u=tenta(800,.6);
        if(u.length>1300000||u.indexOf('data:image/jpeg;base64,')!==0){erro('foto');return}ok(u)};im.src=fr.result};
      fr.readAsDataURL(arq);
    });
  }
  $('sugArq').onchange=function(){var f=this.files&&this.files[0];this.value='';if(!f)return;
    lerFoto(f).then(function(u){sugFoto=u;$('sugImg').src=u;$('sugPrev').hidden=false},function(){toast('Não consegui abrir essa foto. Tente outra.',true)})};
  $('sugTira').onclick=function(){sugFoto=null;$('sugPrev').hidden=true;$('sugImg').removeAttribute('src')};
  $('bSug').onclick=function(){
    var t=$('sugTxt').value.trim(),b=this;
    if(t.length<2){toast('Escreva sua ideia antes de enviar 💚',true);$('sugTxt').focus();return}
    if(sugOcup)return;sugOcup=true;b.disabled=true;b.textContent='Enviando…';
    api('POST','rpc/enviar_sugestao',{p_texto:t,p_foto:sugFoto}).then(function(j){
      if(!j||j.r!=='ok'){toast(j&&j.r==='foto'?'Essa foto não deu certo. Tente outra.':j&&j.r==='limite'?'Muitas sugestões hoje. Manda as outras amanhã 💚':'Não consegui enviar agora. Tente de novo.',true);return}
      $('sugTxt').value='';$('sugTira').onclick();toast('Sugestão enviada! O Kevin já foi avisado 💚');return carregarSugestoes();
    },function(e){if(e!=='sessao')toast(e==='rede'?'Sem conexão. Sua sugestão não foi enviada.':'Não consegui enviar agora. Tente de novo.',true)})
    .then(function(){sugOcup=false;b.disabled=false;b.textContent='Enviar'});
  };
  document.addEventListener('click',function(e){var b=e.target.closest('[data-sug-foto]');if(!b)return;b.disabled=true;
    api('POST','rpc/foto_sugestao',{p_id:b.getAttribute('data-sug-foto')}).then(function(u){
      if(!u||String(u).indexOf('data:image/')!==0){toast('Não consegui abrir a foto agora.',true);return}
      abrirEnvio('<div><div class="t" id="envT">Foto da sugestão</div></div><img class="foto-grande" alt="Foto da sugestão" src="'+esc(u)+'"><button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>')},
      function(){toast('Não consegui abrir a foto agora.',true)}).then(function(){b.disabled=false})});

  // ---------- painel de ações ----------
  function linha(id){return rows.filter(function(r){return r.id===id})[0]}
  function listaServ(prof){var l=servs||(window.AGENDA&&AGENDA.servicos)||[];prof=prof||minhaProf();return l.filter(function(x){return !x.profissional||x.profissional===prof})}
  // ---------- duração dos procedimentos ----------
  // cada atendimento ocupa a duração do serviço (desconhecido ou "combinado por fora": 1 hora)
  function duracaoDe(nome,prof){var n=semAcento(nome),x=listaServ(prof).filter(function(v){return semAcento(v.nome)===n})[0];return x&&+x.duracao?+x.duracao:60}
  function minutos(h){return (+h.slice(0,2))*60+(+h.slice(3,5))}
  function durTxt(m){var h=Math.floor(m/60),r=m%60;return h?h+'h'+(r?dd(r):''):r+' min'}
  // atendimentos do mesmo dia que se sobrepõem a [hora, hora + dur), ignorando os ids informados
  function conflitos(data,hora,dur,ignorar,prof){var a=minutos(hora),b=a+dur;ignorar=ignorar||[];prof=prof||minhaProf();
    return rows.filter(function(o){if(o.data!==data||o.status==='livre'||ignorar.indexOf(o.id)>=0||profDe(o)!==prof)return false;var c=minutos(o.hora);return c<b&&c+duracaoDe(o.servico,profDe(o))>a})}
  // horário livre que fica dentro de um atendimento que já começou (ex.: 14h30 dentro da limpeza das 14h)
  function dentroDe(r){var a=minutos(r.hora);return rows.filter(function(o){if(o.data!==r.data||o.status==='livre'||o.id===r.id||profDe(o)!==profDe(r))return false;var c=minutos(o.hora);return c<a&&c+duracaoDe(o.servico,profDe(o))>a})[0]}
  // um horário livre "cabe" um procedimento de dur minutos sem encostar em ninguém
  function cabeEm(r,dur){return r.status==='livre'&&!conflitos(r.data,r.hora,dur,[r.id],profDe(r)).length}
  function menorDuracao(prof){var d=listaServ(prof).filter(function(x){return x.ativo!==false}).map(function(x){return +x.duracao||60});return d.length?Math.min.apply(null,d):60}
  function textoConflito(l){return l.map(function(o){return esc(primeiro(o.nome))+' às '+hh(o.hora)+' ('+esc(servRot(o))+', '+durTxt(duracaoDe(o.servico,profDe(o)))+')'}).join(' e ')}
  function opcoesServ(sel,prof){var l=listaServ(prof).map(function(x){return x.nome});if(sel&&POR_FORA.indexOf(sel)<0&&l.indexOf(sel)<0)l.unshift(sel);
    return '<option value="">Combinado por fora</option>'+l.map(function(n){return '<option'+(n===sel?' selected':'')+'>'+esc(n)+'</option>'}).join('')}
  function campos(r,prof){r=r||{};return '<label for="fNome">Nome da cliente</label><input type="text" id="fNome" maxlength="60" value="'+esc(r.nome&&r.nome!=='Marcado por fora'?r.nome:'')+'" placeholder="Ex.: Maria Silva">'+
    '<label for="fTel">WhatsApp da cliente (opcional)</label><input type="tel" id="fTel" inputmode="tel" value="'+esc(fmtTel(r.telefone))+'" placeholder="(11) 90000-0000">'+
    '<label for="fServ">Serviço</label><select id="fServ">'+opcoesServ(r.servico,prof)+'</select>'+
    (temValor()?'<label for="fValor">Valor cobrado (R$)</label><input type="text" inputmode="decimal" id="fValor" maxlength="9" value="'+esc(r.valor!=null?fmtPreco(r.valor):'')+'" placeholder="'+esc(phValor(r.servico,prof))+'"><p class="dica">Vazio: vale o preço do serviço. Cortesia: 0.</p>':'')}
  // o banco só guarda o valor de cada atendimento depois da atualização
  function temValor(){return !!(rows.length&&('valor' in rows[0]))}
  function phValor(nome,prof){var n=semAcento(nome),x=listaServ(prof).filter(function(v){return semAcento(v.nome)===n})[0];return x&&x.preco!=null?'Preço do serviço: '+rs(x.preco):'Opcional'}
  function comValor(o,f){if(temValor())o.valor=f.valor;return o}
  function lerForm(){var v=($('fTel')||{}).value||'',fv=$('fValor'),pv=fv?lerPreco(fv.value):null;
    return {nome:(($('fNome')||{}).value||'').trim().slice(0,60),tel:normTel(v),telErro:!!v.trim()&&!normTel(v),serv:($('fServ')||{}).value||'',valor:pv,valorErro:typeof pv==='number'&&isNaN(pv)}}
  function livresPara(r){var m={},o=[];rows.forEach(function(x){if(x.status!=='livre'||x.id===r.id||passou(x)||profDe(x)!==profDe(r))return;if(!m[x.data]){m[x.data]=[];o.push(x.data)}m[x.data].push(x)});return o.map(function(d){return {data:d,itens:m[d]}})}
  function abrirSheet(id){aberto=id;pergunta=null;destino=null;desenharSheet()}
  function fecharSheet(){aberto=null;pergunta=null;destino=null;$('sheet').hidden=true;if($('envio').hidden)$('veu').hidden=true}
  function desenharSheet(){
    var r=linha(aberto),s=$('sheet');
    if(!r){fecharSheet();return}
    var nomes={livre:'Livre',pedido:'Pedido',confirmado:'Confirmado'},nm=esc(primeiro(r.nome));
    var h='<div><span class="estado '+r.status+'">'+nomes[r.status]+'</span><div class="t" id="sheetT">'+dia(r.data)+' às '+hh(r.hora)+'</div>'+
      (r.status!=='livre'?'<div class="d">'+esc(r.nome)+' · '+esc(servRot(r))+(r.valor!=null?' · '+rs(r.valor):'')+(r.telefone?' · '+fmtTel(r.telefone):'')+'</div>':'')+
      (r.lembrete_em?'<div class="d" style="color:var(--ok)">✓ Lembrete enviado '+idade(r.lembrete_em)+'</div>':'')+
      (r.faltou?'<div class="d" style="color:var(--bad)">Anotado: a cliente não veio.</div>':passou(r)?'<div class="d" style="color:var(--bad)">Esse horário já passou.</div>':'')+'</div>';
    if(r.status==='livre'&&!pergunta){var dn=dentroDe(r),cf=dn?null:conflitos(r.data,r.hora,menorDuracao(profDe(r)),[r.id],profDe(r));
      if(dn)h+='<div class="aviso-dur">As clientes não conseguem marcar este horário pelo site: ele fica dentro do atendimento de '+textoConflito([dn])+'.</div>';
      else if(cf.length)h+='<div class="aviso-dur">As clientes não conseguem marcar este horário pelo site: não dá tempo de nenhum procedimento antes do atendimento de '+textoConflito(cf)+'.</div>'}
    var dis=ocupado?' disabled':'',V='<button class="btn ghost" data-a="voltar" type="button">Voltar</button>';
    if(pergunta==='recusar')h+='<div class="pergunta">Recusar o pedido de '+nm+'? O horário volta a ficar livre no site.</div><button class="btn bad-solid" data-a="recusar" type="button"'+dis+'>Sim, recusar</button>'+V;
    else if(pergunta==='cancelar')h+='<div class="pergunta">Cancelar o horário de '+nm+'? Ele volta a ficar livre no site.</div><button class="btn bad-solid" data-a="cancelar" type="button"'+dis+'>Sim, cancelar e liberar</button>'+V;
    else if(pergunta==='excluir')h+='<div class="pergunta">Cancelar o horário de '+nm+' e apagar este horário da agenda? Ele some do site.</div><button class="btn bad-solid" data-a="excluir" type="button"'+dis+'>Sim, cancelar e apagar</button>'+V;
    else if(pergunta==='remover')h+='<div class="pergunta">Remover este horário da agenda? Ele some do site.</div><button class="btn bad-solid" data-a="remover" type="button"'+dis+'>Sim, remover</button>'+V;
    else if(pergunta==='faltou')h+='<div class="pergunta">Marcar que '+nm+' não veio? Esse atendimento sai da sua conta e fica anotado na ficha dela.</div><button class="btn bad-solid" data-a="faltou" type="button"'+dis+'>Sim, não veio</button>'+V;
    else if(pergunta==='ocupar')h+=campos(null,profDe(r))+'<button class="btn main" data-a="ocupar" type="button"'+dis+'>Marcar como ocupado</button>'+V;
    else if(pergunta==='editar')h+=campos(r,profDe(r))+'<button class="btn main" data-a="editar" type="button"'+dis+'>Salvar alterações</button>'+V;
    else if(pergunta==='retorno')h+=formRetorno(r)+V;
    else if(pergunta==='mover')h+='<label for="fData">Dia</label><input type="date" id="fData" value="'+r.data+'" min="'+hojeSP()+'"><label for="fHora">Horário</label><input type="time" id="fHora" value="'+r.hora+'" step="900"><button class="btn main" data-a="mover" type="button"'+dis+'>Salvar novo dia e horário</button>'+V;
    else if(pergunta==='remarcar'){
      var op=livresPara(r),dst=destino&&linha(destino);
      var cfr=dst?conflitos(dst.data,dst.hora,duracaoDe(r.servico,profDe(r)),[r.id,dst.id],profDe(r)):[];
      h+='<div class="destinos"><span class="label">Para qual horário livre?</span>'+(op.length?op.map(function(g){return '<h4>'+dia(g.data)+'</h4><div class="chips">'+g.itens.map(function(x){return '<button class="chip" type="button" data-destino="'+esc(x.id)+'" aria-pressed="'+(destino===x.id)+'">'+hh(x.hora)+'</button>'}).join('')+'</div>'}).join(''):'<p class="vazio">Nenhum horário livre. Abra um horário antes e volte aqui.</p>')+'</div>'+
        (cfr.length?'<div class="aviso-dur forte"><b>Atenção:</b> '+esc(servRot(r))+' leva '+durTxt(duracaoDe(r.servico,profDe(r)))+'. Nesse horário vai encostar no atendimento de '+textoConflito(cfr)+'.</div>':'')+
        '<button class="btn main" data-a="remarcar" type="button"'+(dst&&!ocupado?'':' disabled')+'>'+(dst?(cfr.length?'Remarcar mesmo assim':'Remarcar '+nm+' para '+dia(dst.data)+' às '+hh(dst.hora)):'Escolha o novo horário')+'</button>'+V;
    }
    else{
      if(r.status==='pedido'){var z=zapUrl(r,'falar');h+='<button class="btn ok" data-a="confirmar" data-id="'+esc(r.id)+'" type="button"'+dis+'>Confirmar</button>'+(z?'<a class="btn zap-leve" target="_blank" rel="noopener" href="'+esc(z)+'">Chamar no WhatsApp</a>':'')}
      if(r.status==='confirmado'&&passou(r)&&('faltou' in r))h+=r.faltou?'<button class="btn ghost" data-a="veio" type="button"'+dis+'>Ela veio, sim (desfazer)</button>':'<button class="btn ghost" data-a="perg-faltou" type="button">Não veio…</button>';
      if(r.status==='confirmado'&&!passou(r)){var zl=zapUrl(r,'lembrar'),zc=zapUrl(r,'confirmar');h+=(zl?'<a class="btn zap" target="_blank" rel="noopener"'+(bancoVelho?'':' data-lembrete="'+esc(r.id)+'"')+' href="'+esc(zl)+'">Mandar lembrete</a><a class="btn zap-leve" target="_blank" rel="noopener" href="'+esc(zc)+'">Mandar confirmação</a>':'')}
      if(r.status!=='livre'&&retornos){var rt=retornoDe(r.id);h+=rt?'<div class="ret-info">'+IC_RET.volta+'<div><b>Retorno '+(rt.data<hojeSP()?'atrasado, era ':'')+dia(rt.data)+'</b>'+(rt.obs?'<span>'+esc(rt.obs)+'</span>':'')+'</div><span class="st'+(rt.status==='agendou'?'':rt.status==='sem_resposta'?' bad':' warn')+'">'+esc(ROT_RET[rt.status])+'</span></div><button class="btn ghost" data-a="perg-retorno" type="button">Mudar retorno</button>':'<button class="btn ret-bt" data-a="perg-retorno" type="button">'+IC_RET.volta+'Marcar retorno</button>'}
      if(r.status!=='livre')h+=(bancoVelho?'<button class="btn ghost" data-a="perg-editar" type="button">Editar dados</button>':'<div class="row"><button class="btn ghost" data-a="perg-editar" type="button">Editar dados</button><button class="btn ghost" data-a="perg-remarcar" type="button">Remarcar</button></div>')+
        (r.status==='pedido'?'<button class="btn bad" data-a="perg-recusar" type="button">Recusar…</button>':'<button class="btn bad" data-a="perg-cancelar" type="button">Cancelar e liberar…</button>')+
        '<button class="btn bad" data-a="perg-excluir" type="button">Cancelar e apagar este horário…</button>';
      if(r.status==='livre')h+='<button class="btn main" data-a="perg-ocupar" type="button">Marcar como ocupado (marquei por fora)</button><button class="btn ghost" data-a="perg-mover" type="button">Mudar dia ou horário</button><button class="btn bad" data-a="perg-remover" type="button">Remover horário…</button>';
      h+='<button class="btn ghost" data-a="fechar" type="button">Fechar</button>';
    }
    s.innerHTML=h;s.hidden=false;$('veu').hidden=false;
    var f=s.querySelector('input');if(f&&pergunta)f.focus();
  }


  // ---------- retornos (a profissional combina quando a cliente volta) ----------
  var ROT_RET={pendente:'pendente',enviada:'mensagem enviada',agendou:'agendou',sem_resposta:'não respondeu'},DIAS_RET=[15,21,30,45,60],nPedidos=0;
  function retornoDe(hid){return (retornos||[]).filter(function(x){return x.horario_id===hid})[0]||null}
  function urgentes(){var h=hojeSP();return (retornos||[]).filter(function(x){return x.status==='pendente'&&x.data<=h}).length}
  function badgeInicio(){var t=nPedidos+urgentes(),b=$('nPedNav');b.hidden=!t;b.textContent=t}
  function carregarRetornos(){
    return api('POST','rpc/retornos_lista',comProf()).then(function(j){retornos=j||[];desenharRetornos();desenharOla();if(aberto&&!pergunta)desenharSheet()},
      function(e){if(e==='sessao')return;if(e==='ausente'){retornos=null;desenharRetornos()}});
  }
  function diasEntre(a,b){return Math.round((utc(b)-utc(a))/864e5)}
  function zapRetorno(x){
    if(!x.telefone)return '';
    var h=hojeSP(),oq=x.obs||(x.servico?x.servico.toLowerCase():'próxima sessão'),quando=(x.profissional||minhaProf())==='amanda'?'nesse sábado':'nos próximos dias';
    var t='Oi, '+primeiro(x.nome)+'! Tudo bem? Aqui é a '+primeiro(nomeProf(x.profissional||minhaProf()))+' 💛 '+(x.data<h?'Já passou um pouquinho da hora da sua ':'Já tá chegando a hora da sua ')+oq+', como combinamos. Quer que eu reserve um horário pra você '+quando+'?';
    return 'https://wa.me/55'+x.telefone+'?text='+encodeURIComponent(t);
  }
  var IC_RET={volta:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>',
    zap:'<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 4.5a11.5 11.5 0 0 0-9.9 17.3L4.5 27.5l5.9-1.5A11.5 11.5 0 1 0 16 4.5zm6.7 16.1c-.3.8-1.6 1.6-2.3 1.7-1.1.2-1.9.1-4.2-.8-3.5-1.5-5.7-5-5.9-5.3-.2-.2-1.4-1.8-1.4-3.5s.9-2.5 1.2-2.9c.3-.3.7-.4.9-.4h.6c.2 0 .5-.1.8.6l1.1 2.5c.1.2.1.4 0 .6-.6 1.3-1.3 1.2-.9 1.9a9.4 9.4 0 0 0 4.7 4.1c.4.2.6.2.8-.1l1-1.3c.3-.4.5-.3.8-.2l2.3 1.1c.4.2.6.3.7.4.1.2.1.9-.2 1.6z"/></svg>',
    ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    nao:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12z"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/></svg>',
    relogio:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'};
  function pilulaRet(x,h){var atr=x.data<h,da=atr?diasEntre(x.data,h):0;
    return atr?'<span class="ret-dt atras">Atrasado · '+da+(da>1?' dias':' dia')+'</span>':x.data===h?'<span class="ret-dt hoje">Hoje</span>':
      '<span class="ret-dt">'+(x.data===somaDias(h,1)?'Amanhã':semana(x.data).slice(0,3))+', '+curta(x.data)+'</span>'}
  function opcoesAdiar(x,h){
    if((x.profissional||minhaProf())==='amanda'){var w=utc(h).getUTCDay(),s1=somaDias(h,((6-w+7)%7)||7);return [0,7,14].map(function(k){var d=somaDias(s1,k);return {d:d,t:'sáb, '+curta(d)}})}
    return [7,15,30].map(function(k){return {d:somaDias(h,k),t:'+'+k+' dias'}});
  }
  function desenharRetornos(){
    var bl=$('blocoRet');if(!bl)return;
    if(!retornos){bl.hidden=true;badgeInicio();return}
    var h=hojeSP(),ate=somaDias(h,7),l=retornos.filter(function(x){return (x.status==='pendente'||x.status==='enviada')&&x.data<=ate});
    bl.hidden=!l.length;
    var u=urgentes(),n=$('nRet');n.hidden=!u;n.textContent=u;badgeInicio();
    $('retornos').innerHTML=l.length?l.map(function(x){
      var atr=x.data<h,z=zapRetorno(x),env=x.status==='enviada',id=esc(x.id),ini=esc((String(x.nome||'?').trim().charAt(0)||'?').toUpperCase());
      return '<div class="ret'+(atr?' atras':'')+'">'+
        '<div class="ret-top"><span class="ret-av" aria-hidden="true">'+ini+'</span><div class="ret-q"><b>'+esc(x.nome)+'</b>'+tagProf(x)+'<span>'+esc(x.servico||'Combinado por fora')+'</span>'+pilulaRet(x,h)+'</div></div>'+
        (x.obs?'<p class="ret-obs">'+IC_RET.volta+'<span>'+esc(x.obs)+'</span></p>':'')+
        (env?'<p class="ret-env">'+IC_RET.ok+'Mensagem enviada '+idade(x.enviada_em)+'</p>':'')+
        (z?'<a class="btn '+(env?'zap-leve':'zap')+' ret-zap" target="_blank" rel="noopener" data-ret-zap="'+id+'" href="'+esc(z)+'">'+IC_RET.zap+(env?'Chamar de novo':'Chamar no WhatsApp')+'</a>':'<p class="dica">Sem WhatsApp no cadastro dela.</p>')+
        '<div class="ret-acoes"><button type="button" class="sim" data-ret="agendou" data-id="'+id+'">'+IC_RET.ok+'Agendou</button>'+
          '<button type="button" data-ret="sem_resposta" data-id="'+id+'">'+IC_RET.nao+'Não respondeu</button>'+
          '<button type="button" data-ret="'+(retAdiar===x.id?'fechar-adiar':'adiar')+'" data-id="'+id+'" aria-expanded="'+(retAdiar===x.id)+'">'+IC_RET.relogio+'Adiar</button></div>'+
        (retAdiar===x.id?'<div class="adiar"><span class="adiar-t">Lembrar de novo em…</span><div class="chips">'+opcoesAdiar(x,h).map(function(o){return '<button class="chip" type="button" data-ret="para" data-d="'+o.d+'" data-id="'+id+'">'+o.t+'</button>'}).join('')+'</div>'+
          '<label for="adData" style="margin:4px 0 0">ou escolha a data</label><div class="adiar-d"><input type="date" id="adData" min="'+h+'" max="'+somaDias(h,730)+'"><button class="btn main" type="button" data-ret="adiar-data" data-id="'+id+'">Salvar</button></div>'+
          '<button class="ret-rem" type="button" data-ret="apagar" data-id="'+id+'">Remover este retorno</button></div>':'')+
        '</div>'}).join(''):
      '';
  }
  function marcarRet(id,st,data,msg){
    if(retOcup)return;retOcup=true;
    return api('POST','rpc/marcar_retorno',{p_id:id,p_status:st||null,p_data:data||null}).then(function(j){
      retOcup=false;
      if(!j||j.r!=='ok'){toast(j&&j.r==='data'?'Escolha uma data a partir de hoje.':'Não deu certo. Nada foi alterado. Tente de novo.',true);return}
      if(msg)toast(msg);retAdiar=null;return carregarRetornos();
    },function(e){retOcup=false;falha(e)});
  }
  document.addEventListener('click',function(e){
    var z=e.target.closest('[data-ret-zap]');if(z){marcarRet(z.getAttribute('data-ret-zap'),'enviada');return}
    var b=e.target.closest('[data-ret]');if(!b)return;
    var a=b.getAttribute('data-ret'),id=b.getAttribute('data-id'),h=hojeSP();
    if(a==='adiar'){retAdiar=id;desenharRetornos();return}
    if(a==='fechar-adiar'){retAdiar=null;desenharRetornos();return}
    if(a==='agendou')marcarRet(id,'agendou',null,'Anotado: ela agendou. 💛');
    else if(a==='sem_resposta')marcarRet(id,'sem_resposta',null,'Anotado: não respondeu. O retorno sai da lista.');
    else if(a==='para'){var d=b.getAttribute('data-d');marcarRet(id,null,d,'Retorno adiado para '+dia(d)+'.')}
    else if(a==='adiar-data'){var v=($('adData')||{}).value;if(!v||v<h){toast('Escolha uma data a partir de hoje.',true);return}marcarRet(id,null,v,'Retorno adiado para '+dia(v)+'.')}
    else if(a==='apagar'){if(retOcup)return;retOcup=true;api('POST','rpc/apagar_retorno',{p_id:id}).then(function(){retOcup=false;retAdiar=null;toast('Retorno removido.');return carregarRetornos()},function(er){retOcup=false;falha(er)})}
  });
  // formulário da ficha do horário
  function formRetorno(r){
    var rt=retornoDe(r.id),h=hojeSP();
    return '<div class="ret-form"><span class="label" style="margin-top:4px">Quando ela deve voltar?</span><div class="chips" id="rtDias">'+DIAS_RET.map(function(n){return '<button class="chip" type="button" data-rt-dias="'+n+'" aria-pressed="false">'+n+' dias</button>'}).join('')+'</div>'+
      '<label for="rtData">ou escolha a data</label><input type="date" id="rtData" min="'+h+'" max="'+somaDias(h,730)+'" value="'+(rt?esc(rt.data):'')+'"><p class="dica" id="rtPrev">'+(rt?prevRet(rt.data):'Escolha quantos dias ou uma data.')+'</p>'+
      '<label for="rtObs">O que é o retorno? <span style="font-weight:500;color:var(--muted)">(vai na mensagem)</span></label><input type="text" id="rtObs" maxlength="80" placeholder="Ex.: manutenção da limpeza" value="'+(rt&&rt.obs?esc(rt.obs):'')+'">'+
      '<p class="dica">A mensagem fica assim: “Já tá chegando a hora da sua <i>manutenção da limpeza</i>, como combinamos.”</p></div>'+
      '<button class="btn main" type="button" data-rt="salvar">Salvar retorno</button>'+(rt?'<button class="btn bad" type="button" data-rt="apagar">Remover retorno</button>':'');
  }
  // a Amanda atende aos sábados: se a data cair em outro dia, oferece o sábado mais perto
  function sabadoPerto(d){var w=utc(d).getUTCDay(),ant=somaDias(d,-((w+1)%7)),dep=somaDias(d,(6-w+7)%7);return ant>=hojeSP()&&(w+1)%7<=(6-w+7)%7?ant:dep}
  function prevRet(d){if(!d)return '';var r=linha(aberto),sab=utc(d).getUTCDay()===6,ama=r&&profDe(r)==='amanda';
    return 'Retorno em <b>'+dia(d)+'</b>'+(!sab&&ama?'<span class="sab-sug">Não é sábado. <button type="button" data-rt-sab="'+sabadoPerto(d)+'">Usar '+dia(sabadoPerto(d))+'</button></span>':'')}
  document.addEventListener('click',function(e){
    var c=e.target.closest('[data-rt-dias]');
    if(c){var r=linha(aberto);if(!r)return;var n=+c.getAttribute('data-rt-dias'),base=r.data<hojeSP()?hojeSP():r.data,d=somaDias(base,n);
      $('rtData').value=d;$('rtPrev').innerHTML=prevRet(d);[].forEach.call(document.querySelectorAll('[data-rt-dias]'),function(x){x.setAttribute('aria-pressed',x===c)});return}
    var sb=e.target.closest('[data-rt-sab]');if(sb){var ds=sb.getAttribute('data-rt-sab');$('rtData').value=ds;$('rtPrev').innerHTML=prevRet(ds);[].forEach.call(document.querySelectorAll('[data-rt-dias]'),function(x){x.setAttribute('aria-pressed','false')});return}
    var b=e.target.closest('[data-rt]');if(!b)return;
    var r2=linha(aberto);if(!r2||retOcup)return;
    if(b.getAttribute('data-rt')==='apagar'){var rt=retornoDe(r2.id);if(!rt)return;retOcup=true;
      api('POST','rpc/apagar_retorno',{p_id:rt.id}).then(function(){retOcup=false;toast('Retorno removido.');pergunta=null;return carregarRetornos()},function(er){retOcup=false;falha(er)});return}
    var d=($('rtData')||{}).value,o=(($('rtObs')||{}).value||'').trim();
    if(!d){toast('Escolha quantos dias ou uma data para o retorno.',true);return}
    if(d<hojeSP()){toast('Escolha uma data a partir de hoje.',true);return}
    retOcup=true;
    api('POST','rpc/salvar_retorno',{p_horario:r2.id,p_data:d,p_obs:o||null}).then(function(j){
      retOcup=false;
      if(!j||j.r!=='ok'){toast(j&&j.r==='data'?'Escolha uma data a partir de hoje.':j&&j.r==='dados'?'Tire o link da orientação e tente de novo.':'Não deu certo. Nada foi alterado. Tente de novo.',true);return}
      toast('Retorno marcado para '+dia(d)+'.');pergunta=null;return carregarRetornos().then(function(){desenharSheet()});
    },function(er){retOcup=false;falha(er)});
  });
  document.addEventListener('input',function(e){if(e.target&&e.target.id==='rtData'){$('rtPrev').innerHTML=prevRet(e.target.value);[].forEach.call(document.querySelectorAll('[data-rt-dias]'),function(x){x.setAttribute('aria-pressed','false')})}});

  // ---------- ações (só valem se o horário ainda estiver como ela viu) ----------
  var MUDOU='Esse horário mudou enquanto você olhava (talvez uma cliente tenha pedido agora). Atualizei a tela: confira e tente de novo.';
  var RECURSO='Esse horário usa a maca (ou outro lugar do salão) que outra profissional já está usando. Nada foi alterado. Escolha outro horário.';
  function falha(e){if(e==='recurso'){toast(RECURSO,true);return}if(e!=='sessao')toast(e==='rede'?'Sem conexão. Nada foi alterado. Tente de novo quando a internet voltar.':'Não deu certo. Nada foi alterado. Tente de novo.',true)}
  function mudar(r,esperado,campos){
    return api('PATCH','horarios?id=eq.'+r.id+'&status=in.('+esperado+')',campos,{Prefer:'return=representation'})
      .then(function(j){if(!j||!j.length){toast(MUDOU,true);return false}return true});
  }
  // campos que voltam a ficar vazios quando o horário é liberado
  // (lembrete_em só existe depois da atualização do banco; mandar antes faz o banco recusar tudo)
  function limpa(){var x={status:'livre',nome:null,servico:null,telefone:null,pedido_em:null};if(!bancoVelho)x.lembrete_em=null;return x}
  function executar(acao,r){
    if(ocupado)return;
    var antes={id:r.id,data:r.data,hora:r.hora,nome:r.nome,servico:r.servico,telefone:r.telefone},quando=dia(r.data)+' às '+hh(r.hora),p,f;
    // conferências antes de mandar ao banco
    if(acao==='ocupar'||acao==='editar'){f=lerForm();if(f.telErro){toast('Confira o WhatsApp: use o número com DDD.',true);return}if(f.valorErro){toast('Confira o valor: use só números, como 75 ou 89,90.',true);return}if(acao==='editar'&&f.nome.length<2){toast('Escreva o nome da cliente.',true);return}}
    if(acao==='mover'){var nd=$('fData').value,nh=$('fHora').value;if(!/^\d{4}-\d\d-\d\d$/.test(nd)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(nh)){toast('Escolha o dia e o horário.',true);return}if(nd===r.data&&nh===r.hora){pergunta=null;desenharSheet();return}}
    if(acao==='remarcar'&&!(destino&&linha(destino))){toast('Escolha o novo horário.',true);return}
    ocupado=true;
    if(acao==='confirmar')p=mudar(r,'pedido',{status:'confirmado'}).then(function(ok){if(ok){var z=zapUrl(antes,'confirmar');toast('Confirmado: '+primeiro(antes.nome)+', '+quando+'.',false,z,'Avisar '+primeiro(antes.nome)+' no WhatsApp')}return ok});
    else if(acao==='recusar')p=mudar(r,'pedido',limpa()).then(function(ok){if(ok){var z=zapUrl(antes,'recusar');toast('Pedido recusado. '+quando+' voltou a ficar livre.',false,z,'Avisar '+primeiro(antes.nome)+' no WhatsApp')}return ok});
    else if(acao==='cancelar')p=mudar(r,'confirmado',limpa()).then(function(ok){if(ok){var z=zapUrl(antes,'cancelar');toast('Horário cancelado. '+quando+' voltou a ficar livre.',false,z,'Avisar '+primeiro(antes.nome)+' no WhatsApp')}return ok});
    else if(acao==='ocupar')p=mudar(r,'livre',comValor({status:'confirmado',nome:f.nome.length>1?f.nome:'Marcado por fora',servico:f.serv||'Combinado por fora',telefone:f.tel||null,pedido_em:new Date().toISOString()},f)).then(function(ok){if(ok)toast(quando+' marcado como ocupado'+(f.nome.length>1?' para '+primeiro(f.nome):'')+'.');return ok});
    else if(acao==='editar')p=mudar(r,r.status,comValor({nome:f.nome,telefone:f.tel||null,servico:f.serv||'Combinado por fora'},f)).then(function(ok){if(ok)toast('Dados de '+primeiro(f.nome)+' atualizados.');return ok});
    else if(acao==='faltou')p=mudar(r,'confirmado',{faltou:true}).then(function(ok){if(ok)toast('Anotado: '+primeiro(antes.nome)+' não veio. Esse atendimento saiu da sua conta.');return ok});
    else if(acao==='veio')p=mudar(r,'confirmado',{faltou:false}).then(function(ok){if(ok)toast('Pronto: o atendimento de '+primeiro(antes.nome)+' voltou para a conta.');return ok});
    else if(acao==='mover')p=api('PATCH','horarios?id=eq.'+r.id+'&status=eq.livre',{data:nd,hora:nh},{Prefer:'return=representation'})
      .then(function(j){if(!j||!j.length){toast(MUDOU,true);return false}toast('Horário mudado para '+dia(nd)+' às '+hh(nh)+'.');return true},
            function(e){if(e==='erro'){toast('Não deu certo: já existe um horário nesse dia e hora, ou ele já passou.',true);return false}throw e});
    else if(acao==='remarcar'){var dst=linha(destino);p=api('POST','rpc/remarcar',{p_de:r.id,p_para:dst.id}).then(function(res){
        if(res==='ok'){var novo={nome:antes.nome,servico:antes.servico,telefone:antes.telefone,data:dst.data,hora:dst.hora};toast('Remarcado: '+primeiro(antes.nome)+' agora '+dia(dst.data)+' às '+hh(dst.hora)+'.',false,zapUrl(novo,'remarcar'),'Avisar '+primeiro(antes.nome)+' da nova data');return true}
        toast(res==='indisponivel'?'Esse horário novo acabou de ser ocupado. Escolha outro.':MUDOU,true);destino=null;return false})}
    else if(acao==='excluir')p=api('DELETE','horarios?id=eq.'+r.id+'&status=eq.'+r.status,undefined,{Prefer:'return=representation'}).then(function(j){if(!j||!j.length){toast(MUDOU,true);return false}var z=zapUrl(antes,'cancelar');toast('Horário de '+primeiro(antes.nome)+' cancelado e apagado.',false,z,'Avisar '+primeiro(antes.nome)+' no WhatsApp');return true});
    else if(acao==='remover')p=api('DELETE','horarios?id=eq.'+r.id+'&status=eq.livre',undefined,{Prefer:'return=representation'}).then(function(j){if(!j||!j.length){toast(MUDOU,true);return false}toast(quando+' removido da agenda.');return true});
    else{ocupado=false;return}
    if(aberto)desenharSheet();
    p.then(function(ok){if(ok)fecharSheet();else if(acao!=='remarcar')pergunta=null},falha)
     .then(function(){ocupado=false;return carregar()}).then(function(){if(aberto)desenharSheet()});
  }
  // aviso de horário colado: a Amanda pode seguir mesmo assim (ela é quem decide)
  function avisarConflito(b,lista,serv){
    var old=$('avisoConflito');if(old)old.remove();
    var d=document.createElement('div');d.id='avisoConflito';d.className='aviso-dur forte';
    d.innerHTML='<b>Atenção:</b> '+esc(serv||'Combinado por fora')+' leva '+durTxt(duracaoDe(serv,profDe(linha(aberto))))+'. Nesse horário vai encostar no atendimento de '+textoConflito(lista)+'.';
    b.parentNode.insertBefore(d,b);b.setAttribute('data-forcar','1');b.textContent=b.getAttribute('data-a')==='ocupar'?'Marcar mesmo assim':'Salvar mesmo assim';
  }
  document.addEventListener('change',function(e){if(e.target&&e.target.id==='fServ'&&$('fValor'))$('fValor').placeholder=phValor(e.target.value,profDe(linha(aberto)))});
  document.addEventListener('change',function(e){if(e.target&&e.target.id==='fServ'){var w=$('avisoConflito');if(w)w.remove();
    var b=document.querySelector('#sheet [data-forcar]');if(b){b.removeAttribute('data-forcar');b.textContent=b.getAttribute('data-a')==='ocupar'?'Marcar como ocupado':'Salvar alterações'}}});
  function marcarLembrete(id){api('PATCH','horarios?id=eq.'+id+'&status=eq.confirmado',{lembrete_em:new Date().toISOString()},{Prefer:'return=minimal'}).then(function(){return carregar()},function(){})}
  document.addEventListener('click',function(e){
    var t=e.target;
    if(t.closest('[data-fechar]')){$('toast').hidden=true;return}
    var lm=t.closest('[data-lembrete]');if(lm){marcarLembrete(lm.getAttribute('data-lembrete'));return}
    if(t===$('veu')&&$('envio').hidden){fecharSheet();return}
    var ab=t.closest('[data-abrir]');if(ab){abrirSheet(ab.getAttribute('data-abrir'));return}
    var de=t.closest('[data-destino]');if(de){destino=de.getAttribute('data-destino');desenharSheet();return}
    var b=t.closest('button[data-a]');if(!b)return;
    var a=b.getAttribute('data-a'),id=b.getAttribute('data-id')||aberto,r=linha(id);
    if((a==='ocupar'||a==='editar')&&r&&!b.hasAttribute('data-forcar')){
      var fs=($('fServ')||{}).value||'',mudouServ=a==='ocupar'||fs!==(r.servico||'');
      var cfo=mudouServ?conflitos(r.data,r.hora,duracaoDe(fs,profDe(r)),[r.id],profDe(r)):[];
      if(cfo.length){avisarConflito(b,cfo,fs);return}
    }
    if(a==='fechar'){fecharSheet();return}
    if(a==='voltar'){pergunta=null;destino=null;desenharSheet();return}
    if(!r)return;
    if(a.indexOf('perg-')===0){aberto=r.id;pergunta=a.slice(5);destino=null;desenharSheet();return}
    executar(a,r);
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&aberto&&$('envio').hidden)fecharSheet()});

  // ---------- abrir horários ----------
  function todasHoras(){var m={};PADRAO.concat(extras).forEach(function(h){m[h]=1});return Object.keys(m).sort()}
  function desenharHoras(){$('horas').innerHTML=todasHoras().map(function(h){return '<button class="chip" type="button" data-h="'+h+'" aria-pressed="'+(!!escolhidas[h])+'">'+hh(h)+'</button>'}).join('');previa()}
  function planoAbertura(){
    var d=$('novaData').value,n=+$('repetir').value||1,hs=todasHoras().filter(function(h){return escolhidas[h]}),datas=[];
    if(!/^\d{4}-\d\d-\d\d$/.test(d))return null;
    for(var i=0;i<n;i++)datas.push(somaDias(d,7*i));
    return {datas:datas,horas:hs};
  }
  function previa(){
    var p=planoAbertura(),el=$('previa');
    if(!p){el.textContent='Escolha o dia.';return}
    if(p.datas[0]<hojeSP()){el.innerHTML='<b>Esse dia já passou.</b> Escolha outro.';return}
    if(!p.horas.length){el.textContent='Escolha pelo menos um horário.';return}
    el.innerHTML='Vai abrir <b>'+p.horas.map(hh).join(', ')+'</b><br>em <b>'+p.datas.length+' '+(p.datas.length>1?'dias':'dia')+'</b>: '+p.datas.map(function(d){return semana(d)+' '+curta(d)}).join(', ')+'.';
  }
  $('horas').onclick=function(e){var b=e.target.closest('.chip');if(!b)return;var h=b.getAttribute('data-h');escolhidas[h]=!escolhidas[h];b.setAttribute('aria-pressed',!!escolhidas[h]);previa()};
  $('bExtra').onclick=function(){var v=$('horaExtra').value;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)){toast('Escolha um horário válido, por exemplo 13:30.',true);return}
    if(extras.indexOf(v)<0)extras.push(v);escolhidas[v]=1;$('horaExtra').value='';desenharHoras()};
  $('novaData').onchange=$('novaData').oninput=previa;$('repetir').onchange=previa;
  $('bAbrir').onclick=function(){
    var p=planoAbertura();
    if(!p){toast('Escolha o dia primeiro.',true);return}
    if(p.datas[0]<hojeSP()){toast('Esse dia já passou. Escolha outro.',true);return}
    if(!p.horas.length){toast('Escolha pelo menos um horário.',true);return}
    var pedidos=[],quem=alvo();p.datas.forEach(function(d){p.horas.forEach(function(h){var x={data:d,hora:h};if(!eu.velho)x.profissional=quem;pedidos.push(x)})});
    $('bAbrir').disabled=true;$('bAbrir').textContent='Abrindo…';
    api('POST','horarios?on_conflict='+(eu.velho?'data,hora':'profissional,data,hora'),pedidos,{Prefer:'resolution=ignore-duplicates,return=representation'})
      .then(function(j){var n=(j||[]).length,f=pedidos.length-n;
        if(!n)toast('Nenhum horário novo: esses horários já estavam abertos ou já passaram.',true);
        else toast(n+(n>1?' horários abertos':' horário aberto')+(p.datas.length>1?' em '+p.datas.length+' dias':'')+'.'+(f?' '+f+(f>1?' já estavam abertos ou já passaram.':' já estava aberto ou já passou.'):''));
        return carregar()},falha)
      .then(function(){$('bAbrir').disabled=false;$('bAbrir').textContent='Abrir horários'});
  };

  // ---------- enviar horários para uma cliente ----------
  var AG=window.AGENDA||{servicos:[],whatsapp:'5511948907302'};
  var MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  var SEMLONGA=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  var envSel={},envImg=null;
  function limiteTxt(){var x=new Date(agoraSP().getTime()+60*60000);return x.getUTCFullYear()+'-'+dd(x.getUTCMonth()+1)+'-'+dd(x.getUTCDate())+' '+dd(x.getUTCHours())+':'+dd(x.getUTCMinutes())}
  // só entram horários livres que o site também mostra (começam daqui a mais de 1 hora)
  function diasLivres(){var m={},o=[],lim=limiteTxt(),sv=servEnv(),dur=sv?duracaoDe(sv.nome):menorDuracao();rows.forEach(function(r){if(r.status!=='livre'||profDe(r)!==minhaProf()||(r.data+' '+r.hora)<=lim||!cabeEm(r,dur))return;if(!m[r.data]){m[r.data]=[];o.push(r.data)}m[r.data].push(r.hora)});
    return o.map(function(d){return {data:d,horas:m[d].sort()}})}
  function selecionados(){return diasLivres().filter(function(d){return envSel[d.data]})}
  function dataLonga(d){var x=utc(d);return SEMLONGA[x.getUTCDay()]+', '+x.getUTCDate()+' de '+MESES[x.getUTCMonth()]}
  function cap(t){return t.charAt(0).toUpperCase()+t.slice(1)}
  function curto(d){return semana(d).slice(0,3)+' '+curta(d)}
  function nomeEnv(){return $('envNome').value.trim().slice(0,60)}
  function telEnv(){var t=$('envTel').value.replace(/\D/g,'');if(t.indexOf('55')===0&&(t.length===12||t.length===13))t=t.slice(2);return (t.length===10||t.length===11)?t:''}
  function servEnv(){var id=$('envServ').value;return listaServ().filter(function(x){return x.id===id})[0]||null}
  function saud(){var n=primeiro(nomeEnv());return 'Oi'+(n?', '+n:'')+'! Aqui é a '+primeiro(nomeProf(minhaProf()))+'.'}
  // onde a cliente agenda: o site da Amanda, ou a página de horários do salão (P.agenda)
  function siteBase(){return P.agenda?new URL(P.agenda,location.href).href:location.origin+location.pathname.replace(/admin\/(index\.html)?$/,'')}
  function linkCliente(sel){var q='?dias='+sel.map(function(d){return d.data}).join(',');if(P.agenda)q+='&p='+encodeURIComponent(minhaProf());var n=primeiro(nomeEnv());if(n)q+='&n='+encodeURIComponent(n);var sv=servEnv();if(sv)q+='&s='+encodeURIComponent(sv.id);return siteBase()+q+'#agendar'}
  function zapEnvio(texto){var t=telEnv();return 'https://wa.me/'+(t?'55'+t:'')+'?text='+encodeURIComponent(texto)}
  function linhasHoras(sel){return sel.map(function(d){return '• '+semana(d.data)+', '+curta(d.data)+': '+d.horas.map(hh).join(', ')}).join('\n')}
  function textoLink(sel){return saud()+' Separei estes horários para você:\n\n'+linhasHoras(sel)+'\n\nPara escolher o seu e garantir o horário, é só tocar neste link:\n'+linkCliente(sel)+'\n\nSe preferir, me responda aqui com o dia e a hora.'}
  function textoImagem(sel){var sv=servEnv();return saud()+' Estes são os horários que tenho disponíveis'+(sv?' para '+sv.nome.toLowerCase():'')+':\n\n'+linhasHoras(sel)+'\n\nÉ só me responder aqui com o dia e a hora que você preferir.'}

  function desenharEnvio(){
    opcoesEnvio();
    var ds=diasLivres(),vivo={};ds.forEach(function(d){vivo[d.data]=1});Object.keys(envSel).forEach(function(k){if(!vivo[k])delete envSel[k]});
    $('envDias').innerHTML=ds.length?ds.map(function(d){return '<button class="chip dd" type="button" data-env="'+d.data+'" aria-pressed="'+(!!envSel[d.data])+'"><b>'+esc(curto(d.data))+'</b><small>'+d.horas.length+(d.horas.length>1?' horários':' horário')+'</small></button>'}).join(''):'<p class="vazio">Nenhum horário livre para enviar. Abra horários na parte Agenda.</p>';
    var sel=selecionados(),el=$('envPrevia');
    el.innerHTML=sel.length?sel.map(function(d){return '<b>'+esc(cap(dataLonga(d.data)))+'</b><br>'+d.horas.map(hh).join(' · ')}).join('<br><br>'):(ds.length?'Toque nos dias que você quer oferecer.':'Sem horários livres no momento.');
    $('bLink').disabled=$('bImg').disabled=!sel.length;
  }
  $('envServ').onchange=function(){desenharEnvio()};
  $('envDias').onclick=function(e){var b=e.target.closest('[data-env]');if(!b)return;var d=b.getAttribute('data-env');envSel[d]=!envSel[d];desenharEnvio()};
  var assinaturaServ='';
  function opcoesEnvio(){var l=listaServ(),sig=l.map(function(x){return x.id+'|'+x.nome}).join(',');if(sig===assinaturaServ)return;assinaturaServ=sig;
    var sel=$('envServ').value;$('envServ').innerHTML='<option value="">Qualquer um</option>'+l.filter(function(x){return x.ativo!==false}).map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===sel?' selected':'')+'>'+esc(x.nome)+'</option>'}).join('')}
  opcoesEnvio();

  function abrirEnvio(html){$('envio').innerHTML=html;$('envio').hidden=false;$('veu').hidden=false}
  function fecharEnvio(){$('envio').hidden=true;if(!aberto)$('veu').hidden=true;if(envImg&&envImg.url){URL.revokeObjectURL(envImg.url)}envImg=null}
  function copiar(texto){
    var ok=function(){toast('Mensagem copiada.')},sem=function(){var pre=document.querySelector('#envio pre.txt');if(pre){var r=document.createRange();r.selectNodeContents(pre);var s2=getSelection();s2.removeAllRanges();s2.addRange(r)}toast('Selecionei o texto. Toque em Copiar.',true)};
    try{navigator.clipboard.writeText(texto).then(ok,sem)}catch(e){sem()}
  }

  $('bLink').onclick=function(){
    var sel=selecionados();if(!sel.length)return;var t=textoLink(sel);envImg=null;
    abrirEnvio('<div><span class="estado livre">Link</span><div class="t" id="envT">Mensagem pronta</div><div class="d">Confira o texto. A cliente abre o link e vê só estes dias para escolher e agendar sozinha.</div></div>'+
      '<pre class="txt">'+esc(t)+'</pre>'+
      '<a class="btn zap" target="_blank" rel="noopener" href="'+esc(zapEnvio(t))+'">'+(telEnv()?'Abrir conversa com a cliente':'Escolher a cliente no WhatsApp')+'</a>'+
      '<button class="btn ghost" data-acao="copiar" type="button">Copiar mensagem</button>'+
      '<button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>');
    envTexto=t;
  };
  var envTexto='';

  // ---- imagem para a cliente ver e responder ----
  function fmtZap(){var n=String(AG.whatsapp||'').replace(/\D/g,'').replace(/^55/,'');return n.length===11?'('+n.slice(0,2)+') '+n.slice(2,7)+'-'+n.slice(7):n.length===10?'('+n.slice(0,2)+') '+n.slice(2,6)+'-'+n.slice(6):n}
  // cores e textos da imagem: os da Amanda, ou os da marca em window.PAINEL.imagem
  var IMG=(function(){var d={logo:'../img/logo.svg',titulo:'Amanda Rocha',sub:'BELEZA  ·  SAÚDE  ·  BEM-ESTAR',rodape:'COM O CUIDADO DE UMA ENFERMEIRA',
      fundo:['#167469','#0B5F59','#053F3A'],destaque:'#F5C59D',claro:'#FBE3CE',papel:'#FFF8F1',tinta:'#053F3A',pilula:'#0B5F59',linha:'rgba(245,197,157,.18)',rodapeTxt:'rgba(251,227,206,.8)'};
    var o=P.imagem||{};for(var k in o)d[k]=o[k];return d})();
  function criarImagem(sel,nome,sv){
    var W=1080,P=48,F='Montserrat, system-ui, sans-serif',T=IMG;
    var fontes=[document.fonts.load('48px "Great Vibes"'),document.fonts.load('800 40px Montserrat'),document.fonts.load('600 40px Montserrat'),document.fonts.load('600 28px Cormorant')];
    return Promise.all(fontes).catch(function(){}).then(function(){return new Promise(function(res){var im=new Image();im.onload=function(){res(im)};im.onerror=function(){res(null)};im.src=T.logo})}).then(function(logo){
      var c=document.createElement('canvas'),x=c.getContext('2d');
      function rr(a,b,w,h,r){x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath()}
      function larg(t,f){x.font=f;return x.measureText(t).width}
      // 1) mede cada cartão de dia
      var util=W-2*P-72,GAP=16,PH=92;
      var cards=sel.map(function(d){var linhas=[[]],cur=0;
        d.horas.forEach(function(h){var t=hh(h),w=Math.max(150,larg(t,'800 52px '+F)+64);if(cur+w>util&&linhas[linhas.length-1].length){linhas.push([]);cur=0}linhas[linhas.length-1].push({t:t,w:w});cur+=w+GAP});
        return {titulo:cap(dataLonga(d.data)),linhas:linhas,h:36+64+20+linhas.length*PH+(linhas.length-1)*GAP+36}});
      var topo=546+(nome?64:0)+(sv?60:0),rodape=410,gap=26;
      var H=Math.max(1350,topo+cards.reduce(function(a,k){return a+k.h+gap},0)+rodape);
      c.width=W;c.height=H;
      // 2) fundo
      var g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,T.fundo[0]);g.addColorStop(.45,T.fundo[1]);g.addColorStop(1,T.fundo[2]);x.fillStyle=g;x.fillRect(0,0,W,H);
      x.strokeStyle=T.linha;x.lineWidth=2;x.beginPath();x.arc(W+60,-40,380,0,7);x.stroke();x.beginPath();x.arc(-80,H-160,330,0,7);x.stroke();
      // 3) cabeçalho
      x.textAlign='center';x.textBaseline='alphabetic';
      if(logo)x.drawImage(logo,W/2-80,56,160,160);
      x.fillStyle=T.destaque;x.font='400 112px "Great Vibes", cursive';x.fillText(T.titulo,W/2,350);
      x.fillStyle=T.claro;x.font='600 30px Cormorant, Georgia, serif';x.fillText(T.sub,W/2,400);
      var y=490;x.fillStyle=T.papel;x.font='800 70px '+F;x.fillText('Horários disponíveis',W/2,y);
      if(nome){y+=64;x.fillStyle=T.destaque;x.font='700 44px '+F;x.fillText('para '+nome,W/2,y)}
      if(sv){y+=60;x.fillStyle=T.claro;x.font='600 38px '+F;x.fillText(sv.nome,W/2,y)}
      y=topo;
      // 4) cartões dos dias
      cards.forEach(function(k){
        x.fillStyle=T.papel;rr(P,y,W-2*P,k.h,36);x.fill();
        x.textAlign='left';x.fillStyle=T.tinta;x.font='800 50px '+F;x.fillText(k.titulo,P+36,y+36+50);
        var py=y+36+64+20;
        k.linhas.forEach(function(ln){var px=P+36;ln.forEach(function(p){x.fillStyle=T.pilula;rr(px,py,p.w,PH,28);x.fill();x.fillStyle=T.papel;x.textAlign='center';x.font='800 52px '+F;x.fillText(p.t,px+p.w/2,py+PH/2+19);px+=p.w+GAP});x.textAlign='left';py+=PH+GAP});
        y+=k.h+gap});
      // 5) rodapé
      var ry=H-rodape+16;x.fillStyle=T.destaque;rr(P,ry,W-2*P,rodape-112,36);x.fill();
      x.textAlign='center';x.fillStyle=T.tinta;x.font='800 46px '+F;x.fillText('Gostou de um horário?',W/2,ry+76);
      x.font='600 36px '+F;x.fillText('Responda esta mensagem com',W/2,ry+130);x.fillText('o dia e a hora que você prefere.',W/2,ry+176);
      x.font='800 64px '+F;x.fillText(fmtZap(),W/2,ry+246);
      x.fillStyle=T.rodapeTxt;x.font='700 24px "JetBrains Mono", monospace';x.fillText(T.rodape,W/2,H-34);
      return new Promise(function(res){c.toBlob(res,'image/png')});
    });
  }
  $('bImg').onclick=function(){
    var sel=selecionados();if(!sel.length)return;var nome=primeiro(nomeEnv()),sv=servEnv(),t=textoImagem(sel);
    abrirEnvio('<div><span class="estado pedido">Imagem</span><div class="t" id="envT">Criando a imagem…</div></div>');
    criarImagem(sel,nome,sv).then(function(blob){
      if(!blob)throw 0;var url=URL.createObjectURL(blob);var file;try{file=new File([blob],P.arquivoImagem||'horarios-amanda.png',{type:'image/png'})}catch(e){file=null}
      envImg={url:url,file:file,texto:t};envTexto=t;
      abrirEnvio('<div><span class="estado pedido">Imagem</span><div class="t" id="envT">Imagem pronta</div><div class="d">Letras grandes, para a cliente ver com facilidade e responder qual horário prefere.</div></div>'+
        '<img class="previa-img" alt="Horários disponíveis" src="'+url+'">'+
        '<button class="btn zap" data-acao="compartilhar" type="button">Enviar pelo WhatsApp</button>'+
        '<a class="btn ghost" href="'+url+'" download="'+esc(P.arquivoImagem||'horarios-amanda.png')+'">Salvar imagem</a>'+
        (telEnv()?'<a class="btn ghost" target="_blank" rel="noopener" href="'+esc(zapEnvio(t))+'">Abrir só a conversa com a cliente</a>':'')+
        '<p class="nota">Se abrir uma tela com a imagem, segure o dedo sobre ela e toque em Salvar. Depois é só anexar na conversa.</p>'+
        '<button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>');
    }).catch(function(){abrirEnvio('<div><div class="t" id="envT">Não consegui criar a imagem</div><div class="d">Tente de novo. Se continuar, envie o link.</div></div><button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>')});
  };
  // ---------- story "Horários livres" (1080 x 1920, para postar no Instagram) ----------
  // só entram os horários livres da própria agenda que o site também mostra (mais de 1 h à frente e que cabem um serviço)
  function horasLivresDia(d){var lim=limiteTxt(),dur=menorDuracao(minhaProf());
    return rows.filter(function(r){return r.status==='livre'&&r.data===d&&profDe(r)===minhaProf()&&(r.data+' '+r.hora)>lim&&cabeEm(r,dur)}).map(function(r){return r.hora}).sort()}
  function criarStory(d,horas){
    var W=1080,H=1920,F='Montserrat, system-ui, sans-serif',T=IMG,com=P.agenda?'com a '+primeiro(nomeProf(minhaProf())):'';
    var fontes=[document.fonts.load('48px "Great Vibes"'),document.fonts.load('800 40px Montserrat'),document.fonts.load('600 40px Montserrat'),document.fonts.load('600 28px Cormorant')];
    return Promise.all(fontes).catch(function(){}).then(function(){return new Promise(function(res){var im=new Image();im.onload=function(){res(im)};im.onerror=function(){res(null)};im.src=T.logo})}).then(function(logo){
      var c=document.createElement('canvas'),x=c.getContext('2d');c.width=W;c.height=H;
      function rr(a,b,w,h,r){x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath()}
      var g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,T.fundo[0]);g.addColorStop(.45,T.fundo[1]);g.addColorStop(1,T.fundo[2]);x.fillStyle=g;x.fillRect(0,0,W,H);
      x.strokeStyle=T.linha;x.lineWidth=2;x.beginPath();x.arc(W+80,60,420,0,7);x.stroke();x.beginPath();x.arc(-100,H-260,380,0,7);x.stroke();
      x.textAlign='center';x.textBaseline='alphabetic';
      // as faixas de cima e de baixo do story ficam livres: o Instagram põe o nome e a caixa de resposta ali
      if(logo)x.drawImage(logo,W/2-70,250,140,140*(logo.naturalHeight/logo.naturalWidth||1));
      x.fillStyle=T.claro;x.font='600 34px Cormorant, Georgia, serif';x.fillText(String(T.titulo).toUpperCase().split('').join(' '),W/2,480);
      x.fillStyle=T.destaque;x.font='400 150px "Great Vibes", cursive';x.fillText('Horários livres',W/2,640);
      var y=730;x.fillStyle=T.papel;x.font='800 54px '+F;x.fillText(cap(dataLonga(d)),W/2,y);
      if(com){y+=64;x.fillStyle=T.claro;x.font='600 40px '+F;x.fillText(com,W/2,y)}
      // horários em linhas de 3, centralizados
      var ls=[],i,max=12,mostrar=horas.slice(0,max),extra=horas.length-mostrar.length;
      for(i=0;i<mostrar.length;i+=3)ls.push(mostrar.slice(i,i+3));
      var PW=270,PH=116,GAP=24,topo=y+90;
      ls.forEach(function(ln,li){var tot=ln.length*PW+(ln.length-1)*GAP,px=(W-tot)/2,py=topo+li*(PH+GAP);
        ln.forEach(function(h){x.fillStyle=T.papel;rr(px,py,PW,PH,36);x.fill();x.fillStyle=T.tinta;x.font='800 62px '+F;x.fillText(hh(h),px+PW/2,py+PH/2+22);px+=PW+GAP})});
      var fim=topo+ls.length*(PH+GAP);
      if(extra>0){x.fillStyle=T.claro;x.font='700 40px '+F;x.fillText('e mais '+extra+(extra>1?' horários':' horário'),W/2,fim+36);fim+=70}
      // chamada para agendar
      var cy=Math.max(fim+50,1260);if(cy>1500)cy=1500;
      x.fillStyle=T.destaque;rr(70,cy,W-140,300,44);x.fill();
      x.fillStyle=T.tinta;x.font='800 58px '+F;x.fillText('Agende pelo link da bio',W/2,cy+96);
      x.font='600 40px '+F;x.fillText('ou chame no WhatsApp',W/2,cy+156);
      x.font='800 60px '+F;x.fillText(fmtZap(),W/2,cy+246);
      return new Promise(function(res){c.toBlob(res,'image/png')});
    });
  }
  function abrirStory(alvo){
    if(!eu)return;
    var d=alvo==='amanha'?somaDias(hojeSP(),1):hojeSP(),outro=alvo==='amanha'?'hoje':'amanha',horas=horasLivresDia(d);
    var quando=alvo==='amanha'?'amanhã':'hoje',nomeArq=(P.arquivoStory||'story-horarios-livres.png');
    var abas='<div class="row"><button class="btn '+(alvo!=='amanha'?'main':'ghost')+'" type="button" data-acao="story" data-quando="hoje">Hoje</button><button class="btn '+(alvo==='amanha'?'main':'ghost')+'" type="button" data-acao="story" data-quando="amanha">Amanhã</button></div>';
    if(!horas.length){
      abrirEnvio('<div><span class="estado livre">Story</span><div class="t" id="envT">Horários livres '+quando+'</div></div>'+abas+
        '<p class="vazio">Você não tem horários livres '+quando+'. Abra horários na Agenda, ou veja o outro dia.</p>'+
        '<button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>');return}
    abrirEnvio('<div><span class="estado pedido">Story</span><div class="t" id="envT">Criando a imagem…</div></div>'+abas);
    criarStory(d,horas).then(function(blob){
      if(!blob)throw 0;var url=URL.createObjectURL(blob),file;try{file=new File([blob],nomeArq,{type:'image/png'})}catch(e){file=null}
      envImg={url:url,file:file,texto:''};
      abrirEnvio('<div><span class="estado pedido">Story</span><div class="t" id="envT">Story de '+quando+' pronto</div><div class="d">'+horas.length+(horas.length>1?' horários livres: ':' horário livre: ')+horas.map(hh).join(', ')+'</div></div>'+abas+
        '<img class="previa-img" alt="Story com os horários livres" src="'+url+'">'+
        '<button class="btn zap" data-acao="compartilhar" type="button">Enviar ou postar</button>'+
        '<a class="btn ghost" href="'+url+'" download="'+esc(nomeArq)+'">Salvar imagem</a>'+
        '<p class="nota">No celular, toque em Enviar ou postar e escolha o Instagram. Se não abrir, segure o dedo na imagem e toque em Salvar; depois é só postar no story. Só aparecem horários que o site também mostra.</p>'+
        '<button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>')
    }).catch(function(){abrirEnvio('<div><div class="t" id="envT">Não consegui criar a imagem</div><div class="d">Tente de novo.</div></div><button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>')});
  }
  function compartilhar(){
    if(!envImg||!envImg.file){toast('Este aparelho não envia imagem direto. Toque em Salvar imagem.',true);return}
    var d={files:[envImg.file],text:envImg.texto};
    if(navigator.share&&(!navigator.canShare||navigator.canShare(d))){navigator.share(d).catch(function(e){if(e&&e.name!=='AbortError')toast('Não consegui abrir o compartilhamento. Toque em Salvar imagem.',true)})}
    else toast('Este aparelho não envia imagem direto. Toque em Salvar imagem e anexe no WhatsApp.',true);
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-acao]');if(!b)return;var a=b.getAttribute('data-acao');
    if(a==='fecharEnvio')fecharEnvio();if(a==='copiar')copiar(envTexto);if(a==='compartilhar')compartilhar();
    if(a==='protecao')protecao(b.getAttribute('data-ligar')==='1',b);
    if(a==='sair-outros')sairOutros(b);
    if(a==='cli-obs')abrirObs(b.getAttribute('data-chave'));
    if(a==='ntfy-copiar')copiarCodigo();
    if(a==='ntfy-teste')testarNtfy(b);
    if(a==='resumo-agora')resumoAgora(b);
    if(a==='cli-salvar')salvarObs(b.getAttribute('data-chave'),b);
    if(a==='dia')abrirDia(b.getAttribute('data-dia'));
    if(a==='dia-add')diaAdicionar(b.getAttribute('data-dia'),b);
    if(a==='dia-limpar-perg')abrirDia(b.getAttribute('data-dia'),true);
    if(a==='dia-limpar')diaLimpar(b.getAttribute('data-dia'),b);
    if(a==='serv-editar')abrirServ(b.getAttribute('data-serv'));
    if(a==='serv-salvar')salvarServ(b.getAttribute('data-serv'),b);
    if(a==='serv-remover-perg')abrirServ(b.getAttribute('data-serv'),true);
    if(a==='serv-remover')removerServ(b.getAttribute('data-serv'),b);
    if(a==='story')abrirStory(b.getAttribute('data-quando'));
    if(a==='cad-confirmar')cadastrar(b);
    if(a==='contato-editar')abrirContato(b.getAttribute('data-contato'));
    if(a==='contato-salvar')salvarContato(b.getAttribute('data-contato'),b);
    if(a==='contato-apagar-perg')abrirContato(b.getAttribute('data-contato'),true);
    if(a==='contato-apagar')apagarContato(b.getAttribute('data-contato'),b);
    if(a==='prof-editar')abrirProf(b.getAttribute('data-prof'));
    if(a==='prof-salvar')salvarProf(b.getAttribute('data-prof'),b);
  });
  document.addEventListener('click',function(e){if(e.target===$('veu')&&!$('envio').hidden)fecharEnvio()});

  // ---------- opções de um dia da agenda ----------
  function abrirDia(d,perguntar){
    var doDia=rows.filter(function(r){return r.data===d&&profDe(r)===alvo()}),livres=doDia.filter(function(r){return r.status==='livre'}).length,marcados=doDia.length-livres;
    var h='<div><span class="estado livre">Dia</span><div class="t" id="envT">'+esc(dia(d))+'</div><div class="d">'+(todas()?'Agenda de '+esc(nomeProf(alvo()))+' · ':'')+livres+' livre'+(livres===1?'':'s')+(marcados?' · '+marcados+' com cliente':'')+'</div></div>';
    if(perguntar)h+='<div class="pergunta">Remover os '+livres+' horário'+(livres===1?'':'s')+' livre'+(livres===1?'':'s')+' deste dia? Os horários com cliente continuam.</div><button class="btn bad-solid" data-acao="dia-limpar" data-dia="'+d+'" type="button">Sim, remover os livres</button><button class="btn ghost" data-acao="dia" data-dia="'+d+'" type="button">Voltar</button>';
    else h+='<label for="dHora">Adicionar um horário neste dia</label><div class="extra"><input type="time" id="dHora" step="900"><button class="btn main" data-acao="dia-add" data-dia="'+d+'" type="button">Adicionar</button></div>'+
      (livres?'<button class="btn bad" data-acao="dia-limpar-perg" data-dia="'+d+'" type="button">Remover os horários livres deste dia…</button>':'')+
      '<button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>';
    abrirEnvio(h);
  }
  function diaAdicionar(d,b){
    var v=$('dHora').value;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)){toast('Escolha o horário, por exemplo 13:30.',true);return}
    b.disabled=true;
    var x={data:d,hora:v};if(!eu.velho)x.profissional=alvo();
    api('POST','horarios?on_conflict='+(eu.velho?'data,hora':'profissional,data,hora'),[x],{Prefer:'resolution=ignore-duplicates,return=representation'})
      .then(function(j){if(j&&j.length){toast(hh(v)+' adicionado em '+dia(d)+'.');fecharEnvio()}else toast('Esse horário já existe ou já passou.',true);return carregar()},falha)
      .then(function(){b.disabled=false});
  }
  function diaLimpar(d,b){
    b.disabled=true;
    api('DELETE','horarios?data=eq.'+d+'&status=eq.livre'+(eu.velho?'':'&profissional=eq.'+encodeURIComponent(alvo())),undefined,{Prefer:'return=representation'})
      .then(function(j){var n=(j||[]).length;toast(n?n+' horário'+(n>1?'s':'')+' livre'+(n>1?'s':'')+' removido'+(n>1?'s':'')+' de '+dia(d)+'.':'Nenhum horário livre para remover.');fecharEnvio();return carregar()},falha)
      .then(function(){b.disabled=false});
  }

  // ---------- serviços ----------
  function desenharServicos(){
    var el=$('servicos');
    if(bancoVelho){el.innerHTML='<p class="vazio">Para editar os serviços por aqui, falta atualizar o banco.</p>';$('bNovoServ').hidden=true;return}
    $('bNovoServ').hidden=false;var f=filtro(),l=(servs||[]).filter(function(x){return !f||!x.profissional||x.profissional===f});
    el.innerHTML=l.length?l.map(function(x){
      var tags=(todas()&&x.profissional?'<span class="tag">'+esc(nomeProf(x.profissional))+'</span>':'')+(x.recurso?'<span class="tag">Usa '+esc(nomeRecurso(x.recurso).toLowerCase())+'</span>':'')+(x.duracao?'<span class="tag">Leva '+durTxt(+x.duracao)+'</span>':'')+(x.ativo?'':'<span class="tag off">Escondido do site</span>')+(x.novidade?'<span class="tag nov">Novidade</span>':'')+(x.desde?'<span class="tag">A partir de '+curta(x.desde)+'</span>':'');
      var pr=precoTexto(x),ben=(x.beneficios||[]).filter(Boolean);
      return '<div class="card serv"><div><b>'+esc(x.nome)+'</b>'+(pr?'<span class="pr">'+pr+'</span>':'')+'<span>'+esc(x.detalhe||'')+'</span>'+
        (ben.length?'<span class="bens-l">'+ben.map(function(t){return '✓ '+esc(t)}).join('<br>')+'</span>':'')+
        (tags?'<div class="tags">'+tags+'</div>':'')+'</div><button class="btn ghost" data-acao="serv-editar" data-serv="'+esc(x.id)+'" type="button">Editar</button></div>'}).join(''):
      '<p class="vazio">Nenhum serviço. Adicione o primeiro.</p>';
  }
  function nomeRecurso(id){var x=(recursos||[]).filter(function(r){return r.id===id})[0];return x?x.nome:id}
  // quem faz o serviço (só a sócia vendo todas escolhe) e o que ele usa do salão
  function camposServ(x){
    var h='';
    if(todas()&&!x){var ativas=profs.filter(function(q){return q.ativo!==false});
      h+='<label for="sProf">Quem faz</label><select id="sProf">'+ativas.map(function(q){return '<option value="'+esc(q.id)+'"'+(q.id===minhaProf()?' selected':'')+'>'+esc(q.nome)+'</option>'}).join('')+'</select>'}
    if(recursos&&recursos.length&&servs&&(!servs.length||('recurso' in servs[0])))
      h+='<label for="sRec">Usa algo do salão que é dividido?</label><select id="sRec"><option value="">Não usa</option>'+recursos.map(function(r){return '<option value="'+esc(r.id)+'"'+(x&&x.recurso===r.id?' selected':'')+'>'+esc(r.nome)+'</option>'}).join('')+'</select>'+
        '<p class="dica">Se usar a maca, por exemplo, ninguém mais consegue marcar a maca no mesmo horário.</p>';
    return h}
  function servPorId(id){return (servs||[]).filter(function(x){return x.id===id})[0]}
  // usa na hora o que o banco devolveu: se ela tocar em Editar antes de a lista recarregar, já vê o que acabou de salvar
  function guardarServ(novo,tirar){geracao++;servs=(servs||[]).filter(function(x){return x.id!==(novo?novo.id:tirar)});if(novo)servs.push(novo);
    servs.sort(function(a,b){return (a.ordem||0)-(b.ordem||0)||String(a.nome).localeCompare(String(b.nome))});desenharServicos()}
  // o banco só tem a coluna de duração (e preço, texto e benefícios) depois da atualização
  function temDuracao(){return !!(servs&&servs.length&&('duracao' in servs[0]))}
  function temPersonalizacao(){return !!(servs&&servs.length&&('preco' in servs[0]))}
  // preço: mostra "75" ou "89,90"; lê "75", "R$ 75", "89,90" ou "89.90"
  function fmtPreco(v){if(v===null||v===undefined||v==='')return '';var n=+v;return n%1?n.toFixed(2).replace('.',','):String(n)}
  function lerPreco(t){t=String(t||'').replace(/R\$|\s/gi,'').replace(',','.');if(!t)return null;return /^\d{1,5}(\.\d{1,2})?$/.test(t)?+t:NaN}
  function precoTexto(x){if(x.preco===null||x.preco===undefined)return '';
    return (x.preco_antes!=null?'<s>R$ '+fmtPreco(x.preco_antes)+'</s> ':'')+'R$ '+fmtPreco(x.preco)+(x.preco_obs?' · '+esc(x.preco_obs):'')}
  var DURACOES=[15,20,30,40,45,50,60,75,85,90,100,105,110,120,150,180];
  function opcoesDuracao(atual){var l=DURACOES.slice();if(l.indexOf(atual)<0)l.push(atual);l.sort(function(a,b){return a-b});
    return l.map(function(m){return '<option value="'+m+'"'+(m===atual?' selected':'')+'>'+durTxt(m)+'</option>'}).join('')}
  function abrirServ(id,perguntar){
    var x=id?servPorId(id):null;if(id&&!x){toast(MUDOU,true);return}
    var h='<div><span class="estado livre">Serviço</span><div class="t" id="envT">'+(x?esc(x.nome):'Novo serviço')+'</div></div>';
    if(perguntar)h+='<div class="pergunta">Remover o serviço '+esc(x.nome)+'? Ele some do site. Os horários já marcados com ele continuam.</div><button class="btn bad-solid" data-acao="serv-remover" data-serv="'+esc(x.id)+'" type="button">Sim, remover</button><button class="btn ghost" data-acao="serv-editar" data-serv="'+esc(x.id)+'" type="button">Voltar</button>';
    else{var pers=temPersonalizacao(),ben=(x&&x.beneficios)||[],EX=['Ex.: Alívio de dores','Ex.: Menos ansiedade','Ex.: Sono mais tranquilo'];
      h+=camposServ(x)+'<label for="sNome">Nome</label><input type="text" id="sNome" maxlength="40" value="'+esc(x?x.nome:'')+'" placeholder="Ex.: Massagem relaxante">'+
      (pers?'<div class="grupo"><span class="g-t">Preço</span>'+
        '<div class="row"><div><label for="sPreco">Preço (R$)</label><input type="text" inputmode="decimal" id="sPreco" maxlength="9" value="'+esc(fmtPreco(x&&x.preco))+'" placeholder="Ex.: 90"></div>'+
        '<div><label for="sAntes">Antes (riscado)</label><input type="text" inputmode="decimal" id="sAntes" maxlength="9" value="'+esc(fmtPreco(x&&x.preco_antes))+'" placeholder="Opcional"></div></div>'+
        '<label for="sPObs">Observação do preço (opcional)</label><input type="text" id="sPObs" maxlength="40" value="'+esc(x&&x.preco_obs||'')+'" placeholder="Ex.: valor de inauguração, por sessão">'+
        '<p class="dica">Sem preço, o site não mostra valor. Com o "Antes", aparece assim: <s>R$ 120</s> R$ 90.</p></div>':'')+
      '<label for="sDet">Frase curta (aparece na hora de agendar)</label><input type="text" id="sDet" maxlength="60" value="'+esc(x&&x.detalhe||'')+'" placeholder="Ex.: Dores, ansiedade e sono">'+
      (pers?'<label for="sDesc">Texto do serviço no site</label><textarea id="sDesc" maxlength="500" placeholder="Em 2 ou 3 frases: o que é e como ajuda.">'+esc(x&&x.descricao||'')+'</textarea>'+
        '<span class="label">3 benefícios principais</span><div class="bens">'+[0,1,2].map(function(i){return '<input type="text" id="sBen'+i+'" maxlength="40" value="'+esc(ben[i]||'')+'" placeholder="'+EX[i]+'" aria-label="Benefício '+(i+1)+'">'}).join('')+'</div>'+
        '<p class="dica">Frases curtas, com "alivia" ou "ajuda a". Aparecem no site, embaixo do texto.</p>':'')+
      (temDuracao()?'<label for="sDur">Quanto tempo leva</label><select id="sDur">'+opcoesDuracao(x&&+x.duracao||60)+'</select>'+
        '<p class="dica">Conte também o tempo de arrumar para a próxima cliente. O site não deixa marcar outra cliente antes de terminar.</p>':'')+
      '<label class="check"><input type="checkbox" id="sAtivo"'+(!x||x.ativo?' checked':'')+'> Aparece no site</label>'+
      '<label class="check"><input type="checkbox" id="sNov"'+(x&&x.novidade?' checked':'')+'> Mostrar o selo “Novidade”</label>'+
      '<label class="check"><input type="checkbox" id="sTemDesde"'+(x&&x.desde?' checked':'')+'> Só pode ser marcado a partir de uma data</label>'+
      '<div id="sDesdeBox"'+(x&&x.desde?'':' hidden')+'><input type="date" id="sDesde" value="'+esc(x&&x.desde||'')+'" min="'+hojeSP()+'" aria-label="A partir de qual dia"></div>'+
      '<button class="btn main" data-acao="serv-salvar" data-serv="'+esc(x?x.id:'')+'" type="button">Salvar</button>'+
      (x?'<button class="btn bad" data-acao="serv-remover-perg" data-serv="'+esc(x.id)+'" type="button">Remover serviço…</button>':'')+
      '<button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>';}
    abrirEnvio(h);
  }
  document.addEventListener('change',function(e){if(e.target&&e.target.id==='sTemDesde'){$('sDesdeBox').hidden=!e.target.checked;if(!e.target.checked)$('sDesde').value=''}});
  function slug(t){var b=String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,26)||'servico';
    if(b.length<2)b+='-s';var id=b,i=2;while(servPorId(id))id=b+'-'+(i++);return id}
  function salvarServ(id,b){
    var nome=$('sNome').value.trim(),det=$('sDet').value.trim(),desde=$('sTemDesde').checked?($('sDesde').value||''):null;
    if(nome.length<2){toast('Escreva o nome do serviço.',true);return}
    if(desde===''){toast('Escolha a partir de qual dia o serviço pode ser marcado, ou desmarque a caixinha.',true);return}
    var dados={nome:nome.slice(0,40),detalhe:det?det.slice(0,60):null,ativo:$('sAtivo').checked,novidade:$('sNov').checked,desde:desde};
    if($('sDur'))dados.duracao=+$('sDur').value;
    if($('sRec'))dados.recurso=$('sRec').value||null;
    var dono=id?null:($('sProf')&&$('sProf').value)||(eu&&!eu.velho?minhaProf():null);if(dono)dados.profissional=dono;
    if($('sPreco')){
      var pr=lerPreco($('sPreco').value),an=lerPreco($('sAntes').value);
      if(isNaN(pr)||isNaN(an)){toast('Confira o preço: use só números, como 75 ou 89,90.',true);return}
      if(an!==null&&pr===null){toast('Para mostrar o preço riscado, preencha também o preço atual.',true);return}
      if(an!==null&&an<=pr){toast('O preço "Antes" precisa ser maior que o preço atual.',true);return}
      var bens=[0,1,2].map(function(i){return $('sBen'+i).value.trim().slice(0,40)}).filter(Boolean);
      dados.preco=pr;dados.preco_antes=an;dados.preco_obs=$('sPObs').value.trim().slice(0,40)||null;
      dados.descricao=$('sDesc').value.trim().slice(0,500)||null;dados.beneficios=bens.length?bens:null;
    }
    b.disabled=true;
    var req=id?api('PATCH','servicos?id=eq.'+encodeURIComponent(id),dados,{Prefer:'return=representation'})
              :api('POST','servicos',(dados.id=slug((dono&&dono!=='amanda'?dono+' ':'')+nome),dados.ordem=(servs||[]).reduce(function(m,x){return Math.max(m,x.ordem||0)},0)+1,dados),{Prefer:'return=representation'});
    req.then(function(j){if(!j||!j.length){toast(MUDOU,true);return}guardarServ(j[0]);toast(id?'Serviço atualizado.':'Serviço adicionado. Ele já aparece no site.');fecharEnvio();return carregar()},falha)
       .then(function(){b.disabled=false});
  }
  function removerServ(id,b){
    b.disabled=true;
    api('DELETE','servicos?id=eq.'+encodeURIComponent(id),undefined,{Prefer:'return=representation'})
      .then(function(j){if(j&&j.length)guardarServ(null,id);toast(j&&j.length?'Serviço removido.':MUDOU,!(j&&j.length));fecharEnvio();return carregar()},falha)
      .then(function(){b.disabled=false});
  }
  $('bNovoServ').onclick=function(){abrirServ(null)};

  // ---------- profissionais (só as sócias) ----------
  function desenharProfs(){
    var el=$('profLista');if(!el)return;
    el.innerHTML=profs.length?profs.map(function(x){
      return '<div class="card serv"><div><b>'+esc(x.nome)+(x.id===minhaProf()?' (você)':'')+'</b><span>'+(x.papel==='socia'?'Sócia: vê e mexe na agenda de todas':'Parceira: vê só a própria agenda')+'</span>'+
        '<span>'+(x.email?esc(x.email):'<b style="color:var(--warn)">Sem e-mail: ainda não consegue entrar</b>')+'</span>'+
        (x.ativo===false?'<div class="tags"><span class="tag off">Desativada</span></div>':'')+'</div>'+
        '<button class="btn ghost" data-acao="prof-editar" data-prof="'+esc(x.id)+'" type="button">Editar</button></div>'}).join(''):'<p class="vazio">Carregando…</p>';
  }
  function abrirProf(id){
    var x=id?profs.filter(function(q){return q.id===id})[0]:null;if(id&&!x){toast(MUDOU,true);return}
    abrirEnvio('<div><span class="estado livre">Profissional</span><div class="t" id="envT">'+(x?esc(x.nome):'Nova profissional')+'</div></div>'+
      '<label for="pNome">Nome (aparece no site)</label><input type="text" id="pNome" maxlength="40" value="'+esc(x?x.nome:'')+'" placeholder="Ex.: Bia Santos">'+
      '<label for="pEmail">E-mail para entrar no painel</label><input type="email" id="pEmail" maxlength="80" value="'+esc(x&&x.email||'')+'" placeholder="nome@email.com">'+
      '<p class="dica">Depois de salvar, o Kevin cria o acesso com este mesmo e-mail no Supabase (Authentication › Add user). A senha ela mesma escolhe.</p>'+
      '<label for="pPapel">O que ela pode ver</label><select id="pPapel"><option value="parceira"'+(!x||x.papel!=='socia'?' selected':'')+'>Parceira: só a própria agenda, clientes e números</option><option value="socia"'+(x&&x.papel==='socia'?' selected':'')+'>Sócia: a agenda de todas</option></select>'+
      (x&&x.id===minhaProf()?'':'<label class="check"><input type="checkbox" id="pAtivo"'+(!x||x.ativo!==false?' checked':'')+'> Ativa (aparece no site e consegue entrar)</label>')+
      '<button class="btn main" data-acao="prof-salvar" data-prof="'+esc(x?x.id:'')+'" type="button">Salvar</button>'+
      '<button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>');
  }
  function salvarProf(id,b){
    var nome=$('pNome').value.trim(),email=$('pEmail').value.trim().toLowerCase();
    if(nome.length<2){toast('Escreva o nome da profissional.',true);return}
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){toast('Confira o e-mail.',true);return}
    var dados={nome:nome.slice(0,40),email:email||null,papel:$('pPapel').value==='socia'?'socia':'parceira'};
    if($('pAtivo'))dados.ativo=$('pAtivo').checked;
    if(!id){var base=String(nome).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g,'').slice(0,20)||'prof',novo=base.length<2?base+'-p':base,i=2;
      while(profs.some(function(q){return q.id===novo}))novo=base+'-'+(i++);dados.id=novo;dados.ordem=profs.reduce(function(m,q){return Math.max(m,q.ordem||0)},0)+1}
    b.disabled=true;
    (id?api('PATCH','profissionais?id=eq.'+encodeURIComponent(id),dados,{Prefer:'return=representation'}):api('POST','profissionais',dados,{Prefer:'return=representation'}))
      .then(function(j){if(!j||!j.length){toast(MUDOU,true);return}toast(id?'Dados atualizados.':'Profissional cadastrada.'+(email?' Falta só criar o acesso dela no Supabase.':''));fecharEnvio();return carregar()},
            function(e){if(e==='erro'){toast('Não deu certo: esse e-mail já está em uso por outra profissional.',true);return}falha(e)})
      .then(function(){b.disabled=false});
  }
  if($('bNovaProf'))$('bNovaProf').onclick=function(){abrirProf(null)};
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('envio').hidden)fecharEnvio()});

  // ---------- guardião (segurança) ----------
  var ESCUDO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>';
  var ATENCAO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M12 8v5M12 16h.01"/></svg>';
  // data e hora de Brasília de um instante vindo do banco
  function partesSP(iso){
    var p={};if(!iso)return null;
    try{new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
      .formatToParts(new Date(iso)).forEach(function(x){p[x.type]=x.value})}catch(e){return null}
    return {d:p.year+'-'+p.month+'-'+p.day,h:dd(+p.hour%24)+':'+p.minute};
  }
  function quandoSP(iso){var p=partesSP(iso);if(!p)return idade(iso);var h0=hojeSP();return (p.d===h0?'hoje':p.d===somaDias(h0,-1)?'ontem':curta(p.d))+' às '+p.h}
  function automatico(ua){return /curl|wget|python|axios|go-http|java\/|okhttp|postman|insomnia|httpie|headless|\bbot\b|spider|crawl/i.test(String(ua||''))}
  function nomeAparelho(ua){
    ua=String(ua||'');if(!ua||ua==='Aparelho não identificado')return 'Aparelho não identificado';
    if(automatico(ua))return 'Programa automático (não é celular nem computador comum)';
    var so=/iPhone/.test(ua)?'iPhone':/iPad/.test(ua)?'iPad':/Android/.test(ua)?'Celular Android':/Windows/.test(ua)?'Computador Windows':/Macintosh|Mac OS X/.test(ua)?'Mac':/Linux/.test(ua)?'Computador Linux':'Aparelho';
    var nav=/EdgA?\//.test(ua)?'Edge':/SamsungBrowser/.test(ua)?'Samsung Internet':/OPR\//.test(ua)?'Opera':/CriOS|Chrome\//.test(ua)?'Chrome':/FxiOS|Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'';
    return so+(nav?' · '+nav:'');
  }
  function estadoGuarda(){return !guard?null:guard.pausado?'warn':guard.graves>0?'bad':'ok'}
  function desenharSelos(){
    var e=estadoGuarda(),m=$('mSeg'),av=$('avisoGuarda'),nm=$('nMais'),n=guard?guard.nao_vistos:0;
    m.hidden=!e;nm.hidden=!n;nm.textContent=n||'';
    if(!e){av.hidden=true;return}
    m.className='st'+(e==='ok'?(n?' warn':''):' '+e);
    m.textContent=e==='warn'?'Proteção ligada':e==='bad'?guard.graves+(guard.graves>1?' alertas':' alerta'):n?n+(n>1?' novos':' novo'):'Tudo normal';
    av.hidden=e==='ok'||abaAtual==='seguranca';av.className='banner guarda'+(e==='warn'?' warn':'');
    av.textContent=e==='warn'?'Proteção ligada: as clientes estão confirmando direto pelo seu WhatsApp. Toque para ver.':'O guardião encontrou algo fora do normal. Toque para ver.';
  }
  function desenharGuardiao(){
    desenharSelos();
    var st=$('gStatus');
    if(!guard){st.className='card gst';st.innerHTML=semGuardiao?'<p>O guardião ainda não está ligado: falta rodar a atualização do banco (arquivo supabase/atualizacao.sql).</p>':'<p class="vazio">Carregando…</p>';$('gAlertas').innerHTML='';$('gAparelhos').innerHTML='';return}
    var e=estadoGuarda(),h;
    if(guard.parceira)h='<div class="gt"><span class="gi">'+ESCUDO+'</span><div><b>Sua conta</b><span>Aqui você vê os aparelhos conectados à sua conta e liga as notificações no seu celular.</span></div></div>';
    else if(e==='warn')h='<div class="gt"><span class="gi">'+ATENCAO+'</span><div><b>Proteção ligada</b><span>Desde '+esc(quandoSP(guard.pausado_em))+(guard.pausado_por==='guardião'?', ligada pelo guardião':', ligada por você')+'.</span></div></div>'+
      '<p>O site continua mostrando os horários, mas as clientes confirmam direto pelo seu WhatsApp. Quando estiver tudo certo, religue.</p>'+
      '<button class="btn main" type="button" data-acao="protecao" data-ligar="0">Religar agendamento pelo site</button>';
    else h='<div class="gt"><span class="gi">'+(e==='bad'?ATENCAO:ESCUDO)+'</span><div><b>'+(e==='bad'?'Atenção: '+guard.graves+(guard.graves>1?' alertas graves':' alerta grave'):'Tudo normal')+'</b><span>'+(e==='bad'?'Veja abaixo o que aconteceu.':'O guardião está vigiando o site agora.')+'</span></div></div>'+
      '<button class="btn ghost" type="button" data-acao="protecao" data-ligar="1">Ligar proteção agora</button>'+
      '<p class="dica" style="margin-top:-4px">Use se perceber pedidos falsos: as clientes passam a confirmar com você pelo WhatsApp, e nada é perdido.</p>';
    st.className='card gst'+(e==='ok'?'':' '+e);st.innerHTML=h;
    $('gNtfy').innerHTML=!guard.ntfy?'<p class="vazio">As notificações no celular ainda não estão ligadas no banco.</p>':
      '<p>Receba no celular um aviso a cada <b>pedido novo</b> e sempre que o guardião encontrar algo estranho, mesmo com o painel fechado.</p>'+
      '<ol><li>Instale o app <b>ntfy</b> (App Store ou Play Store). É grátis.</li><li>Abra o app, toque em <b>+</b> e cole este código:</li></ol>'+
      '<div class="codigo" id="ntfyCodigo">'+esc(guard.ntfy)+'</div>'+
      '<div class="row"><button class="btn ghost" type="button" data-acao="ntfy-copiar">Copiar código</button><button class="btn main" type="button" data-acao="ntfy-teste">Enviar teste</button></div>'+
      '<p class="dica">Depois toque em Enviar teste: se a notificação chegar no celular, está tudo certo. Não conte este código para ninguém.</p>'+
      '<div class="resumo-6h"><b>Todo dia às 6h</b><span>'+(guard.resumo?'Chega um resumo com cada cliente e o procedimento, por exemplo: “13h Maria · Auriculoterapia”. Só quando houver agendamento.':'O resumo das 6h ainda não está ligado no banco. Peça para o Kevin ligar o pg_cron no Supabase (Database › Extensions).')+'</span>'+
        (guard.resumo?'<button class="btn ghost" type="button" data-acao="resumo-agora">Mandar o resumo de hoje agora</button>':'')+'</div>';
    var al=guard.alertas||[];
    $('gAlertas').innerHTML=al.length?al.map(function(a){
      var det=a.tipo==='aparelho'?esc(nomeAparelho(a.detalhe))+'. Se foi você, pode ignorar. Se não foi, toque em “Sair dos outros aparelhos” e troque sua senha.':esc(a.detalhe||'');
      return '<div class="card al'+(a.nivel==='grave'?' grave':'')+'"><div class="at"><span>'+esc(a.titulo)+(a.visto_em?'':'<span class="novo">NOVO</span>')+'</span><time>'+esc(quandoSP(a.em))+'</time></div><div class="ad">'+det+'</div></div>'}).join(''):
      '<p class="vazio">Nenhum alerta. Tudo tranquilo por aqui.</p>';
    var ap=guard.aparelhos;
    $('gAparelhos').innerHTML=!ap?'<p class="vazio">Não consegui listar os aparelhos agora.</p>':ap.length?ap.map(function(x){var robo=automatico(x.aparelho);
      return '<div class="card ap'+(robo?' suspeito':'')+'"><div><b>'+esc(nomeAparelho(x.aparelho))+'</b><span>'+(x.atual?'Este aparelho · ':'')+'entrou '+esc(quandoSP(x.desde))+' · último uso '+esc(idade(x.uso))+'</span></div>'+(x.atual?'<span class="st">Você</span>':'')+'</div>'}).join(''):
      '<p class="vazio">Nenhum aparelho conectado.</p>';
    if(abaAtual==='seguranca'&&!document.hidden)verSeguranca();
  }
  // abrir a página de Segurança conta como "vi os alertas"
  var marcando=false;
  function verSeguranca(){
    if(!guard||!guard.nao_vistos||marcando)return;
    marcando=true;
    api('POST','rpc/marcar_alertas_vistos',{}).then(function(){guard.nao_vistos=0;guard.graves=0;desenharSelos()},function(){}).then(function(){marcando=false});
  }
  function protecao(ligar,b){
    b.disabled=true;
    api('POST','rpc/definir_protecao',{p_pausar:ligar}).then(function(g){if(g)guard=g;desenharGuardiao();
      toast(ligar?'Proteção ligada. As clientes agora confirmam com você pelo WhatsApp.':'Pronto! O agendamento pelo site voltou a funcionar.')},falha)
      .then(function(){b.disabled=false});
  }
  function copiarCodigo(){
    var t=guard&&guard.ntfy;if(!t)return;
    var sel=function(){var r=document.createRange();r.selectNodeContents($('ntfyCodigo'));var x=getSelection();x.removeAllRanges();x.addRange(r);toast('Código selecionado. Toque em Copiar.')};
    try{navigator.clipboard.writeText(t).then(function(){toast('Código copiado. Agora cole no app ntfy.')},sel)}catch(e){sel()}
  }
  function testarNtfy(b){
    b.disabled=true;
    api('POST','rpc/testar_notificacao',{}).then(function(ok){toast(ok?'Notificação de teste enviada. Ela chega em alguns segundos.':'Não consegui enviar agora. Tente de novo em instantes.',!ok)},falha)
      .then(function(){b.disabled=false});
  }
  function resumoAgora(b){
    b.disabled=true;
    api('POST','rpc/enviar_resumo_agora',{}).then(function(r){
      toast(r==='enviado'?'Resumo de hoje enviado. Ele chega em alguns segundos.':r==='vazio'?'Hoje não há agendamentos, então não há resumo para mandar (de manhã também não chega nada).':'Não consegui enviar agora. Tente de novo em instantes.',r!=='enviado'&&r!=='vazio')},falha)
      .then(function(){b.disabled=false});
  }
  function sairOutros(b){
    b.disabled=true;
    sairServidor('others').then(function(ok){toast(ok?'Pronto: os outros aparelhos foram desconectados.':'Não consegui agora. Confira a internet e tente de novo.',!ok);return carregar()})
      .then(function(){b.disabled=false});
  }

  // ---------- minha conta: trocar senha ----------
  $('fSenha').onsubmit=function(e){
    e.preventDefault();var at=$('cAtual').value,n1=$('cNova').value,n2=$('cNova2').value,b=$('bSenha'),email=emailSessao();
    if(!at){toast('Digite a sua senha atual.',true);return}
    if(n1.length<8||!/[A-Za-z]/.test(n1)||!/[0-9]/.test(n1)){toast('A nova senha precisa ter pelo menos 8 caracteres, com letras e números.',true);return}
    if(n1!==n2){toast('As duas senhas novas não estão iguais.',true);return}
    if(n1===at){toast('A nova senha precisa ser diferente da atual.',true);return}
    if(!email){toast('Saia e entre de novo antes de trocar a senha.',true);return}
    b.disabled=true;b.textContent='Trocando…';
    // confere a senha atual entrando de novo; só então grava a nova
    auth('token?grant_type=password',{email:email,password:at})
      .then(function(j){salvar(paraSessao(j,email));
        return fetch(C.url+'/auth/v1/user',{method:'PUT',headers:{apikey:C.anonKey,Authorization:'Bearer '+sess.token,'Content-Type':'application/json'},body:JSON.stringify({password:n1})})
          .then(function(r){if(!r.ok){var x=new Error('troca');x.status=r.status;throw x}})},
        function(err){if(err&&err.status===400){var x=new Error('atual');x.atual=true;throw x}throw err})
      .then(function(){$('cAtual').value=$('cNova').value=$('cNova2').value='';return sairServidor('others')})
      .then(function(){toast('Senha trocada! Os outros aparelhos foram desconectados.')})
      .catch(function(err){toast(err&&err.atual?'A senha atual não confere.':err&&err.status===422?'Escolha uma senha mais forte e diferente da atual.':err&&err.rede?'Sem conexão. Tente de novo.':'Não consegui trocar a senha agora. Tente de novo.',true)})
      .then(function(){b.disabled=false;b.textContent='Trocar senha'});
  };

  // ---------- histórico ----------
  var POR_PAGINA=40;
  function carregarHist(reset){
    var seq=++hist.seq;
    if(reset){hist.itens=[];hist.fim=false;$('hLista').innerHTML='<p class="vazio">Carregando…</p>';$('hMais').hidden=true}
    var q='historico?select=*&order=em.desc,id.desc&limit='+POR_PAGINA+'&offset='+hist.itens.length+(filtro()?'&profissional=eq.'+encodeURIComponent(filtro()):'');
    var b=hist.busca.replace(/[^0-9A-Za-zÀ-ÿ ]/g,'').trim();
    if(b)q+='&nome=ilike.'+encodeURIComponent('*'+b+'*');
    api('GET',q).then(function(j){if(seq!==hist.seq)return;j=j||[];hist.itens=hist.itens.concat(j);hist.fim=j.length<POR_PAGINA;hist.ok=true;desenharHist()},
      function(e){if(seq!==hist.seq||e==='sessao')return;$('hLista').innerHTML='<p class="vazio">'+(e==='rede'?'Sem conexão. Tente de novo quando a internet voltar.':'Não consegui carregar o histórico agora.')+'</p>'});
  }
  function diaHist(d){var h0=hojeSP();return d===h0?'Hoje':d===somaDias(h0,-1)?'Ontem':cap(semana(d))+', '+curta(d)}
  // cada registro do banco vira uma frase simples
  function frase(x){
    var n='<b>'+esc(x.nome||'')+'</b>',t,ic='edit',o=x.obs||'';
    if(o==='lembrete'){t='Lembrete enviado para '+n;ic='lemb'}
    else if(o==='editado'){t='Dados de '+n+' editados'}
    else if(o==='remarcado'){t=x.para==='livre'?n+' foi remarcada para outro horário':n+' remarcada para este horário';ic='rem'}
    else if(o==='faltou'){t=n+' não veio';ic='del'}
    else if(o==='veio'){t=n+' veio, sim (o “não veio” foi desfeito)';ic='ok'}
    else if(o.indexOf('mudou de ')===0){var m=/(\d{4}-\d\d-\d\d) (\d\d:\d\d)/.exec(o);t='Horário mudado'+(m?' (antes era '+curta(m[1])+' às '+hh(m[2])+')':'')}
    else if(!x.de&&x.para==='livre'){t='Horário aberto';ic='abre'}
    else if(x.para==='removido'){t=x.nome?'Horário de '+n+' cancelado e apagado':'Horário removido da agenda';ic='del'}
    else if(x.de==='livre'&&x.para==='pedido'){t=n+' pediu este horário';ic='ped'}
    else if(x.de==='pedido'&&x.para==='confirmado'){t='Pedido de '+n+' confirmado';ic='ok'}
    else if(x.de==='livre'&&x.para==='confirmado'){t='Marcado para '+n;ic='ok'}
    else if(x.de==='pedido'&&x.para==='livre'){t='Pedido de '+n+' recusado';ic='del'}
    else if(x.de==='confirmado'&&x.para==='livre'){t='Horário de '+n+' cancelado';ic='del'}
    else t='Mudança no horário';
    var quem=x.quem==='site'?'pelo site':x.quem===emailSessao()?'por você':x.quem?'por '+x.quem:'';
    var alvo=x.data&&x.hora?semana(x.data)+', '+curta(x.data)+' às '+hh(x.hora):'';
    return {t:t,ic:ic,d:alvo+(alvo&&quem?' · ':'')+quem};
  }
  function desenharHist(){
    var el=$('hLista');
    if(!hist.itens.length){el.innerHTML='<p class="vazio">'+(hist.busca?'Nada encontrado para “'+esc(hist.busca)+'”.':'Ainda não há nada no histórico.')+'</p>';$('hMais').hidden=true;return}
    var dia0=null,h='';
    hist.itens.forEach(function(x){var p=partesSP(x.em)||{d:'',h:''},f=frase(x);
      if(p.d!==dia0){dia0=p.d;h+='<div class="hdia">'+esc(p.d?diaHist(p.d):'')+'</div>'}
      h+='<div class="hrow"><i class="hic '+f.ic+'"></i><div><div class="ht">'+f.t+'</div><div class="hd">'+esc(f.d)+'</div></div><time>'+esc(p.h)+'</time></div>'});
    el.innerHTML=h;$('hMais').hidden=hist.fim;
  }
  var tBusca;
  $('hBusca').oninput=function(){var v=this.value;clearTimeout(tBusca);tBusca=setTimeout(function(){hist.busca=v.trim();carregarHist(true)},350)};
  $('hMais').onclick=function(){carregarHist(false)};

  // algo estranho fecha o painel na hora (em todos os aparelhos). Devolve o motivo, ou '' se está tudo normal.
  // 1) um programa automático (não um celular ou computador) logado com a senha dela é sinal de invasão
  function acessoEstranho(){return guard&&guard.aparelhos&&guard.aparelhos.some(function(x){return !x.atual&&automatico(x.aparelho)})?'Encontrei um acesso estranho ao seu painel.':''}
  // 2) alerta grave novo do guardião, de verdade ligado a uma conta (mexer em muita coisa de uma vez, ou conta sem permissão).
  //    "Linha de base": o primeiro alerta que já existia quando ela entrou não conta, só os que aparecem depois.
  var GRAVES_DA_CONTA={cancelamentos:1,intruso:1};
  function alertaNovo(){
    if(!guard||!guard.alertas||!sess)return '';
    if(sess.base==null){sess.base=guard.alertas.reduce(function(m,a){return Math.max(m,+a.id||0)},0);salvar(sess);return ''}
    var a=guard.alertas.filter(function(x){return +x.id>sess.base&&x.nivel==='grave'&&GRAVES_DA_CONTA[x.tipo]&&!x.visto_em})[0];
    return a?'O guardião viu algo estranho: '+String(a.titulo||'alerta grave').replace(/\.$/,'')+'.':'';
  }

  // ---------- clientes ----------
  var clientes=null,cliFiltro='todas',DIAS_SEM_VIR=10;
  function carregarClientes(){
    if(!clientes)$('cliLista').innerHTML='<p class="vazio">Carregando…</p>';
    return api('POST','rpc/clientes_resumo',comProf()).then(function(j){clientes=j||[];desenharClientes();desenharCadastro()},function(e){
      if(e==='sessao')return;
      $('cliLista').innerHTML='<p class="vazio">'+(e==='ausente'?'Para ver as clientes aqui, falta rodar a atualização do banco (arquivo supabase/atualizacao.sql).':e==='rede'?'Sem conexão. Tente de novo quando a internet voltar.':'Não consegui carregar as clientes agora.')+'</p>'});
  }
  function diasDesde(d){return Math.round((utc(hojeSP())-utc(d))/864e5)}
  // sem horário marcado e sem vir há mais de 10 dias
  function sumida(x){return !x.proxima&&!!x.ultima&&diasDesde(x.ultima)>DIAS_SEM_VIR}
  function semAcento(t){t=String(t||'').toLowerCase();try{return t.normalize('NFD').replace(/[\u0300-\u036f]/g,'')}catch(e){return t}}
  document.addEventListener('click',function(e){var f=e.target.closest('[data-cli-f]');if(!f)return;cliFiltro=f.getAttribute('data-cli-f');desenharClientes()});

  // ---------- seus números: atendimentos e faturamento (só ela vê) ----------
  var numeros=null,semNumeros=false,ocultar=false,MARCOS=[10,25,50,100,150,200,300,500,750,1000];
  var OLHO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var OLHO_FECHADO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  try{ocultar=localStorage.getItem('amanda-ocultar-valores')==='1'}catch(e){}
  var seqNum=0;
  function carregarNumeros(){
    var minha=++seqNum;
    return api('POST','rpc/meus_numeros',comProf()).then(function(j){if(minha!==seqNum)return;numeros=j&&j.mes?j:null;semNumeros=false;desenharNumeros();if(numeros)carregarRecentes();
      // mudou algum atendimento (valor, não veio, horário que passou): o faturamento detalhado busca de novo
      var fp=numeros?JSON.stringify([numeros.total,numeros.mes,numeros.faltas]):null;if(fat.fp!==null&&fp!==fat.fp)zerarFat();fat.fp=fp;
      if(abaAtual==='faturamento'&&!fat.linhas&&!fat.carregando)carregarFat()},
      function(e){if(minha!==seqNum)return;if(e==='ausente'){numeros=null;semNumeros=true;desenharNumeros()}});
  }
  // atendimentos dos últimos 7 dias (a agenda só mostra de hoje em diante): para marcar quem não veio depois
  var recentes=null;
  function carregarRecentes(){
    api('GET','horarios?select=*&status=eq.confirmado&data=gte.'+somaDias(hojeSP(),-7)+'&data=lte.'+hojeSP()+'&order=data.desc,hora.desc').then(function(j){
      recentes=(j||[]).filter(passou).sort(function(a,b){return (b.data+b.hora)<(a.data+a.hora)?-1:1});desenharNumeros()},function(){});
  }
  // R$ 1.140 ou R$ 89,90; com o olho fechado, os totais viram R$ •••
  function rs(v){v=+v||0;return 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:v%1?2:0,maximumFractionDigits:2})}
  // nunca quebra entre o R$ e o número
  function dinheiro(v){return '<span class="nw">'+(ocultar?'R$ •••':rs(v))+'</span>'}
  function vezes(n,um,varios){return n+' '+(n===1?um:varios)}
  // o maior marco (10, 25, 50...) que ela passou neste mês
  function marcoDoMes(n){var t=+n.total.atendimentos,ini=t-(+n.mes.atendimentos),m=null;MARCOS.forEach(function(x){if(ini<x&&x<=t)m=x});return m}
  function botaoOlho(){return '<button class="olho" type="button" data-num="olho" aria-pressed="'+ocultar+'" aria-label="'+(ocultar?'Mostrar os valores':'Esconder os valores')+'">'+(ocultar?OLHO_FECHADO:OLHO)+'</button>'}
  function desenharNumeros(){
    var card=$('numeros'),det=$('numDet');
    if(!numeros){card.hidden=true;det.innerHTML='<p class="vazio">'+(semNumeros?'Para ver seus números, falta rodar a atualização do banco (arquivo supabase/atualizacao.sql).':'Carregando…')+'</p>';return}
    var n=numeros,m=n.mes,fat=+m.faturamento,meta=n.meta!=null?+n.meta:null,antV=+n.anterior.faturamento;
    var mesN=+String(n.hoje).slice(5,7),mes=MESES[mesN-1],mesAnt=MESES[(mesN+10)%12];
    var alvo=meta||antV,pct=alvo?Math.min(100,Math.round(fat/alvo*100)):0,batida=!!alvo&&fat>=alvo;
    var mc=n.marcados||{atendimentos:0,faturamento:0},nMc=+mc.atendimentos,marco=marcoDoMes(n);
    var h='<div class="num-top"><span class="num-l">Faturamento de '+mes+'</span>'+botaoOlho()+'</div>'+
      '<div class="num-v">'+dinheiro(fat)+'</div>'+
      '<div class="num-s"><b>'+m.atendimentos+'</b> '+(+m.atendimentos===1?'atendimento':'atendimentos')+' este mês</div>';
    if(alvo){
      var txt=meta?(batida?'🎉 Meta do mês batida! ('+dinheiro(meta)+')':pct+'% da meta de '+dinheiro(meta)+' · faltam '+dinheiro(meta-fat))
                  :(batida?'🎉 Você já passou '+mesAnt+' ('+dinheiro(antV)+')!':'Faltam '+dinheiro(antV-fat)+' para passar '+mesAnt+' ('+dinheiro(antV)+')');
      h+='<div class="meter'+(batida?' ok':'')+'" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'" aria-label="'+(meta?'Meta do mês':'Comparado com '+mesAnt)+'"><i style="width:'+pct+'%"></i></div><p class="num-m">'+txt+'</p>';
    } else h+='<p class="num-m">'+(!n.total.desde||String(n.total.desde)>=String(n.hoje).slice(0,8)+'01'?'Seu primeiro mês por aqui: cada atendimento conta! 🌱':'Defina uma meta para ver quanto falta a cada atendimento. 🌱')+'</p>';
    if(nMc)h+='<p class="num-x">+ '+(ocultar?'':dinheiro(mc.faturamento)+' em ')+vezes(nMc,'atendimento já marcado','atendimentos já marcados')+' até o fim do mês'+(meta&&!batida&&fat+(+mc.faturamento)>=meta?'. Com eles, você bate a meta! 💪':'.')+'</p>';
    if(+m.sem_valor)h+='<p class="num-x">'+vezes(+m.sem_valor,'atendimento sem preço ainda não entrou','atendimentos sem preço ainda não entraram')+' na conta. Coloque o preço em Mais › Serviços e preços.</p>';
    if(marco)h+='<p class="num-x marco">🎉 Este mês você chegou a '+marco+' atendimentos desde o começo!</p>';
    var t0=n.total||{};
    if(+t0.atendimentos)h+='<div class="num-tot"><span class="num-tot-l">Desde a inauguração</span><b>'+dinheiro(t0.faturamento)+'</b><small>'+vezes(+t0.atendimentos,'atendimento','atendimentos')+(t0.desde?' · <span class="nw">desde '+dataBR(t0.desde)+'</span>':'')+'</small></div>';
    h+=botaoFat()+
      (meta?'':'<button class="link-meta" type="button" data-num="meta-ir">Definir uma meta do mês</button>');
    card.innerHTML=h;card.hidden=false;
    // com ela digitando a meta, não redesenha a página (não apaga o que está sendo digitado)
    if(document.activeElement&&document.activeElement.id==='metaV')return;
    var mx=Math.max.apply(null,n.meses.map(function(x){return +x.faturamento})),mxN=Math.max.apply(null,n.meses.map(function(x){return +x.atendimentos}));
    var t=n.total,desde=t.desde?String(t.desde):'';
    det.innerHTML='<div class="card num-d"><div class="num-top"><span class="num-l">'+cap(mes)+'</span>'+botaoOlho()+'</div>'+
        '<div class="num-kpi"><div><b>'+dinheiro(fat)+'</b><span>faturamento</span></div><div><b>'+m.atendimentos+'</b><span>'+(+m.atendimentos===1?'atendimento':'atendimentos')+'</span></div></div>'+
        (n.servicos.length?'<ul class="num-serv">'+n.servicos.map(function(x){return '<li><span>'+esc(x.servico)+'</span><span>'+vezes(+x.atendimentos,'atendimento','atendimentos')+' · '+dinheiro(x.faturamento)+'</span></li>'}).join('')+'</ul>':'<p class="dica">Nenhum atendimento ainda este mês.</p>')+
        (+m.sem_valor?'<p class="dica">'+vezes(+m.sem_valor,'atendimento sem preço não entrou','atendimentos sem preço não entraram')+' no faturamento. Coloque o preço em Mais › Serviços e preços ou no próprio horário (Editar dados).</p>':'')+
        botaoFat()+'</div>'+
      (recentes&&recentes.length?'<h2>Últimos 7 dias</h2><div class="card"><ul class="num-ult">'+recentes.map(function(r){
        return '<li'+(r.faltou?' class="faltou"':'')+'><div><b>'+esc(r.nome)+'</b><span>'+esc(dia(r.data))+' às '+hh(r.hora)+' · '+esc(servRot(r))+(r.valor!=null?' · '+dinheiro(r.valor):'')+(r.faltou?' · não veio':'')+'</span></div>'+
          '<button class="btn ghost" type="button" data-num="faltou" data-id="'+esc(r.id)+'" data-v="'+(r.faltou?'0':'1')+'">'+(r.faltou?'Veio, sim':'Não veio')+'</button></li>'}).join('')+
        '</ul><p class="dica">Alguém não veio? Toque em “Não veio”: sai da conta e fica anotado na ficha dela.</p></div>':'')+
      '<h2>Meta do mês</h2><div class="card"><label for="metaV">Quanto você quer faturar por mês (R$)</label><div class="extra"><input type="text" inputmode="decimal" id="metaV" maxlength="9" value="'+esc(meta?fmtPreco(meta):'')+'" placeholder="Ex.: 2000"><button class="btn main" type="button" data-num="meta-salvar">Salvar</button></div>'+
        (meta?'<button class="btn ghost" type="button" data-num="meta-tirar" style="margin-top:10px">Tirar a meta</button>':'<p class="dica">Com uma meta, o Início mostra quanto falta a cada atendimento.</p>')+'</div>'+
      '<h2>Últimos 6 meses</h2><div class="card"><ul class="num-meses">'+n.meses.map(function(x){var f=mx>0?(+x.faturamento)/mx:mxN>0?(+x.atendimentos)/mxN:0;
        return '<li><span class="nm">'+cap(MESES[+String(x.mes).slice(5,7)-1].slice(0,3))+'</span><span class="barra" aria-hidden="true"><i style="width:'+Math.round(f*100)+'%"></i></span><span class="vl">'+vezes(+x.atendimentos,'atend.','atend.')+' · '+dinheiro(x.faturamento)+'</span></li>'}).join('')+'</ul></div>'+
      '<h2>Desde a inauguração</h2><div class="card"><div class="num-kpi tres"><div><b>'+t.atendimentos+'</b><span>atendimentos</span></div><div><b>'+t.clientes+'</b><span>'+(+t.clientes===1?'cliente':'clientes')+'</span></div><div><b>'+dinheiro(t.faturamento)+'</b><span>faturamento</span></div></div>'+
        (desde?'<p class="dica">Desde '+desde.slice(8,10)+'/'+desde.slice(5,7)+'/'+desde.slice(0,4)+'.'+(+n.faltas?' '+vezes(+n.faltas,'vez','vezes')+' a cliente não veio (fora da conta).':'')+'</p>':'')+'</div>';
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-num]');if(!b)return;var a=b.getAttribute('data-num');
    if(a==='olho'){ocultar=!ocultar;try{localStorage.setItem('amanda-ocultar-valores',ocultar?'1':'0')}catch(x){}desenharNumeros();desenharFat();
      var o=document.querySelector('[data-aba]:not([hidden]) [data-num="olho"]');if(o)o.focus();return}
    if(a==='meta-ir'){irAba('numeros');var i=$('metaV');if(i)i.focus();return}
    if(a==='faltou'){var fv=b.getAttribute('data-v')==='1';b.disabled=true;
      api('PATCH','horarios?id=eq.'+b.getAttribute('data-id')+'&status=eq.confirmado',{faltou:fv},{Prefer:'return=representation'}).then(function(j){
        if(!j||!j.length){toast(MUDOU,true);return}
        toast(fv?'Anotado: '+primeiro(j[0].nome)+' não veio. Saiu da conta.':'Pronto: o atendimento de '+primeiro(j[0].nome)+' voltou para a conta.');carregar()},falha)
        .then(function(){b.disabled=false});return}
    var v=a==='meta-tirar'?null:lerPreco(($('metaV')||{}).value);
    if(a==='meta-salvar'&&(v===null||isNaN(v)||v<1)){toast('Escreva a meta em reais, por exemplo 2000.',true);return}
    b.disabled=true;
    api('POST','rpc/definir_meta',comProf({p_valor:v})).then(function(ok){
      if(!ok){toast('Não deu certo. Confira o valor e tente de novo.',true);return}
      toast(v?'Meta salva: '+rs(v)+' por mês.':'Meta tirada.');if(document.activeElement)document.activeElement.blur();carregarNumeros()},falha)
      .then(function(){b.disabled=false});
  });

  // ---------- faturamento detalhado: por dia, semana, mês, ano, período, procedimento (e profissional) ----------
  // Os atendimentos feitos vêm do banco (rpc faturamento) e ficam guardados de fat.carregadoDe até hoje.
  // Os filtros só recortam essa lista: trocar de filtro é na hora, e só se busca no banco o que ainda falta.
  var GRAF='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';
  var SETA_D='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  function botaoFat(){return '<button class="fat-ir" type="button" data-fat-ir><span class="fi-ic">'+GRAF+'</span><span class="fi-tx"><b>Verificar faturamento detalhado</b><small>Por dia, semana, mês e procedimento</small></span>'+SETA_D+'</button>'}
  function dataBR(d){d=String(d);return d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4)}
  function primeiroDoMes(d){return d.slice(0,8)+'01'}
  function somaMeses(d,n){var p=d.split('-'),m=(+p[0])*12+(+p[1])-1+n;return Math.floor(m/12)+'-'+dd(m%12+1)+'-01'}
  function fimDoMes(d){return somaDias(somaMeses(d,1),-1)}
  function inicioSemana(d){return somaDias(d,-utc(d).getUTCDay())}
  function difDias(a,b){return Math.round((utc(b)-utc(a))/864e5)}
  function nomeMes(d){return MESES[+d.slice(5,7)-1]}
  // o intervalo do filtro e o anterior, para comparar (semana, mês e ano)
  function fatIntervalo(){
    var h=hojeSP(),a=fat.ancora||h,m=fat.modo,iv={ant:null};
    if(m==='dia'){iv.de=iv.ate=a}
    else if(m==='semana'){iv.de=inicioSemana(a);iv.ate=somaDias(iv.de,6);iv.ant=[somaDias(iv.de,-7),somaDias(iv.de,-1)];iv.cmp='a semana anterior';iv.ref='Semana anterior'}
    else if(m==='ano'){var y=+a.slice(0,4);iv.de=y+'-01-01';iv.ate=y+'-12-31';iv.ant=[(y-1)+'-01-01',(y-1)+'-12-31'];iv.cmp=String(y-1);iv.ref=(y-1)+' inteiro'}
    else if(m==='tudo'){iv.de=fat.desde||h;iv.ate=h}
    else if(m==='periodo'){iv.de=fat.de||primeiroDoMes(h);iv.ate=fat.ate||h;if(iv.ate<iv.de){var x=iv.de;iv.de=iv.ate;iv.ate=x}}
    else {iv.de=primeiroDoMes(a);iv.ate=fimDoMes(a);iv.ant=[somaMeses(iv.de,-1),somaDias(iv.de,-1)];iv.cmp=nomeMes(iv.ant[0]);iv.ref=cap(nomeMes(iv.ant[0]))+' inteiro'}
    iv.emCurso=iv.ate>=h;
    return iv;
  }
  // a partir de que dia precisa ter os atendimentos (dia e "tudo" usam a história toda, para pular entre os dias)
  function fatPrecisa(iv){return fat.modo==='dia'||fat.modo==='tudo'?somaDias(hojeSP(),-3650):iv.ant?iv.ant[0]:iv.de}
  function carregarFat(){
    if(!sess||!eu)return;
    var h=hojeSP(),precisa=fatPrecisa(fatIntervalo());
    if(fat.linhas&&fat.carregadoDe<=precisa){desenharFat();return}
    var ate=fat.linhas?somaDias(fat.carregadoDe,-1):h,de=precisa,minha=++fat.seq;
    if(difDias(de,ate)>3650)de=somaDias(ate,-3650);
    fat.carregando=true;desenharFat();
    api('POST','rpc/faturamento',comProf({p_de:de,p_ate:ate})).then(function(j){
      if(minha!==fat.seq)return;fat.carregando=false;
      if(!j||!j.linhas){fat.erro='acesso';desenharFat();return}
      fat.erro='';fat.desde=j.desde||null;fat.linhas=j.linhas.concat(fat.linhas||[]);
      // antes do primeiro atendimento não há nada: a lista já está completa
      fat.carregadoDe=!j.primeiro||de<=String(j.primeiro)?'0000-00-00':de;
      desenharFat()},
      function(e){if(minha!==fat.seq)return;fat.carregando=false;fat.erro=e==='ausente'?'banco':e==='sessao'?'':'rede';desenharFat()});
  }
  function fatPassa(r){return (!fat.serv||servRot(r)===fat.serv)&&(!fat.prof||r.profissional===fat.prof)}
  function fatRecorte(de,ate){return (fat.linhas||[]).filter(function(r){return r.data>=de&&r.data<=ate&&fatPassa(r)})}
  function fatSoma(l){var s={f:0,n:0,sv:0,fal:0,c:{}};l.forEach(function(r){if(r.faltou){s.fal++;return}s.n++;if(r.valor==null)s.sv++;else s.f+=+r.valor;if(r.cli)s.c[r.cli]=1});s.cli=Object.keys(s.c).length;return s}
  function fatGrupo(l,chave){var o={},ord=[];l.forEach(function(r){if(r.faltou)return;var k=chave(r);if(!o[k]){o[k]={k:k,n:0,f:0};ord.push(o[k])}o[k].n++;o[k].f+=+r.valor||0});return ord}
  function fatBarras(itens,rot,parte){
    var mx=0,mxN=0,tot=0;itens.forEach(function(x){mx=Math.max(mx,x.f);mxN=Math.max(mxN,x.n);tot+=x.f});
    return '<ul class="fat-bar">'+itens.map(function(x){var w=mx>0?x.f/mx:mxN>0?x.n/mxN:0;
      return '<li><span class="fb-n">'+esc(rot(x.k))+'</span><span class="fb-v">'+dinheiro(x.f)+'</span>'+
        '<small>'+vezes(x.n,'atendimento','atendimentos')+(parte&&tot>0?' · '+Math.round(x.f/tot*100)+'%':'')+'</small>'+
        '<span class="barra" aria-hidden="true"><i style="width:'+Math.max(x.n?2:0,Math.round(w*100))+'%"></i></span></li>'}).join('')+'</ul>';
  }
  // dias com atendimento (respeitando procedimento e profissional): no modo Dia, as setas pulam entre eles
  function fatDias(){var o={};(fat.linhas||[]).forEach(function(r){if(fatPassa(r))o[r.data]=1});return Object.keys(o).sort()}
  function fatPode(dir){
    var iv=fatIntervalo(),h=hojeSP(),a=fat.ancora||h;
    if(!fat.linhas||fat.modo==='tudo'||fat.modo==='periodo')return false;
    if(fat.modo==='dia'){var ds=fatDias();return dir<0?!!ds.length&&ds[0]<a:a<h}
    return dir>0?iv.ate<h:!!fat.desde&&iv.de>String(fat.desde);
  }
  function fatMover(dir){
    if(!fatPode(dir))return;
    var iv=fatIntervalo(),h=hojeSP(),a=fat.ancora||h;
    if(fat.modo==='dia'){var ds=fatDias(),alvo=null,i;
      if(dir<0){for(i=ds.length-1;i>=0;i--)if(ds[i]<a){alvo=ds[i];break}}
      else{for(i=0;i<ds.length;i++)if(ds[i]>a){alvo=ds[i];break}if(!alvo)alvo=h}
      fat.ancora=alvo>h?h:alvo}
    else if(fat.modo==='semana')fat.ancora=somaDias(iv.de,7*dir);
    else if(fat.modo==='ano')fat.ancora=(+iv.de.slice(0,4)+dir)+'-01-01';
    else fat.ancora=somaMeses(iv.de,dir);
    if(fat.ancora>h)fat.ancora=h;
    fat.mais=40;carregarFat();
  }
  function fatRotulo(iv){
    var h=hojeSP(),a=iv.de,m=fat.modo;
    if(m==='dia')return {b:a===h?'Hoje':a===somaDias(h,-1)?'Ontem':cap(SEMLONGA[utc(a).getUTCDay()]),s:(+a.slice(8,10))+' de '+nomeMes(a)+' de '+a.slice(0,4)};
    if(m==='semana'){var z=iv.ate,b=a.slice(5,7)===z.slice(5,7)?(+a.slice(8,10))+' a '+(+z.slice(8,10))+' de '+nomeMes(z):(+a.slice(8,10))+' de '+MESES3[+a.slice(5,7)-1]+'. a '+(+z.slice(8,10))+' de '+MESES3[+z.slice(5,7)-1]+'.';
      var ini=inicioSemana(h);return {b:b,s:a===ini?'Esta semana':a===somaDias(ini,-7)?'Semana passada':z.slice(0,4)}}
    if(m==='ano')return {b:a.slice(0,4),s:iv.emCurso?'De janeiro até hoje':'De janeiro a dezembro'};
    if(m==='tudo')return {b:'Desde a inauguração',s:fat.desde?dataBR(fat.desde)+' até hoje':'Até hoje'};
    return {b:cap(nomeMes(a)),s:a.slice(0,4)+(iv.emCurso?' · até hoje':'')};
  }
  // topo da página: período escolhido, setas, datas do período livre e os filtros
  function desenharFatTopo(){
    if(!$('fatRes'))return;
    var iv=fatIntervalo(),h=hojeSP(),r=fatRotulo(iv);
    [].forEach.call(document.querySelectorAll('[data-fat-p]'),function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-fat-p')===fat.modo))});
    $('fatNav').hidden=fat.modo==='periodo';$('fatDe').hidden=fat.modo!=='periodo';
    $('fatRot').innerHTML='<b>'+esc(r.b)+'</b><small>'+esc(r.s)+'</small>'+(fat.modo==='dia'?'<input type="date" id="fatDia" aria-label="Escolher o dia" max="'+h+'" value="'+iv.de+'">':'');
    [-1,1].forEach(function(d){var b=document.querySelector('[data-fat-n="'+d+'"]');b.disabled=!fatPode(d)});
    if(fat.modo==='periodo')['fatIni','fatFim'].forEach(function(id,i){var e=$(id);e.max=h;if(document.activeElement!==e)e.value=i?iv.ate:iv.de});
    $('fatOlho').innerHTML=botaoOlho();
    var v=$('fatVoltar');v.setAttribute('data-ir',fat.volta);$('fatVoltarT').textContent=fat.volta==='numeros'?'Seus números':'Início';
    // procedimentos: os do cadastro e os que aparecem nos atendimentos
    var nomes={},ps=[];
    (servs||[]).forEach(function(x){if((todas()?(!fat.prof||x.profissional===fat.prof):(x.profissional||'amanda')===minhaProf())&&x.nome)nomes[x.nome]=1});
    (fat.linhas||[]).forEach(function(x){if(!fat.prof||x.profissional===fat.prof)nomes[servRot(x)]=1});
    if(fat.serv)nomes[fat.serv]=1;
    for(var k in nomes)ps.push(k);
    ps.sort(function(a,b){return (a==='Combinado por fora')-(b==='Combinado por fora')||a.localeCompare(b,'pt-BR')});
    var sel=$('fatServ'),op='<option value="">Todos</option>'+ps.map(function(x){return '<option value="'+esc(x)+'"'+(x===fat.serv?' selected':'')+'>'+esc(x)+'</option>'}).join('');
    if(sel.getAttribute('data-op')!==op){sel.innerHTML=op;sel.setAttribute('data-op',op)}
    var pb=$('fatProfBox'),ver=todas()&&profs.length>1;pb.hidden=!ver;
    if(ver){var sp=$('fatProf'),op2='<option value="">Todas</option>'+profs.map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===fat.prof?' selected':'')+'>'+esc(x.nome)+'</option>'}).join('');
      if(sp.getAttribute('data-op')!==op2){sp.innerHTML=op2;sp.setAttribute('data-op',op2)}}
  }
  function desenharFat(){
    var box=$('fatRes');if(!box||abaAtual!=='faturamento')return;
    if(fat.modo==='dia'&&fat.diaAuto&&fat.linhas){var ds=fatDias();fat.ancora=ds.length?ds[ds.length-1]:hojeSP();fat.diaAuto=false}
    desenharFatTopo();
    var iv=fatIntervalo(),hj=hojeSP();
    if(!fat.linhas||fat.carregadoDe>iv.de){
      box.innerHTML='<p class="vazio">'+(fat.carregando||!fat.erro?'Carregando…':fat.erro==='banco'?'Para ver o faturamento detalhado, falta rodar a atualização do banco (arquivo supabase/atualizacao.sql).':fat.erro==='rede'?'Sem conexão agora. Tente de novo quando a internet voltar.':'Não consegui abrir o faturamento. Tente de novo.')+'</p>';return}
    var l=fatRecorte(iv.de,iv.ate),s=fatSoma(l),h='';
    var tit='Faturamento'+(fat.serv?' · '+fat.serv:'')+(fat.prof?' · '+primeiro(nomeProf(fat.prof)):'');
    h+='<div class="card num fat-res"><div class="num-l">'+esc(tit)+'</div><div class="num-v">'+dinheiro(s.f)+'</div>';
    if(iv.ant&&fat.carregadoDe<=iv.ant[0]){var sa=fatSoma(fatRecorte(iv.ant[0],iv.ant[1]));
      if(sa.f>0){if(iv.emCurso)h+='<p class="fat-cmp">'+esc(iv.ref)+': '+dinheiro(sa.f)+'</p>';
        else{var pc=Math.round((s.f-sa.f)/sa.f*100);
          h+='<p class="fat-cmp'+(pc>0?' sobe':'')+'">'+(pc>0?'▲ '+pc+'% a mais que ':pc<0?'▼ '+(-pc)+'% a menos que ':'O mesmo que ')+esc(iv.cmp)+'</p>'}}}
    if(s.n||s.fal||!iv.emCurso)h+='<div class="num-kpi"><div><b>'+s.n+'</b><span>'+(s.n===1?'atendimento':'atendimentos')+'</span></div><div><b>'+s.cli+'</b><span>'+(s.cli===1?'cliente':'clientes')+'</span></div></div>';
    if(s.n-s.sv>1)h+='<p class="num-x">Média de '+dinheiro(Math.round(s.f/(s.n-s.sv)*100)/100)+' por atendimento.</p>';
    if(s.sv)h+='<p class="num-x">'+vezes(s.sv,'atendimento sem preço não entrou','atendimentos sem preço não entraram')+' na conta.</p>';
    if(s.fal)h+='<p class="num-x">'+vezes(s.fal,'vez','vezes')+' a cliente não veio (fora da conta).</p>';
    // período em andamento: o que já está marcado até o fim dele (ainda não entra na conta)
    var mk=iv.emCurso?rows.filter(function(r){return r.status==='confirmado'&&!passou(r)&&r.data>=iv.de&&r.data<=iv.ate&&fatPassa(r)}):[],mkV=0;
    mk.forEach(function(r){mkV+=+r.valor||0});
    if(mk.length)h+='<p class="num-x fat-mk'+(s.n?'':' so')+'">+ '+(mkV&&!ocultar?dinheiro(mkV)+' em ':'')+vezes(mk.length,'atendimento já marcado','atendimentos já marcados')+' até '+({dia:'o fim do dia',semana:'o fim da semana',mes:'o fim do mês',ano:'o fim do ano'}[fat.modo]||'o fim do período')+'.</p>';
    h+='</div>';
    if(!s.n&&!s.fal&&mk.length){box.innerHTML=h;return}
    if(!s.n&&!s.fal){box.innerHTML=h+'<p class="fat-calmo">'+(iv.emCurso?'Os atendimentos aparecem aqui assim que acontecem.':'Sem atendimentos nesse período.')+(fat.serv||fat.prof?' Experimente tirar o filtro.':iv.emCurso?'':' Toque nas setas para ver outro.')+'</p>';return}
    if(!fat.serv){var ps=fatGrupo(l,servRot).sort(function(a,b){return b.f-a.f||b.n-a.n});
      if(ps.length)h+='<h2>Por procedimento</h2><div class="card">'+fatBarras(ps,function(k){return k},true)+'</div>'}
    if(todas()&&!fat.prof){var pp=fatGrupo(l,function(r){return r.profissional||''}).sort(function(a,b){return b.f-a.f||b.n-a.n});
      if(pp.length>1)h+='<h2>Por profissional</h2><div class="card">'+fatBarras(pp,function(k){return nomeProf(k)},true)+'</div>'}
    if(fat.modo!=='dia'){
      if(fat.modo==='ano'||fat.modo==='tudo'||difDias(iv.de,iv.ate)>62){
        var ini=primeiroDoMes(fat.desde&&String(fat.desde)>iv.de?String(fat.desde):iv.de),fim=primeiroDoMes(iv.ate<hj?iv.ate:hj),porM={},ms=[];
        fatGrupo(l,function(r){return r.data.slice(0,7)}).forEach(function(x){porM[x.k]=x});
        for(var m=ini;m<=fim;m=somaMeses(m,1))ms.push(porM[m.slice(0,7)]||{k:m.slice(0,7),n:0,f:0});
        if(ms.length>1)h+='<h2>Mês a mês</h2><div class="card">'+fatBarras(ms,function(k){var nm=cap(MESES[+k.slice(5,7)-1]);return fat.modo==='ano'?nm:nm+' de '+k.slice(0,4)})+'</div>';
      }else{var pd=fatGrupo(l,function(r){return r.data}).sort(function(a,b){return a.k<b.k?-1:1});
        if(pd.length>1)h+='<h2>Dia a dia</h2><div class="card">'+fatBarras(pd,function(k){return cap(SEM[utc(k).getUTCDay()])+', '+curta(k)})+'</div>'}
    }
    var lista=l.slice().sort(function(a,b){return (b.data+b.hora)<(a.data+a.hora)?-1:1});
    h+='<h2>Atendimentos</h2><div class="card"><ul class="fat-at">'+lista.slice(0,fat.mais).map(function(r){
      return '<li'+(r.faltou?' class="faltou"':'')+'><div><b>'+esc(r.nome)+'</b><span>'+(fat.modo==='dia'?'':esc(cap(SEM[utc(r.data).getUTCDay()]).slice(0,3)+', '+curta(r.data))+' · ')+hh(r.hora)+' · '+esc(servRot(r))+
        (todas()&&!fat.prof&&r.profissional?' · com '+esc(primeiro(nomeProf(r.profissional))):'')+'</span></div>'+
        '<span class="fa-v">'+(r.faltou?'não veio':r.valor==null?'sem preço':dinheiro(r.valor))+'</span></li>'}).join('')+'</ul>'+
      (lista.length>fat.mais?'<button class="btn ghost" type="button" data-fat-mais>Mostrar mais '+Math.min(40,lista.length-fat.mais)+'</button>':'')+'</div>';
    box.innerHTML=h;
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-fat-ir],[data-fat-p],[data-fat-n],[data-fat-mais]');if(!b)return;
    if(b.hasAttribute('data-fat-ir')){fat.volta=abaAtual==='numeros'?'numeros':'inicio';irAba('faturamento');return}
    if(b.hasAttribute('data-fat-p')){var m=b.getAttribute('data-fat-p');if(m===fat.modo)return;
      fat.modo=m;fat.ancora=null;fat.diaAuto=m==='dia';fat.mais=40;
      if(m==='periodo'&&!fat.de){fat.de=primeiroDoMes(hojeSP());fat.ate=hojeSP()}
      carregarFat();return}
    if(b.hasAttribute('data-fat-n')){fatMover(+b.getAttribute('data-fat-n'));return}
    fat.mais+=40;desenharFat();
  });
  document.addEventListener('change',function(e){
    var t=e.target,id=t&&t.id,h=hojeSP(),v=t&&t.value;
    if(id==='fatServ'||id==='fatProf'){fat[id==='fatServ'?'serv':'prof']=v;fat.mais=40;desenharFat();return}
    if(id!=='fatIni'&&id!=='fatFim'&&id!=='fatDia')return;
    if(!/^\d{4}-\d\d-\d\d$/.test(v||''))return;
    if(v>h)v=h;
    if(id==='fatDia'){fat.ancora=v;fat.diaAuto=false}else fat[id==='fatIni'?'de':'ate']=v;
    fat.mais=40;carregarFat();
  });

  // ---------- sugestão de nomes: ao digitar, mostra clientes que já existem ----------
  var CAMPO_TEL={fNome:'fTel',envNome:'envTel'};
  document.addEventListener('input',function(e){var t=e.target;if(t&&CAMPO_TEL[t.id])sugerir(t);if(t&&(t.id==='envNome'||t.id==='envTel'))desenharCadastro()});
  function sugerir(inp){
    var box=document.getElementById('sug-'+inp.id);
    if(!box){box=document.createElement('div');box.className='sug';box.id='sug-'+inp.id;box.setAttribute('role','listbox');inp.insertAdjacentElement('afterend',box)}
    var v=semAcento(inp.value.trim());
    var l=v.length<1||!clientes?[]:clientes.filter(function(x){var n=semAcento(x.nome);return n.indexOf(v)>=0&&n!==v})
      .sort(function(a,b){var pa=semAcento(a.nome).indexOf(v)===0?0:1,pb=semAcento(b.nome).indexOf(v)===0?0:1;return pa-pb||String(a.nome).localeCompare(b.nome)}).slice(0,6);
    box.hidden=!l.length;
    box.innerHTML=l.map(function(x){return '<button type="button" role="option" data-sug="'+esc(x.chave)+'" data-para="'+inp.id+'">'+esc(x.nome)+'<small>'+(x.telefone?esc(fmtTel(x.telefone)):'sem WhatsApp')+'</small></button>'}).join('');
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-sug]');if(!b)return;
    var x=cliPorChave(b.getAttribute('data-sug')),id=b.getAttribute('data-para'),inp=$(id),tel=$(CAMPO_TEL[id]);if(!x||!inp)return;
    inp.value=x.nome;if(tel&&x.telefone)tel.value=fmtTel(x.telefone);
    var box=$('sug-'+id);if(box)box.hidden=true;
    if(id==='envNome')desenharEnvio();
    desenharCadastro();
    (tel||inp).focus();
  });
  // ---------- cadastrar cliente nova (a partir de Enviar horários) ----------
  // depois de salvo, só a Sandra e a Amanda alteram ou apagam: a conferência acontece antes
  function jaCadastrada(tel){return !!tel&&(clientes||[]).some(function(x){return x.telefone===tel})}
  function desenharCadastro(){
    var box=$('cadBox');if(!box)return;
    var nome=nomeEnv(),tel=telEnv(),temTel=$('envTel').value.trim().length>0;
    var ok=nome.length>=2&&!!tel&&!jaCadastrada(tel)&&!!eu&&!eu.velho;
    box.hidden=!(nome.length>=2&&!(eu&&eu.velho));
    var b=$('bCadastrar');b.disabled=!ok;
    $('cadDica').textContent=!tel?(temTel?'Confira o WhatsApp: use o número com DDD.':'Para cadastrar, preencha também o WhatsApp dela.'):jaCadastrada(tel)?'Esta cliente já está cadastrada.':'Depois de cadastrada, só a Sandra e a Amanda conseguem alterar ou apagar.';
  }
  function abrirCadastro(){
    var nome=nomeEnv(),tel=telEnv();if(!nome||!tel)return;
    abrirEnvio('<div><span class="estado livre">Nova cliente</span><div class="t" id="envT">Confira antes de cadastrar</div></div>'+
      '<div class="card"><div class="cli-t"><b>'+esc(nome)+'</b></div><div class="cli-d">'+esc(fmtTel(tel))+'</div></div>'+
      '<div class="pergunta">Depois de cadastrada, <b>só a Sandra e a Amanda</b> conseguem corrigir ou apagar este contato. Se algo estiver errado, corrija agora.</div>'+
      '<button class="btn main" type="button" data-acao="cad-confirmar">Cadastrar cliente</button>'+
      '<button class="btn ghost" type="button" data-acao="fecharEnvio">Voltar e corrigir</button>');
  }
  function cadastrar(b){
    var nome=nomeEnv(),tel=telEnv();b.disabled=true;
    api('POST','rpc/cadastrar_contato',{p_nome:nome,p_telefone:tel,p_prof:minhaProf()}).then(function(j){
      var r=j&&j.r;
      if(r==='ok'||r==='existe'){toast(r==='ok'?primeiro(nome)+' cadastrada.':primeiro(nome)+' já estava cadastrada.');fecharEnvio();return carregarClientes()}
      toast(r==='dados'?'Confira o nome e o WhatsApp.':'Não deu certo. Tente de novo.',true);
    },function(e){if(e==='ausente'){toast('Para cadastrar clientes, falta atualizar o banco (arquivo supabase/atualizacao.sql).',true);return}falha(e)})
      .then(function(){b.disabled=false;desenharCadastro()});
  }
  if($('bCadastrar'))$('bCadastrar').onclick=abrirCadastro;

  // contatos cadastrados: só as sócias corrigem ou apagam; a parceira pede a correção
  function abrirContato(id,apagar){
    var x=(clientes||[]).filter(function(c){return c.contato_id===id})[0];if(!x){toast(MUDOU,true);return}
    if(apagar){abrirEnvio('<div><span class="estado livre">Contato</span><div class="t" id="envT">'+esc(x.nome)+'</div></div>'+
      '<div class="pergunta">Apagar o contato de '+esc(primeiro(x.nome))+'? Os horários dela na agenda continuam.</div>'+
      '<button class="btn bad-solid" type="button" data-acao="contato-apagar" data-contato="'+esc(id)+'">Sim, apagar contato</button>'+
      '<button class="btn ghost" type="button" data-acao="contato-editar" data-contato="'+esc(id)+'">Voltar</button>');return}
    abrirEnvio('<div><span class="estado livre">Contato</span><div class="t" id="envT">'+esc(x.nome)+'</div><div class="d">Só você e a '+(minhaProf()==='sandra'?'Amanda':'Sandra')+' conseguem alterar um contato cadastrado.</div></div>'+
      '<label for="ctNome">Nome</label><input type="text" id="ctNome" maxlength="60" value="'+esc(x.nome)+'">'+
      '<label for="ctTel">WhatsApp</label><input type="tel" id="ctTel" inputmode="tel" value="'+esc(fmtTel(x.telefone))+'">'+
      '<button class="btn main" type="button" data-acao="contato-salvar" data-contato="'+esc(id)+'">Salvar</button>'+
      '<button class="btn bad" type="button" data-acao="contato-apagar-perg" data-contato="'+esc(id)+'">Apagar contato…</button>'+
      '<button class="btn ghost" type="button" data-acao="fecharEnvio">Fechar</button>');
  }
  function salvarContato(id,b){
    var nome=($('ctNome').value||'').trim().replace(/\s+/g,' '),tel=normTel($('ctTel').value);
    if(nome.length<2||!tel){toast('Confira o nome e o WhatsApp (com DDD).',true);return}
    b.disabled=true;
    api('PATCH','contatos?id=eq.'+encodeURIComponent(id),{nome:nome.slice(0,60),telefone:tel},{Prefer:'return=representation'}).then(function(j){
      if(!j||!j.length){toast('Não consegui alterar. Só a Sandra e a Amanda podem.',true);return}
      toast('Contato atualizado.');fecharEnvio();return carregarClientes()},
      function(e){if(e==='erro'){toast('Não deu certo: já existe uma cliente com esse WhatsApp.',true);return}falha(e)}).then(function(){b.disabled=false});
  }
  function apagarContato(id,b){
    b.disabled=true;
    api('DELETE','contatos?id=eq.'+encodeURIComponent(id),undefined,{Prefer:'return=representation'}).then(function(j){
      if(!j||!j.length){toast('Não consegui apagar. Só a Sandra e a Amanda podem.',true);return}
      toast('Contato apagado.');fecharEnvio();return carregarClientes()},falha).then(function(){b.disabled=false});
  }
  function zapCorrecao(x){var n=String(AG.whatsapp||'').replace(/\D/g,'');if(!n)return '';
    return 'https://wa.me/'+n+'?text='+encodeURIComponent('Oi! Preciso corrigir o contato de '+x.nome+' ('+fmtTel(x.telefone)+') no painel. O certo é: ')}
  // horários livres que o site também mostra (mais de 1 h à frente), respeitando a estreia do serviço
  function proximosLivres(servNome,n){var sv=listaServ().filter(function(s){return s.nome===servNome})[0],desde=sv&&sv.desde,lim=limiteTxt();
    var dur=duracaoDe(servNome),l=rows.filter(function(r){return r.status==='livre'&&profDe(r)===minhaProf()&&(r.data+' '+r.hora)>lim&&(!desde||r.data>=desde)&&cabeEm(r,dur)});
    // de preferência em dias diferentes, para ela ter escolha de verdade
    var out=[],dias={};l.forEach(function(r){if(out.length<n&&!dias[r.data]){out.push(r);dias[r.data]=1}});
    l.forEach(function(r){if(out.length<n&&out.indexOf(r)<0)out.push(r)});
    return out.sort(function(a,b){return (a.data+a.hora)<(b.data+b.hora)?-1:1})}
  // convite para voltar: pessoal, com um motivo de verdade e dois horários prontos para escolher
  function conviteVolta(x){
    var n=primeiro(x.nome),d=diasDesde(x.ultima),sv=x.ultimo_servico||'',s=semAcento(sv);
    var motivo=s.indexOf('auriculo')>=0?'Já faz '+d+' dias da sua última sessão de auriculoterapia. Com o tempo o efeito das sementes vai passando, e a auriculoterapia costuma funcionar melhor com constância.':
      s.indexOf('limpeza')>=0?'Já faz '+d+' dias da sua limpeza de pele. A pele se renova mais ou menos a cada 4 a 6 semanas, então é um bom momento para a próxima: com o cuidado em dia, o resultado dura mais.':
      'Já faz '+d+' dias do seu último atendimento e lembrei de você.';
    var l=proximosLivres(sv,2);
    var op=l.length?'Separei '+(l.length>1?'dois horários':'um horário')+' para você:\n'+l.map(function(r,i){return (l.length>1?(i+1)+') ':'')+cap(semana(r.data))+', '+curta(r.data)+' às '+hh(r.hora)}).join('\n')+
      '\n\nÉ só responder '+(l.length>1?'1 ou 2':'"quero"')+' que eu já reservo.':'Qual dia fica bom para você nas próximas semanas? Me responde aqui que eu encaixo você.';
    return 'Oi, '+n+'! Aqui é a Amanda 🌿\n\n'+motivo+'\n\n'+op+'\n\nE lembra: se uma amiga fizer o primeiro atendimento comigo por indicação sua, você ganha 1 sessão de auriculoterapia. Te espero!';
  }
  function zapCliente(x,volta){if(!x.telefone)return '';
    var t=volta?conviteVolta(x):'Oi, '+primeiro(x.nome)+'! Aqui é a Amanda.';
    return 'https://wa.me/55'+x.telefone+'?text='+encodeURIComponent(t)}
  function desenharClientes(){
    var el=$('cliLista'),b=$('cliBusca').value.trim().toLowerCase(),bd=b.replace(/\D/g,'');
    var nSum=(clientes||[]).filter(sumida).length;
    $('cliSumidas').textContent='Mais de '+DIAS_SEM_VIR+' dias sem vir'+(clientes?' ('+nSum+')':'');
    [].forEach.call(document.querySelectorAll('[data-cli-f]'),function(c){c.setAttribute('aria-pressed',c.getAttribute('data-cli-f')===cliFiltro)});
    var l=(clientes||[]).filter(function(x){return (cliFiltro!=='sumidas'||sumida(x))&&(!b||semAcento(x.nome).indexOf(semAcento(b))>=0||(bd&&String(x.telefone||'').indexOf(bd)>=0))});
    if(cliFiltro==='sumidas')l.sort(function(a,c){return a.ultima<c.ultima?-1:1});
    var total=(clientes||[]).length;
    $('cliResumo').textContent=cliFiltro==='sumidas'?(nSum?'Clientes sem horário marcado e que não vêm há mais de '+DIAS_SEM_VIR+' dias. Que tal chamar?':''):total?total+(total>1?' clientes':' cliente')+(b?' · '+l.length+' encontrada'+(l.length===1?'':'s'):''):'';
    if(!l.length){el.innerHTML='<p class="vazio">'+(cliFiltro==='sumidas'&&!b?'Nenhuma cliente há mais de '+DIAS_SEM_VIR+' dias sem vir. Ótimo sinal!':b?'Nenhuma cliente encontrada.':'As clientes aparecem aqui quando marcam o primeiro horário ou quando você as cadastra em Enviar.')+'</p>';return}
    el.innerHTML=l.map(function(x){
      var prox=x.proxima?String(x.proxima).replace('T',' '):'',pd=prox.slice(0,10),ph=prox.slice(11,16);
      var sumiu=sumida(x),z=zapCliente(x,sumiu);
      var cad=x.contato_id?(eu&&eu.socia?'<button class="btn ghost" type="button" data-acao="contato-editar" data-contato="'+esc(x.contato_id)+'">Editar contato</button>':
        (function(zc){return zc?'<a class="btn ghost" target="_blank" rel="noopener" href="'+esc(zc)+'">Pedir correção</a>':''})(zapCorrecao(x))):'';
      return '<div class="card cli"><div class="cli-t"><b>'+esc(x.nome)+'</b>'+(x.atendimentos?'':'<span class="tag nov">Cliente nova</span>')+(x.contato_id?'<span class="tag">Cadastro travado</span>':'')+(todas()&&x.profissionais&&x.profissionais.length?'<span class="tag-prof">com '+esc(x.profissionais.map(function(i){return primeiro(nomeProf(i))}).join(', '))+'</span>':'')+'</div>'+
        '<div class="cli-d">'+(x.telefone?esc(fmtTel(x.telefone)):'Sem WhatsApp')+(x.servicos&&x.servicos.length?' · '+esc(x.servicos.join(', ')):'')+(x.faltas?' · não veio '+x.faltas+(x.faltas>1?' vezes':' vez'):'')+'</div>'+
        '<div class="cli-n"><div><b>'+x.atendimentos+'</b>'+(x.atendimentos===1?'atendimento':'atendimentos')+'</div>'+
          '<div><b>'+(x.ultima?esc(curta(x.ultima)):'—')+'</b>última vez'+(x.ultima?' ('+(diasDesde(x.ultima)===0?'hoje':'há '+diasDesde(x.ultima)+' dia'+(diasDesde(x.ultima)===1?'':'s'))+')':'')+'</div>'+
          '<div><b>'+(prox?esc(curta(pd)):'—')+'</b>'+(prox?'próximo, '+esc(hh(ph)):'sem horário marcado')+'</div></div>'+
        (sumiu?'<div class="cli-volta">Faz '+diasDesde(x.ultima)+' dias que ela não vem. Que tal chamar?</div>':'')+
        (x.obs?'<div class="cli-obs">'+esc(x.obs)+'</div>':'')+
        '<div class="row">'+(z?'<a class="btn zap-leve" target="_blank" rel="noopener" href="'+esc(z)+'">'+(sumiu?'Convidar a voltar':'WhatsApp')+'</a>':'<span></span>')+
        '<button class="btn ghost" type="button" data-acao="cli-obs" data-chave="'+esc(x.chave)+'">'+(x.obs?'Editar anotação':'Anotar')+'</button></div>'+(cad?'<div class="row" style="margin-top:8px">'+cad+'</div>':'')+'</div>'}).join('');
  }
  $('cliBusca').oninput=desenharClientes;
  function cliPorChave(k){return (clientes||[]).filter(function(x){return x.chave===k})[0]}
  function abrirObs(k){var x=cliPorChave(k);if(!x)return;
    abrirEnvio('<div><span class="estado livre">Cliente</span><div class="t" id="envT">'+esc(x.nome)+'</div><div class="d">Só você vê esta anotação.</div></div>'+
      '<label for="oTexto">Anotação</label><textarea id="oTexto" maxlength="500" placeholder="Ex.: pele sensível, prefere sábado à tarde, alergia a…">'+esc(x.obs||'')+'</textarea>'+
      '<button class="btn main" type="button" data-acao="cli-salvar" data-chave="'+esc(k)+'">Salvar anotação</button>'+
      '<button class="btn ghost" type="button" data-acao="fecharEnvio">Fechar</button>');
    $('oTexto').focus()}
  function salvarObs(k,b){var t=$('oTexto').value;b.disabled=true;
    api('POST','rpc/salvar_cliente',comProf({p_chave:k,p_obs:t})).then(function(ok){if(!ok){toast('Não deu certo. Tente de novo.',true);return}
      var x=cliPorChave(k);if(x)x.obs=t.trim()||null;fecharEnvio();desenharClientes();toast('Anotação salva.')},falha).then(function(){b.disabled=false})}

  desenharHoras();
  $('novaData').min=hojeSP();
  mostrar();
})();
