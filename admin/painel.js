// Painel da Amanda: pedidos, agenda, envio de horários, serviços, histórico, segurança e conta.
(function(){
  // o painel nunca abre dentro de outra página (evita cliques enganosos)
  if(window.top!==window.self){try{window.top.location.replace(location.href)}catch(e){}document.documentElement.style.display='none';return}
  var C=window.SUPABASE||{},$=function(i){return document.getElementById(i)};
  var SEM=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  var PADRAO=['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00'];
  var extras=[],escolhidas={'13:00':1,'14:00':1,'15:00':1,'16:00':1,'17:00':1};
  var rows=[],sess=null,aberto=null,pergunta=null,ocupado=false,relogio=null,ultimo=null;
  var servs=null,bancoVelho=false,destino=null,guard=null,semGuardiao=false,abaAtual='inicio';
  var hist={itens:[],fim:false,busca:'',ok:false,seq:0};

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
    var n=primeiro(r.nome),q=semana(r.data)+', '+curta(r.data)+' às '+hh(r.hora),t;
    var h0=hojeSP(),rel=r.data===h0?'hoje':r.data===somaDias(h0,1)?'amanhã':'';
    if(tipo==='confirmar')t='Oi, '+n+'! Aqui é a Amanda. Seu horário'+deServ(r)+' está confirmado para '+q+'. Qualquer coisa, é só me chamar. Até lá!';
    else if(tipo==='lembrar')t='Oi, '+n+'! Aqui é a Amanda. Passando para lembrar do seu horário'+deServ(r)+' '+(rel?rel+' ('+q+')':'no dia '+q)+'. Te espero! Se precisar remarcar, é só me avisar por aqui.';
    else if(tipo==='remarcar')t='Oi, '+n+'! Aqui é a Amanda. Seu horário'+deServ(r)+' mudou para '+q+'. Qualquer dúvida, é só me chamar por aqui.';
    else if(tipo==='recusar')t='Oi, '+n+'! Aqui é a Amanda. Infelizmente não vou conseguir te atender '+q+'. Quer escolher outro horário? É só me responder aqui.';
    else if(tipo==='cancelar')t='Oi, '+n+'! Aqui é a Amanda. Precisei desmarcar seu horário de '+q+'. Me desculpe! Quer remarcar? É só me responder aqui.';
    else t='Oi, '+n+'! Aqui é a Amanda, sobre o seu horário'+deServ(r)+' em '+q+'.';
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
  // novo login (email informado) começa a contar as 12 horas; renovar o token mantém o início
  function paraSessao(j,email){return {token:j.access_token,refresh:j.refresh_token,exp:Date.now()+(j.expires_in||3600)*1000-120000,
    email:String(email||(j.user&&j.user.email)||(sess&&sess.email)||'').toLowerCase(),inicio:email||!sess?Date.now():(sess.inicio||Date.now())}}
  // por segurança, a cada 12 horas o painel pede a senha de novo
  var DOZE_HORAS=12*3600*1000;
  if(sess&&!sess.inicio){sess.inicio=Date.now();salvar(sess)}
  function expirou(){return !!(sess&&Date.now()-(sess.inicio||0)>DOZE_HORAS)}
  function encerrar(msg,escopo){var fim=sairServidor(escopo);salvar(null);rows=[];guard=null;clientes=null;hist.ok=false;irAba('inicio');mostrar(msg);return fim}
  var MSG_12H='Por segurança, o painel pede a senha a cada 12 horas. Entre de novo, por favor.';
  var renovando=null;
  function token(){
    if(!sess)return Promise.reject('sessao');
    if(expirou()){var s0=sess;salvar(null);fetch(C.url+'/auth/v1/logout',{method:'POST',headers:{apikey:C.anonKey,Authorization:'Bearer '+s0.token}}).catch(function(){});rows=[];mostrar(MSG_12H);return Promise.reject('sessao')}
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
      if(!r.ok)throw 'erro';
      return r.text().then(function(t){return t?JSON.parse(t):null});
    });
  }

  // ---------- telas ----------
  function mostrar(msgLogin){
    var on=!!(sess&&C.url&&C.anonKey);
    $('vLogin').hidden=on;$('vApp').hidden=!on;fecharSheet();
    if(!C.url||!C.anonKey){$('bLogin').disabled=true;erroLogin('O painel ainda não foi ligado ao Supabase. Preencha o arquivo config.js.')}
    else if(msgLogin)erroLogin(msgLogin);
    if(on)carregar();
  }
  function erroLogin(t){var m=$('mLogin');m.textContent=t;m.hidden=!t}

  $('fLogin').onsubmit=function(e){
    e.preventDefault();var em=$('email').value.trim().toLowerCase(),se=$('senha').value;
    if(!em||!se){erroLogin('Preencha o e-mail e a senha.');return}
    $('bLogin').disabled=true;$('bLogin').textContent='Entrando…';erroLogin('');
    auth('token?grant_type=password',{email:em,password:se})
      .then(function(j){salvar(paraSessao(j,em));return api('POST','rpc/sou_admin',{})})
      .then(function(admin){
        if(admin!==true){salvar(null);erroLogin('Este e-mail entrou, mas não tem acesso à agenda. Confira o e-mail cadastrado no arquivo do banco.');return}
        $('senha').value='';mostrar();
      })
      .catch(function(err){salvar(null);erroLogin(err&&err.rede||err==='rede'?'Sem conexão. Confira a internet e tente de novo.':err&&err.status===400?'E-mail ou senha incorretos.':'Não consegui entrar agora. Tente de novo em instantes.')})
      .then(function(){$('bLogin').disabled=false;$('bLogin').textContent='Entrar'});
  };
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
  var DO_MAIS={clientes:1,servicos:1,historico:1,seguranca:1,ajuda:1,conta:1};
  function irAba(n){
    if(!document.querySelector('[data-aba="'+n+'"]'))n='inicio';
    abaAtual=n;var nav=DO_MAIS[n]?'mais':n;
    [].forEach.call(document.querySelectorAll('[data-aba]'),function(x){x.hidden=x.getAttribute('data-aba')!==n});
    [].forEach.call(document.querySelectorAll('[data-aba-btn]'),function(b){b.setAttribute('aria-current',b.getAttribute('data-aba-btn')===nav?'page':'false')});
    try{sessionStorage.setItem('amanda-aba',n)}catch(e){}
    window.scrollTo(0,0);
    if(n==='historico'&&sess)carregarHist(true);
    if(n==='clientes'&&sess)carregarClientes();
    if(n==='conta')$('cEmail').textContent=sess&&emailSessao()?'Conectada como '+emailSessao():'Conectada';
    if(n==='seguranca')verSeguranca();
    desenharSelos();
  }
  function mostrarAbrir(sim,parado){$('cardAbrir').hidden=!sim;$('bMostrarAbrir').textContent=sim?'Fechar':'Abrir novos horários';$('bMostrarAbrir').className='btn '+(sim?'ghost':'main');if(sim&&!parado)$('cardAbrir').scrollIntoView({block:'start'})}
  $('bMostrarAbrir').onclick=function(){mostrarAbrir($('cardAbrir').hidden)};
  document.addEventListener('click',function(e){
    var g=e.target.closest('[data-guia-ok]');if(g){$('boasVindas').hidden=true;try{localStorage.setItem('amanda-guia','1')}catch(x){}}
    var b=e.target.closest('[data-aba-btn],[data-ir]');if(!b)return;
    irAba(b.getAttribute('data-aba-btn')||b.getAttribute('data-ir'));
    if(b.hasAttribute('data-abrir-form'))mostrarAbrir(true);
  });
  (function(){var vista=null;try{vista=localStorage.getItem('amanda-guia')}catch(e){}$('boasVindas').hidden=!!vista;
    var a=null;try{a=sessionStorage.getItem('amanda-aba')}catch(e){}if(a&&document.querySelector('[data-aba="'+a+'"]'))irAba(a)})();

  // ---------- carregar ----------
  function carregar(){
    return api('POST','rpc/agora_sp',{})
      .then(function(s){var m=/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/.exec(s||'');
        if(m)relogio={srv:Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)),local:Date.now()}})
      .then(function(){return api('GET','horarios?select=*&data=gte.'+hojeSP()+'&order=data.asc,hora.asc')})
      .then(function(j){rows=j||[];ultimo=agoraSP();$('semNet').hidden=true;
        return api('GET','servicos?select=*&order=ordem.asc,nome.asc').then(function(sv){servs=sv||[];bancoVelho=false},function(e){if(e!=='erro'&&e!=='ausente')throw e;servs=null;bancoVelho=true})})
      .then(function(){return api('POST','rpc/situacao_guardiao',{}).then(function(g){guard=g;semGuardiao=false;if(acessoEstranho())throw 'estranho'},function(e){if(e!=='erro'&&e!=='ausente')throw e;guard=null;semGuardiao=true})})
      .then(function(){$('bancoVelho').hidden=!(bancoVelho||semGuardiao);desenhar();if(!semGuardiao)carregarClientes()})
      .catch(function(e){
        if(e==='estranho'){encerrar('Encontrei um acesso estranho ao seu painel e desconectei todos os aparelhos por segurança. Entre de novo e depois troque sua senha em Mais › Minha conta.','global');return}
        if(e==='rede'||e==='erro'){$('semNet').hidden=false;if(!ultimo)$('pedidos').innerHTML='<p class="vazio">Não consegui carregar.</p>'}});
  }
  setInterval(function(){if(sess&&expirou()){encerrar(MSG_12H);return}if(sess&&!document.hidden&&!ocupado&&!pergunta)carregar()},30000);
  document.addEventListener('visibilitychange',function(){if(sess&&!document.hidden&&!ocupado)carregar()});
  window.addEventListener('online',function(){if(sess)carregar()});
  $('bAtualizar').onclick=function(){carregar()};

  // ---------- desenhar ----------
  function desenhar(){
    var x=ultimo||agoraSP();
    $('atualizado').textContent='Atualizado às '+dd(x.getUTCHours())+':'+dd(x.getUTCMinutes())+' · atualiza sozinho';
    var ped=rows.filter(function(r){return r.status==='pedido'});
    var n=$('nPed');n.hidden=!ped.length;n.textContent=ped.length;$('nPedNav').hidden=!ped.length;$('nPedNav').textContent=ped.length;document.title=(ped.length?'('+ped.length+') ':'')+'Agenda da Amanda';
    $('pedidos').innerHTML=ped.length?ped.map(function(r){
      var min=r.pedido_em?(Date.now()-new Date(r.pedido_em).getTime())/60000:0,z=zapUrl(r,'falar');
      return '<div class="card ped"><div class="nome">'+esc(r.nome)+'</div>'+
        '<div class="qd">'+esc(r.servico)+'<br><b>'+dia(r.data)+' às '+hh(r.hora)+'</b><br>Pedido '+idade(r.pedido_em)+'</div>'+
        (passou(r)?'<div class="passou">Esse horário já passou.</div>':min>180?'<div class="velho">Esperando sua resposta há bastante tempo.</div>':'')+
        (z?'<a class="btn zap-leve" target="_blank" rel="noopener" href="'+esc(z)+'">Chamar '+esc(primeiro(r.nome))+' no WhatsApp</a>':'')+
        '<div class="row"><button class="btn ok" data-a="confirmar" data-id="'+esc(r.id)+'" type="button">Confirmar</button>'+
        '<button class="btn bad" data-a="perg-recusar" data-id="'+esc(r.id)+'" type="button">Recusar</button></div></div>'}).join(''):'<p class="vazio">Nenhum pedido esperando resposta.</p>';

    var por={},ordem=[];rows.forEach(function(r){if(!por[r.data]){por[r.data]=[];ordem.push(r.data)}por[r.data].push(r)});
    $('agenda').innerHTML=ordem.length?ordem.map(function(d){
      var c={livre:0,pedido:0,confirmado:0};por[d].forEach(function(r){c[r.status]++});
      var resumo=[c.livre?c.livre+' livre'+(c.livre>1?'s':''):'',c.pedido?c.pedido+' pedido'+(c.pedido>1?'s':''):'',c.confirmado?c.confirmado+' confirmado'+(c.confirmado>1?'s':''):''].filter(Boolean).join(' · ');
      return '<div class="dia"><h3><span>'+dia(d)+'</span><button class="dia-op" type="button" data-acao="dia" data-dia="'+d+'">Opções do dia</button></h3><div class="resumo">'+resumo+'</div><div class="chips">'+por[d].map(function(r){
        var bloq=r.status==='livre'&&!cabeEm(r,menorDuracao()),rot=r.status==='livre'?(bloq?'bloqueado':'livre'):esc(primeiro(r.nome));
        return '<button class="s '+r.status+(bloq?' bloq':'')+(passou(r)?' velho':'')+'" data-abrir="'+esc(r.id)+'" type="button" aria-label="'+esc(hh(r.hora)+', '+(r.status==='livre'?(bloq?'livre, mas bloqueado por outro atendimento':'livre'):r.status+' para '+r.nome))+'">'+hh(r.hora)+'<small>'+(passou(r)?'passou':rot)+'</small></button>'}).join('')+'</div></div>'}).join(''):
      '<p class="vazio">Nenhum horário aberto ainda. Toque em “Abrir novos horários” acima.</p>';
    if(!rows.length&&$('cardAbrir').hidden)mostrarAbrir(true,true);
    var ate=somaDias(hojeSP(),7),prox=rows.filter(function(r){return r.status==='confirmado'&&!passou(r)&&r.data<=ate});
    $('proximos').innerHTML=prox.length?prox.map(function(r){var z=zapUrl(r,'lembrar');
      return '<div class="card prox"><div class="pl"><b>'+esc(r.nome)+'</b><span>'+esc(servRot(r))+'</span><span class="quando">'+dia(r.data)+' às '+hh(r.hora)+'</span>'+
        (bancoVelho?'':r.lembrete_em?'<span class="lemb ok">✓ Lembrete enviado '+idade(r.lembrete_em)+'</span>':'<span class="lemb">Lembrete ainda não enviado</span>')+'</div>'+
        (z?'<a class="btn '+(r.lembrete_em?'zap-leve':'zap')+'" target="_blank" rel="noopener"'+(bancoVelho?'':' data-lembrete="'+esc(r.id)+'"')+' href="'+esc(z)+'">'+(r.lembrete_em?'Mandar de novo':'Mandar lembrete')+'</a>':
           '<button class="btn ghost" type="button" data-abrir="'+esc(r.id)+'">Sem WhatsApp: toque para adicionar</button>')+'</div>'}).join(''):
      '<p class="vazio">Nenhum atendimento confirmado nos próximos 7 dias.</p>';
    desenharServicos();
    desenharEnvio();
    desenharGuardiao();
    // com uma pergunta aberta, não redesenha (não apaga o que ela está digitando);
    // a ação continua segura porque só vale se o horário não tiver mudado
    if(aberto&&!pergunta)desenharSheet();
  }

  // ---------- painel de ações ----------
  function linha(id){return rows.filter(function(r){return r.id===id})[0]}
  function listaServ(){return servs||(window.AGENDA&&AGENDA.servicos)||[]}
  // ---------- duração dos procedimentos ----------
  // cada atendimento ocupa a duração do serviço (desconhecido ou "combinado por fora": 1 hora)
  function duracaoDe(nome){var n=semAcento(nome),x=listaServ().filter(function(v){return semAcento(v.nome)===n})[0];return x&&+x.duracao?+x.duracao:60}
  function minutos(h){return (+h.slice(0,2))*60+(+h.slice(3,5))}
  function durTxt(m){var h=Math.floor(m/60),r=m%60;return h?h+'h'+(r?dd(r):''):r+' min'}
  // atendimentos do mesmo dia que se sobrepõem a [hora, hora + dur), ignorando os ids informados
  function conflitos(data,hora,dur,ignorar){var a=minutos(hora),b=a+dur;ignorar=ignorar||[];
    return rows.filter(function(o){if(o.data!==data||o.status==='livre'||ignorar.indexOf(o.id)>=0)return false;var c=minutos(o.hora);return c<b&&c+duracaoDe(o.servico)>a})}
  // horário livre que fica dentro de um atendimento que já começou (ex.: 14h30 dentro da limpeza das 14h)
  function dentroDe(r){var a=minutos(r.hora);return rows.filter(function(o){if(o.data!==r.data||o.status==='livre'||o.id===r.id)return false;var c=minutos(o.hora);return c<a&&c+duracaoDe(o.servico)>a})[0]}
  // um horário livre "cabe" um procedimento de dur minutos sem encostar em ninguém
  function cabeEm(r,dur){return r.status==='livre'&&!conflitos(r.data,r.hora,dur,[r.id]).length}
  function menorDuracao(){var d=listaServ().filter(function(x){return x.ativo!==false}).map(function(x){return +x.duracao||60});return d.length?Math.min.apply(null,d):60}
  function textoConflito(l){return l.map(function(o){return esc(primeiro(o.nome))+' às '+hh(o.hora)+' ('+esc(servRot(o))+', '+durTxt(duracaoDe(o.servico))+')'}).join(' e ')}
  function opcoesServ(sel){var l=listaServ().map(function(x){return x.nome});if(sel&&POR_FORA.indexOf(sel)<0&&l.indexOf(sel)<0)l.unshift(sel);
    return '<option value="">Combinado por fora</option>'+l.map(function(n){return '<option'+(n===sel?' selected':'')+'>'+esc(n)+'</option>'}).join('')}
  function campos(r){r=r||{};return '<label for="fNome">Nome da cliente</label><input type="text" id="fNome" maxlength="60" value="'+esc(r.nome&&r.nome!=='Marcado por fora'?r.nome:'')+'" placeholder="Ex.: Maria Silva">'+
    '<label for="fTel">WhatsApp da cliente (opcional)</label><input type="tel" id="fTel" inputmode="tel" value="'+esc(fmtTel(r.telefone))+'" placeholder="(11) 90000-0000">'+
    '<label for="fServ">Serviço</label><select id="fServ">'+opcoesServ(r.servico)+'</select>'}
  function lerForm(){var v=($('fTel')||{}).value||'';return {nome:(($('fNome')||{}).value||'').trim().slice(0,60),tel:normTel(v),telErro:!!v.trim()&&!normTel(v),serv:($('fServ')||{}).value||''}}
  function livresPara(r){var m={},o=[];rows.forEach(function(x){if(x.status!=='livre'||x.id===r.id||passou(x))return;if(!m[x.data]){m[x.data]=[];o.push(x.data)}m[x.data].push(x)});return o.map(function(d){return {data:d,itens:m[d]}})}
  function abrirSheet(id){aberto=id;pergunta=null;destino=null;desenharSheet()}
  function fecharSheet(){aberto=null;pergunta=null;destino=null;$('sheet').hidden=true;if($('envio').hidden)$('veu').hidden=true}
  function desenharSheet(){
    var r=linha(aberto),s=$('sheet');
    if(!r){fecharSheet();return}
    var nomes={livre:'Livre',pedido:'Pedido',confirmado:'Confirmado'},nm=esc(primeiro(r.nome));
    var h='<div><span class="estado '+r.status+'">'+nomes[r.status]+'</span><div class="t" id="sheetT">'+dia(r.data)+' às '+hh(r.hora)+'</div>'+
      (r.status!=='livre'?'<div class="d">'+esc(r.nome)+' · '+esc(servRot(r))+(r.telefone?' · '+fmtTel(r.telefone):'')+'</div>':'')+
      (r.lembrete_em?'<div class="d" style="color:var(--ok)">✓ Lembrete enviado '+idade(r.lembrete_em)+'</div>':'')+
      (passou(r)?'<div class="d" style="color:var(--bad)">Esse horário já passou.</div>':'')+'</div>';
    if(r.status==='livre'&&!pergunta){var dn=dentroDe(r),cf=dn?null:conflitos(r.data,r.hora,menorDuracao(),[r.id]);
      if(dn)h+='<div class="aviso-dur">As clientes não conseguem marcar este horário pelo site: ele fica dentro do atendimento de '+textoConflito([dn])+'.</div>';
      else if(cf.length)h+='<div class="aviso-dur">As clientes não conseguem marcar este horário pelo site: não dá tempo de nenhum procedimento antes do atendimento de '+textoConflito(cf)+'.</div>'}
    var dis=ocupado?' disabled':'',V='<button class="btn ghost" data-a="voltar" type="button">Voltar</button>';
    if(pergunta==='recusar')h+='<div class="pergunta">Recusar o pedido de '+nm+'? O horário volta a ficar livre no site.</div><button class="btn bad-solid" data-a="recusar" type="button"'+dis+'>Sim, recusar</button>'+V;
    else if(pergunta==='cancelar')h+='<div class="pergunta">Cancelar o horário de '+nm+'? Ele volta a ficar livre no site.</div><button class="btn bad-solid" data-a="cancelar" type="button"'+dis+'>Sim, cancelar e liberar</button>'+V;
    else if(pergunta==='excluir')h+='<div class="pergunta">Cancelar o horário de '+nm+' e apagar este horário da agenda? Ele some do site.</div><button class="btn bad-solid" data-a="excluir" type="button"'+dis+'>Sim, cancelar e apagar</button>'+V;
    else if(pergunta==='remover')h+='<div class="pergunta">Remover este horário da agenda? Ele some do site.</div><button class="btn bad-solid" data-a="remover" type="button"'+dis+'>Sim, remover</button>'+V;
    else if(pergunta==='ocupar')h+=campos()+'<button class="btn main" data-a="ocupar" type="button"'+dis+'>Marcar como ocupado</button>'+V;
    else if(pergunta==='editar')h+=campos(r)+'<button class="btn main" data-a="editar" type="button"'+dis+'>Salvar alterações</button>'+V;
    else if(pergunta==='mover')h+='<label for="fData">Dia</label><input type="date" id="fData" value="'+r.data+'" min="'+hojeSP()+'"><label for="fHora">Horário</label><input type="time" id="fHora" value="'+r.hora+'" step="900"><button class="btn main" data-a="mover" type="button"'+dis+'>Salvar novo dia e horário</button>'+V;
    else if(pergunta==='remarcar'){
      var op=livresPara(r),dst=destino&&linha(destino);
      var cfr=dst?conflitos(dst.data,dst.hora,duracaoDe(r.servico),[r.id,dst.id]):[];
      h+='<div class="destinos"><span class="label">Para qual horário livre?</span>'+(op.length?op.map(function(g){return '<h4>'+dia(g.data)+'</h4><div class="chips">'+g.itens.map(function(x){return '<button class="chip" type="button" data-destino="'+esc(x.id)+'" aria-pressed="'+(destino===x.id)+'">'+hh(x.hora)+'</button>'}).join('')+'</div>'}).join(''):'<p class="vazio">Nenhum horário livre. Abra um horário antes e volte aqui.</p>')+'</div>'+
        (cfr.length?'<div class="aviso-dur forte"><b>Atenção:</b> '+esc(servRot(r))+' leva '+durTxt(duracaoDe(r.servico))+'. Nesse horário vai encostar no atendimento de '+textoConflito(cfr)+'.</div>':'')+
        '<button class="btn main" data-a="remarcar" type="button"'+(dst&&!ocupado?'':' disabled')+'>'+(dst?(cfr.length?'Remarcar mesmo assim':'Remarcar '+nm+' para '+dia(dst.data)+' às '+hh(dst.hora)):'Escolha o novo horário')+'</button>'+V;
    }
    else{
      if(r.status==='pedido'){var z=zapUrl(r,'falar');h+='<button class="btn ok" data-a="confirmar" data-id="'+esc(r.id)+'" type="button"'+dis+'>Confirmar</button>'+(z?'<a class="btn zap-leve" target="_blank" rel="noopener" href="'+esc(z)+'">Chamar no WhatsApp</a>':'')}
      if(r.status==='confirmado'){var zl=zapUrl(r,'lembrar'),zc=zapUrl(r,'confirmar');h+=(zl?'<a class="btn zap" target="_blank" rel="noopener"'+(bancoVelho?'':' data-lembrete="'+esc(r.id)+'"')+' href="'+esc(zl)+'">Mandar lembrete</a><a class="btn zap-leve" target="_blank" rel="noopener" href="'+esc(zc)+'">Mandar confirmação</a>':'')}
      if(r.status!=='livre')h+=(bancoVelho?'<button class="btn ghost" data-a="perg-editar" type="button">Editar dados</button>':'<div class="row"><button class="btn ghost" data-a="perg-editar" type="button">Editar dados</button><button class="btn ghost" data-a="perg-remarcar" type="button">Remarcar</button></div>')+
        (r.status==='pedido'?'<button class="btn bad" data-a="perg-recusar" type="button">Recusar…</button>':'<button class="btn bad" data-a="perg-cancelar" type="button">Cancelar e liberar…</button>')+
        '<button class="btn bad" data-a="perg-excluir" type="button">Cancelar e apagar este horário…</button>';
      if(r.status==='livre')h+='<button class="btn main" data-a="perg-ocupar" type="button">Marcar como ocupado (marquei por fora)</button><button class="btn ghost" data-a="perg-mover" type="button">Mudar dia ou horário</button><button class="btn bad" data-a="perg-remover" type="button">Remover horário…</button>';
      h+='<button class="btn ghost" data-a="fechar" type="button">Fechar</button>';
    }
    s.innerHTML=h;s.hidden=false;$('veu').hidden=false;
    var f=s.querySelector('input');if(f&&pergunta)f.focus();
  }

  // ---------- ações (só valem se o horário ainda estiver como ela viu) ----------
  var MUDOU='Esse horário mudou enquanto você olhava (talvez uma cliente tenha pedido agora). Atualizei a tela: confira e tente de novo.';
  function falha(e){if(e!=='sessao')toast(e==='rede'?'Sem conexão. Nada foi alterado. Tente de novo quando a internet voltar.':'Não deu certo. Nada foi alterado. Tente de novo.',true)}
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
    if(acao==='ocupar'||acao==='editar'){f=lerForm();if(f.telErro){toast('Confira o WhatsApp: use o número com DDD.',true);return}if(acao==='editar'&&f.nome.length<2){toast('Escreva o nome da cliente.',true);return}}
    if(acao==='mover'){var nd=$('fData').value,nh=$('fHora').value;if(!/^\d{4}-\d\d-\d\d$/.test(nd)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(nh)){toast('Escolha o dia e o horário.',true);return}if(nd===r.data&&nh===r.hora){pergunta=null;desenharSheet();return}}
    if(acao==='remarcar'&&!(destino&&linha(destino))){toast('Escolha o novo horário.',true);return}
    ocupado=true;
    if(acao==='confirmar')p=mudar(r,'pedido',{status:'confirmado'}).then(function(ok){if(ok){var z=zapUrl(antes,'confirmar');toast('Confirmado: '+primeiro(antes.nome)+', '+quando+'.',false,z,'Avisar '+primeiro(antes.nome)+' no WhatsApp')}return ok});
    else if(acao==='recusar')p=mudar(r,'pedido',limpa()).then(function(ok){if(ok){var z=zapUrl(antes,'recusar');toast('Pedido recusado. '+quando+' voltou a ficar livre.',false,z,'Avisar '+primeiro(antes.nome)+' no WhatsApp')}return ok});
    else if(acao==='cancelar')p=mudar(r,'confirmado',limpa()).then(function(ok){if(ok){var z=zapUrl(antes,'cancelar');toast('Horário cancelado. '+quando+' voltou a ficar livre.',false,z,'Avisar '+primeiro(antes.nome)+' no WhatsApp')}return ok});
    else if(acao==='ocupar')p=mudar(r,'livre',{status:'confirmado',nome:f.nome.length>1?f.nome:'Marcado por fora',servico:f.serv||'Combinado por fora',telefone:f.tel||null,pedido_em:new Date().toISOString()}).then(function(ok){if(ok)toast(quando+' marcado como ocupado'+(f.nome.length>1?' para '+primeiro(f.nome):'')+'.');return ok});
    else if(acao==='editar')p=mudar(r,r.status,{nome:f.nome,telefone:f.tel||null,servico:f.serv||'Combinado por fora'}).then(function(ok){if(ok)toast('Dados de '+primeiro(f.nome)+' atualizados.');return ok});
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
    d.innerHTML='<b>Atenção:</b> '+esc(serv||'Combinado por fora')+' leva '+durTxt(duracaoDe(serv))+'. Nesse horário vai encostar no atendimento de '+textoConflito(lista)+'.';
    b.parentNode.insertBefore(d,b);b.setAttribute('data-forcar','1');b.textContent=b.getAttribute('data-a')==='ocupar'?'Marcar mesmo assim':'Salvar mesmo assim';
  }
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
      var cfo=mudouServ?conflitos(r.data,r.hora,duracaoDe(fs),[r.id]):[];
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
    var pedidos=[];p.datas.forEach(function(d){p.horas.forEach(function(h){pedidos.push({data:d,hora:h})})});
    $('bAbrir').disabled=true;$('bAbrir').textContent='Abrindo…';
    api('POST','horarios?on_conflict=data,hora',pedidos,{Prefer:'resolution=ignore-duplicates,return=representation'})
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
  function diasLivres(){var m={},o=[],lim=limiteTxt(),sv=servEnv(),dur=sv?duracaoDe(sv.nome):menorDuracao();rows.forEach(function(r){if(r.status!=='livre'||(r.data+' '+r.hora)<=lim||!cabeEm(r,dur))return;if(!m[r.data]){m[r.data]=[];o.push(r.data)}m[r.data].push(r.hora)});
    return o.map(function(d){return {data:d,horas:m[d].sort()}})}
  function selecionados(){return diasLivres().filter(function(d){return envSel[d.data]})}
  function dataLonga(d){var x=utc(d);return SEMLONGA[x.getUTCDay()]+', '+x.getUTCDate()+' de '+MESES[x.getUTCMonth()]}
  function cap(t){return t.charAt(0).toUpperCase()+t.slice(1)}
  function curto(d){return semana(d).slice(0,3)+' '+curta(d)}
  function nomeEnv(){return $('envNome').value.trim().slice(0,60)}
  function telEnv(){var t=$('envTel').value.replace(/\D/g,'');if(t.indexOf('55')===0&&(t.length===12||t.length===13))t=t.slice(2);return (t.length===10||t.length===11)?t:''}
  function servEnv(){var id=$('envServ').value;return listaServ().filter(function(x){return x.id===id})[0]||null}
  function saud(){var n=primeiro(nomeEnv());return 'Oi'+(n?', '+n:'')+'! Aqui é a Amanda.'}
  function siteBase(){return location.origin+location.pathname.replace(/admin\/(index\.html)?$/,'')}
  function linkCliente(sel){var q='?dias='+sel.map(function(d){return d.data}).join(',');var n=primeiro(nomeEnv());if(n)q+='&n='+encodeURIComponent(n);var sv=servEnv();if(sv)q+='&s='+encodeURIComponent(sv.id);return siteBase()+q+'#agendar'}
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
  function criarImagem(sel,nome,sv){
    var W=1080,P=48,F='Montserrat, system-ui, sans-serif';
    var fontes=[document.fonts.load('48px "Great Vibes"'),document.fonts.load('800 40px Montserrat'),document.fonts.load('600 40px Montserrat'),document.fonts.load('600 28px Cormorant')];
    return Promise.all(fontes).catch(function(){}).then(function(){return new Promise(function(res){var im=new Image();im.onload=function(){res(im)};im.onerror=function(){res(null)};im.src='../img/logo.svg'})}).then(function(logo){
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
      var g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,'#167469');g.addColorStop(.45,'#0B5F59');g.addColorStop(1,'#053F3A');x.fillStyle=g;x.fillRect(0,0,W,H);
      x.strokeStyle='rgba(245,197,157,.18)';x.lineWidth=2;x.beginPath();x.arc(W+60,-40,380,0,7);x.stroke();x.beginPath();x.arc(-80,H-160,330,0,7);x.stroke();
      // 3) cabeçalho
      x.textAlign='center';x.textBaseline='alphabetic';
      if(logo)x.drawImage(logo,W/2-80,56,160,160);
      x.fillStyle='#F5C59D';x.font='400 112px "Great Vibes", cursive';x.fillText('Amanda Rocha',W/2,350);
      x.fillStyle='#FBE3CE';x.font='600 30px Cormorant, Georgia, serif';x.fillText('BELEZA  ·  SAÚDE  ·  BEM-ESTAR',W/2,400);
      var y=490;x.fillStyle='#FFF8F1';x.font='800 70px '+F;x.fillText('Horários disponíveis',W/2,y);
      if(nome){y+=64;x.fillStyle='#F5C59D';x.font='700 44px '+F;x.fillText('para '+nome,W/2,y)}
      if(sv){y+=60;x.fillStyle='#FBE3CE';x.font='600 38px '+F;x.fillText(sv.nome,W/2,y)}
      y=topo;
      // 4) cartões dos dias
      cards.forEach(function(k){
        x.fillStyle='#FFF8F1';rr(P,y,W-2*P,k.h,36);x.fill();
        x.textAlign='left';x.fillStyle='#053F3A';x.font='800 50px '+F;x.fillText(k.titulo,P+36,y+36+50);
        var py=y+36+64+20;
        k.linhas.forEach(function(ln){var px=P+36;ln.forEach(function(p){x.fillStyle='#0B5F59';rr(px,py,p.w,PH,28);x.fill();x.fillStyle='#FFF8F1';x.textAlign='center';x.font='800 52px '+F;x.fillText(p.t,px+p.w/2,py+PH/2+19);px+=p.w+GAP});x.textAlign='left';py+=PH+GAP});
        y+=k.h+gap});
      // 5) rodapé
      var ry=H-rodape+16;x.fillStyle='#F5C59D';rr(P,ry,W-2*P,rodape-112,36);x.fill();
      x.textAlign='center';x.fillStyle='#053F3A';x.font='800 46px '+F;x.fillText('Gostou de um horário?',W/2,ry+76);
      x.font='600 36px '+F;x.fillText('Responda esta mensagem com',W/2,ry+130);x.fillText('o dia e a hora que você prefere.',W/2,ry+176);
      x.font='800 64px '+F;x.fillText(fmtZap(),W/2,ry+246);
      x.fillStyle='rgba(251,227,206,.8)';x.font='700 24px "JetBrains Mono", monospace';x.fillText('COM O CUIDADO DE UMA ENFERMEIRA',W/2,H-34);
      return new Promise(function(res){c.toBlob(res,'image/png')});
    });
  }
  $('bImg').onclick=function(){
    var sel=selecionados();if(!sel.length)return;var nome=primeiro(nomeEnv()),sv=servEnv(),t=textoImagem(sel);
    abrirEnvio('<div><span class="estado pedido">Imagem</span><div class="t" id="envT">Criando a imagem…</div></div>');
    criarImagem(sel,nome,sv).then(function(blob){
      if(!blob)throw 0;var url=URL.createObjectURL(blob);var file;try{file=new File([blob],'horarios-amanda.png',{type:'image/png'})}catch(e){file=null}
      envImg={url:url,file:file,texto:t};envTexto=t;
      abrirEnvio('<div><span class="estado pedido">Imagem</span><div class="t" id="envT">Imagem pronta</div><div class="d">Letras grandes, para a cliente ver com facilidade e responder qual horário prefere.</div></div>'+
        '<img class="previa-img" alt="Horários disponíveis" src="'+url+'">'+
        '<button class="btn zap" data-acao="compartilhar" type="button">Enviar pelo WhatsApp</button>'+
        '<a class="btn ghost" href="'+url+'" download="horarios-amanda.png">Salvar imagem</a>'+
        (telEnv()?'<a class="btn ghost" target="_blank" rel="noopener" href="'+esc(zapEnvio(t))+'">Abrir só a conversa com a cliente</a>':'')+
        '<p class="nota">Se abrir uma tela com a imagem, segure o dedo sobre ela e toque em Salvar. Depois é só anexar na conversa.</p>'+
        '<button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>');
    }).catch(function(){abrirEnvio('<div><div class="t" id="envT">Não consegui criar a imagem</div><div class="d">Tente de novo. Se continuar, envie o link.</div></div><button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>')});
  };
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
  });
  document.addEventListener('click',function(e){if(e.target===$('veu')&&!$('envio').hidden)fecharEnvio()});

  // ---------- opções de um dia da agenda ----------
  function abrirDia(d,perguntar){
    var doDia=rows.filter(function(r){return r.data===d}),livres=doDia.filter(function(r){return r.status==='livre'}).length,marcados=doDia.length-livres;
    var h='<div><span class="estado livre">Dia</span><div class="t" id="envT">'+esc(dia(d))+'</div><div class="d">'+livres+' livre'+(livres===1?'':'s')+(marcados?' · '+marcados+' com cliente':'')+'</div></div>';
    if(perguntar)h+='<div class="pergunta">Remover os '+livres+' horário'+(livres===1?'':'s')+' livre'+(livres===1?'':'s')+' deste dia? Os horários com cliente continuam.</div><button class="btn bad-solid" data-acao="dia-limpar" data-dia="'+d+'" type="button">Sim, remover os livres</button><button class="btn ghost" data-acao="dia" data-dia="'+d+'" type="button">Voltar</button>';
    else h+='<label for="dHora">Adicionar um horário neste dia</label><div class="extra"><input type="time" id="dHora" step="900"><button class="btn main" data-acao="dia-add" data-dia="'+d+'" type="button">Adicionar</button></div>'+
      (livres?'<button class="btn bad" data-acao="dia-limpar-perg" data-dia="'+d+'" type="button">Remover os horários livres deste dia…</button>':'')+
      '<button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>';
    abrirEnvio(h);
  }
  function diaAdicionar(d,b){
    var v=$('dHora').value;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)){toast('Escolha o horário, por exemplo 13:30.',true);return}
    b.disabled=true;
    api('POST','horarios?on_conflict=data,hora',[{data:d,hora:v}],{Prefer:'resolution=ignore-duplicates,return=representation'})
      .then(function(j){if(j&&j.length){toast(hh(v)+' adicionado em '+dia(d)+'.');fecharEnvio()}else toast('Esse horário já existe ou já passou.',true);return carregar()},falha)
      .then(function(){b.disabled=false});
  }
  function diaLimpar(d,b){
    b.disabled=true;
    api('DELETE','horarios?data=eq.'+d+'&status=eq.livre',undefined,{Prefer:'return=representation'})
      .then(function(j){var n=(j||[]).length;toast(n?n+' horário'+(n>1?'s':'')+' livre'+(n>1?'s':'')+' removido'+(n>1?'s':'')+' de '+dia(d)+'.':'Nenhum horário livre para remover.');fecharEnvio();return carregar()},falha)
      .then(function(){b.disabled=false});
  }

  // ---------- serviços ----------
  function desenharServicos(){
    var el=$('servicos');
    if(bancoVelho){el.innerHTML='<p class="vazio">Para editar os serviços por aqui, falta atualizar o banco.</p>';$('bNovoServ').hidden=true;return}
    $('bNovoServ').hidden=false;var l=servs||[];
    el.innerHTML=l.length?l.map(function(x){
      var tags=(x.duracao?'<span class="tag">Leva '+durTxt(+x.duracao)+'</span>':'')+(x.ativo?'':'<span class="tag off">Escondido do site</span>')+(x.novidade?'<span class="tag nov">Novidade</span>':'')+(x.desde?'<span class="tag">A partir de '+curta(x.desde)+'</span>':'');
      return '<div class="card serv"><div><b>'+esc(x.nome)+'</b><span>'+esc(x.detalhe||'')+'</span>'+(tags?'<div class="tags">'+tags+'</div>':'')+'</div><button class="btn ghost" data-acao="serv-editar" data-serv="'+esc(x.id)+'" type="button">Editar</button></div>'}).join(''):
      '<p class="vazio">Nenhum serviço. Adicione o primeiro.</p>';
  }
  function servPorId(id){return (servs||[]).filter(function(x){return x.id===id})[0]}
  // o banco só tem a coluna de duração depois da atualização
  function temDuracao(){return !!(servs&&servs.length&&('duracao' in servs[0]))}
  var DURACOES=[15,20,30,40,45,50,60,75,90,105,120,150,180];
  function opcoesDuracao(atual){var l=DURACOES.slice();if(l.indexOf(atual)<0)l.push(atual);l.sort(function(a,b){return a-b});
    return l.map(function(m){return '<option value="'+m+'"'+(m===atual?' selected':'')+'>'+durTxt(m)+'</option>'}).join('')}
  function abrirServ(id,perguntar){
    var x=id?servPorId(id):null;if(id&&!x){toast(MUDOU,true);return}
    var h='<div><span class="estado livre">Serviço</span><div class="t" id="envT">'+(x?esc(x.nome):'Novo serviço')+'</div></div>';
    if(perguntar)h+='<div class="pergunta">Remover o serviço '+esc(x.nome)+'? Ele some do site. Os horários já marcados com ele continuam.</div><button class="btn bad-solid" data-acao="serv-remover" data-serv="'+esc(x.id)+'" type="button">Sim, remover</button><button class="btn ghost" data-acao="serv-editar" data-serv="'+esc(x.id)+'" type="button">Voltar</button>';
    else h+='<label for="sNome">Nome</label><input type="text" id="sNome" maxlength="40" value="'+esc(x?x.nome:'')+'" placeholder="Ex.: Massagem relaxante">'+
      '<label for="sDet">Descrição curta (opcional)</label><input type="text" id="sDet" maxlength="60" value="'+esc(x&&x.detalhe||'')+'" placeholder="Ex.: R$ 75 na inauguração">'+
      '<label class="check"><input type="checkbox" id="sAtivo"'+(!x||x.ativo?' checked':'')+'> Aparece no site</label>'+
      '<label class="check"><input type="checkbox" id="sNov"'+(x&&x.novidade?' checked':'')+'> Mostrar o selo “Novidade”</label>'+
      (temDuracao()?'<label for="sDur">Quanto tempo leva</label><select id="sDur">'+opcoesDuracao(x&&+x.duracao||60)+'</select>'+
        '<p class="dica">Conte também o tempo de arrumar para a próxima cliente. O site não deixa marcar outra cliente antes de terminar.</p>':'')+
      '<label for="sDesde">Pode ser marcado a partir de (opcional)</label><input type="date" id="sDesde" value="'+esc(x&&x.desde||'')+'">'+
      '<button class="btn main" data-acao="serv-salvar" data-serv="'+esc(x?x.id:'')+'" type="button">Salvar</button>'+
      (x?'<button class="btn bad" data-acao="serv-remover-perg" data-serv="'+esc(x.id)+'" type="button">Remover serviço…</button>':'')+
      '<button class="btn ghost" data-acao="fecharEnvio" type="button">Fechar</button>';
    abrirEnvio(h);
  }
  function slug(t){var b=String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,26)||'servico';
    if(b.length<2)b+='-s';var id=b,i=2;while(servPorId(id))id=b+'-'+(i++);return id}
  function salvarServ(id,b){
    var nome=$('sNome').value.trim(),det=$('sDet').value.trim(),desde=$('sDesde').value||null;
    if(nome.length<2){toast('Escreva o nome do serviço.',true);return}
    var dados={nome:nome.slice(0,40),detalhe:det?det.slice(0,60):null,ativo:$('sAtivo').checked,novidade:$('sNov').checked,desde:desde};
    if($('sDur'))dados.duracao=+$('sDur').value;
    b.disabled=true;
    var req=id?api('PATCH','servicos?id=eq.'+encodeURIComponent(id),dados,{Prefer:'return=representation'})
              :api('POST','servicos',(dados.id=slug(nome),dados.ordem=(servs||[]).reduce(function(m,x){return Math.max(m,x.ordem||0)},0)+1,dados),{Prefer:'return=representation'});
    req.then(function(j){if(!j||!j.length){toast(MUDOU,true);return}toast(id?'Serviço atualizado.':'Serviço adicionado. Ele já aparece no site.');fecharEnvio();return carregar()},falha)
       .then(function(){b.disabled=false});
  }
  function removerServ(id,b){
    b.disabled=true;
    api('DELETE','servicos?id=eq.'+encodeURIComponent(id),undefined,{Prefer:'return=representation'})
      .then(function(j){toast(j&&j.length?'Serviço removido.':MUDOU,!(j&&j.length));fecharEnvio();return carregar()},falha)
      .then(function(){b.disabled=false});
  }
  $('bNovoServ').onclick=function(){abrirServ(null)};
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
    var e=estadoGuarda(),selo=$('selo'),m=$('mSeg'),av=$('avisoGuarda'),nm=$('nMais'),n=guard?guard.nao_vistos:0;
    selo.hidden=m.hidden=!e;nm.hidden=!n;nm.textContent=n||'';
    if(!e){av.hidden=true;return}
    selo.className='selo'+(e==='ok'?'':' '+e);selo.textContent=e==='ok'?'Protegido':e==='warn'?'Proteção ligada':'Atenção';
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
    if(e==='warn')h='<div class="gt"><span class="gi">'+ATENCAO+'</span><div><b>Proteção ligada</b><span>Desde '+esc(quandoSP(guard.pausado_em))+(guard.pausado_por==='guardião'?', ligada pelo guardião':', ligada por você')+'.</span></div></div>'+
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
      '<div class="resumo-6h"><b>Todo dia às 6h</b><span>'+(guard.resumo?'Chega um resumo: “Você tem 4 agendamentos para hoje: 13h, 14h…”. Só quando houver agendamento.':'O resumo das 6h ainda não está ligado no banco.')+'</span>'+
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
    var q='historico?select=*&order=em.desc,id.desc&limit='+POR_PAGINA+'&offset='+hist.itens.length;
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

  // um programa automático (não um celular ou computador) logado com a senha dela é sinal de invasão
  function acessoEstranho(){return !!(guard&&guard.aparelhos&&guard.aparelhos.some(function(x){return !x.atual&&automatico(x.aparelho)}))}

  // ---------- clientes ----------
  var clientes=null,cliFiltro='todas',DIAS_SEM_VIR=10;
  function carregarClientes(){
    if(!clientes)$('cliLista').innerHTML='<p class="vazio">Carregando…</p>';
    api('POST','rpc/clientes_resumo',{}).then(function(j){clientes=j||[];desenharClientes()},function(e){
      if(e==='sessao')return;
      $('cliLista').innerHTML='<p class="vazio">'+(e==='ausente'?'Para ver as clientes aqui, falta rodar a atualização do banco (arquivo supabase/atualizacao.sql).':e==='rede'?'Sem conexão. Tente de novo quando a internet voltar.':'Não consegui carregar as clientes agora.')+'</p>'});
  }
  function diasDesde(d){return Math.round((utc(hojeSP())-utc(d))/864e5)}
  // sem horário marcado e sem vir há mais de 10 dias
  function sumida(x){return !x.proxima&&!!x.ultima&&diasDesde(x.ultima)>DIAS_SEM_VIR}
  function semAcento(t){t=String(t||'').toLowerCase();try{return t.normalize('NFD').replace(/[\u0300-\u036f]/g,'')}catch(e){return t}}
  document.addEventListener('click',function(e){var f=e.target.closest('[data-cli-f]');if(!f)return;cliFiltro=f.getAttribute('data-cli-f');desenharClientes()});

  // ---------- sugestão de nomes: ao digitar, mostra clientes que já existem ----------
  var CAMPO_TEL={fNome:'fTel',envNome:'envTel'};
  document.addEventListener('input',function(e){var t=e.target;if(t&&CAMPO_TEL[t.id])sugerir(t)});
  function sugerir(inp){
    var box=document.getElementById('sug-'+inp.id);
    if(!box){box=document.createElement('div');box.className='sug';box.id='sug-'+inp.id;box.setAttribute('role','listbox');inp.insertAdjacentElement('afterend',box)}
    var v=semAcento(inp.value.trim());
    var l=v.length<2||!clientes?[]:clientes.filter(function(x){var n=semAcento(x.nome);return n.indexOf(v)>=0&&n!==v}).slice(0,5);
    box.hidden=!l.length;
    box.innerHTML=l.map(function(x){return '<button type="button" role="option" data-sug="'+esc(x.chave)+'" data-para="'+inp.id+'">'+esc(x.nome)+'<small>'+(x.telefone?esc(fmtTel(x.telefone)):'sem WhatsApp')+'</small></button>'}).join('');
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-sug]');if(!b)return;
    var x=cliPorChave(b.getAttribute('data-sug')),id=b.getAttribute('data-para'),inp=$(id),tel=$(CAMPO_TEL[id]);if(!x||!inp)return;
    inp.value=x.nome;if(tel&&x.telefone)tel.value=fmtTel(x.telefone);
    var box=$('sug-'+id);if(box)box.hidden=true;
    if(id==='envNome')desenharEnvio();
    (tel||inp).focus();
  });
  // horários livres que o site também mostra (mais de 1 h à frente), respeitando a estreia do serviço
  function proximosLivres(servNome,n){var sv=listaServ().filter(function(s){return s.nome===servNome})[0],desde=sv&&sv.desde,lim=limiteTxt();
    var dur=duracaoDe(servNome),l=rows.filter(function(r){return r.status==='livre'&&(r.data+' '+r.hora)>lim&&(!desde||r.data>=desde)&&cabeEm(r,dur)});
    // de preferência em dias diferentes, para ela ter escolha de verdade
    var out=[],dias={};l.forEach(function(r){if(out.length<n&&!dias[r.data]){out.push(r);dias[r.data]=1}});
    l.forEach(function(r){if(out.length<n&&out.indexOf(r)<0)out.push(r)});
    return out.sort(function(a,b){return (a.data+a.hora)<(b.data+b.hora)?-1:1})}
  // convite para voltar: pessoal, com um motivo de verdade e dois horários prontos para escolher
  function conviteVolta(x){
    var n=primeiro(x.nome),d=diasDesde(x.ultima),sv=x.ultimo_servico||'',s=semAcento(sv);
    var motivo=s.indexOf('auriculo')>=0?'Já faz '+d+' dias da sua última sessão de auriculoterapia. Com o tempo o efeito das sementes vai passando, e é a constância que mantém as dores, a ansiedade e o sono sob controle.':
      s.indexOf('limpeza')>=0?'Já faz '+d+' dias da sua limpeza de pele. A pele se renova mais ou menos a cada 4 semanas, então agora é o momento ideal para a próxima: o resultado dura muito mais quando a gente mantém o cuidado.':
      'Já faz '+d+' dias do seu último atendimento e lembrei de você.';
    var l=proximosLivres(sv,2);
    var op=l.length?'Separei '+(l.length>1?'dois horários':'um horário')+' para você:\n'+l.map(function(r,i){return (l.length>1?(i+1)+') ':'')+cap(semana(r.data))+', '+curta(r.data)+' às '+hh(r.hora)}).join('\n')+
      '\n\nÉ só responder '+(l.length>1?'1 ou 2':'"quero"')+' que eu já reservo.':'Qual dia fica bom para você nas próximas semanas? Me responde aqui que eu encaixo você.';
    return 'Oi, '+n+'! Aqui é a Amanda 🌿\n\n'+motivo+'\n\n'+op+'\n\nE lembra: indicando uma amiga que fechar um procedimento, você ganha 1 sessão de auriculoterapia. Te espero!';
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
    if(!l.length){el.innerHTML='<p class="vazio">'+(cliFiltro==='sumidas'&&!b?'Nenhuma cliente há mais de '+DIAS_SEM_VIR+' dias sem vir. Ótimo sinal!':b?'Nenhuma cliente encontrada.':'As clientes aparecem aqui assim que marcarem o primeiro horário.')+'</p>';return}
    el.innerHTML=l.map(function(x){
      var prox=x.proxima?String(x.proxima).replace('T',' '):'',pd=prox.slice(0,10),ph=prox.slice(11,16);
      var sumiu=sumida(x),z=zapCliente(x,sumiu);
      return '<div class="card cli"><div class="cli-t"><b>'+esc(x.nome)+'</b>'+(x.atendimentos?'':'<span class="tag nov">Cliente nova</span>')+'</div>'+
        '<div class="cli-d">'+(x.telefone?esc(fmtTel(x.telefone)):'Sem WhatsApp')+(x.servicos&&x.servicos.length?' · '+esc(x.servicos.join(', ')):'')+'</div>'+
        '<div class="cli-n"><div><b>'+x.atendimentos+'</b>'+(x.atendimentos===1?'atendimento':'atendimentos')+'</div>'+
          '<div><b>'+(x.ultima?esc(curta(x.ultima)):'—')+'</b>última vez'+(x.ultima?' ('+(diasDesde(x.ultima)===0?'hoje':'há '+diasDesde(x.ultima)+' dia'+(diasDesde(x.ultima)===1?'':'s'))+')':'')+'</div>'+
          '<div><b>'+(prox?esc(curta(pd)):'—')+'</b>'+(prox?'próximo, '+esc(hh(ph)):'sem horário marcado')+'</div></div>'+
        (sumiu?'<div class="cli-volta">Faz '+diasDesde(x.ultima)+' dias que ela não vem. Que tal chamar?</div>':'')+
        (x.obs?'<div class="cli-obs">'+esc(x.obs)+'</div>':'')+
        '<div class="row">'+(z?'<a class="btn zap-leve" target="_blank" rel="noopener" href="'+esc(z)+'">'+(sumiu?'Convidar a voltar':'WhatsApp')+'</a>':'<span></span>')+
        '<button class="btn ghost" type="button" data-acao="cli-obs" data-chave="'+esc(x.chave)+'">'+(x.obs?'Editar anotação':'Anotar')+'</button></div></div>'}).join('');
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
    api('POST','rpc/salvar_cliente',{p_chave:k,p_obs:t}).then(function(ok){if(!ok){toast('Não deu certo. Tente de novo.',true);return}
      var x=cliPorChave(k);if(x)x.obs=t.trim()||null;fecharEnvio();desenharClientes();toast('Anotação salva.')},falha).then(function(){b.disabled=false})}

  desenharHoras();
  $('novaData').min=hojeSP();
  mostrar();
})();
