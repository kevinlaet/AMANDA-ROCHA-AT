// Página do Kevin: recebe as sugestões que a Amanda (e as profissionais do Studio) mandam pelo painel.
// Só entra quem estiver em public.desenvolvedor (o e-mail é configurado no Supabase, nunca no código).
(function(){
  var C=window.SUPABASE||{},$=function(i){return document.getElementById(i)};
  var CHAVE='kevin-sugestoes-sess',DIA=24*3600*1000,sess=null,dados=null,filtro='nova',ocupado=false,tTimer;
  var ST={nova:'Nova',andamento:'Em andamento',feita:'Feita ✓'};
  function esc(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function toast(t,erro){var x=$('toast');x.textContent=t;x.className='toast'+(erro?' erro':'');x.hidden=false;clearTimeout(tTimer);tTimer=setTimeout(function(){x.hidden=true},erro?8000:4000)}
  function salvar(s){sess=s;try{s?localStorage.setItem(CHAVE,JSON.stringify(s)):localStorage.removeItem(CHAVE)}catch(e){}}
  try{sess=JSON.parse(localStorage.getItem(CHAVE)||'null')}catch(e){}
  function auth(caminho,corpo){
    return fetch(C.url+'/auth/v1/'+caminho,{method:'POST',headers:{apikey:C.anonKey,'Content-Type':'application/json'},body:JSON.stringify(corpo)})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok){var e=new Error('auth');e.status=r.status;throw e}return j})},function(){var e=new Error('rede');e.rede=true;throw e});
  }
  function paraSessao(j,novo){return {token:j.access_token,refresh:j.refresh_token,exp:Date.now()+(j.expires_in||3600)*1000-120000,inicio:novo||!sess?Date.now():sess.inicio}}
  var renovando=null;
  function token(){
    if(!sess)return Promise.reject('sessao');
    if(Date.now()-(sess.inicio||0)>DIA){salvar(null);mostrar('Por segurança, a senha é pedida uma vez por dia. Entre de novo.');return Promise.reject('sessao')}
    if(Date.now()<sess.exp)return Promise.resolve(sess.token);
    if(!renovando)renovando=auth('token?grant_type=refresh_token',{refresh_token:sess.refresh}).then(function(j){salvar(paraSessao(j));return sess.token},function(e){if(e.rede)throw 'rede';salvar(null);throw 'sessao'})
      .then(function(t){renovando=null;return t},function(e){renovando=null;throw e});
    return renovando;
  }
  function rpc(fn,corpo){
    return token().then(function(t){return fetch(C.url+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:C.anonKey,Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(corpo||{})}).catch(function(){throw 'rede'})})
      .then(function(r){if(r.status===401){salvar(null);mostrar('Sua sessão expirou. Entre de novo.');throw 'sessao'}if(r.status===404)throw 'ausente';if(!r.ok)throw 'erro';return r.text().then(function(t){return t?JSON.parse(t):null})});
  }
  function mostrar(msg){var on=!!sess;$('vLogin').hidden=on;$('vApp').hidden=!on;var m=$('mLogin');m.textContent=msg||'';m.hidden=!msg;if(on)carregar()}
  $('fLogin').onsubmit=function(e){
    e.preventDefault();var em=$('email').value.trim().toLowerCase(),se=$('senha').value,b=$('bLogin');
    if(!em||!se){mostrar('Preencha o e-mail e a senha.');return}
    b.disabled=true;b.textContent='Entrando…';
    auth('token?grant_type=password',{email:em,password:se}).then(function(j){salvar(paraSessao(j,true));return rpc('sou_dev')}).then(function(ok){
      if(ok!==true){sair('Este e-mail ainda não está configurado para ver as sugestões.');return}
      $('senha').value='';mostrar();
    },function(err){salvar(null);mostrar(err&&err.rede||err==='rede'?'Sem conexão. Tente de novo.':err==='ausente'?'Falta rodar a atualização do banco (supabase/atualizacao.sql).':err&&err.status===400?'E-mail ou senha incorretos.':'Não consegui entrar agora. Tente de novo.')})
    .then(function(){b.disabled=false;b.textContent='Entrar'});
  };
  function sair(msg){var s0=sess;salvar(null);if(s0)fetch(C.url+'/auth/v1/logout',{method:'POST',headers:{apikey:C.anonKey,Authorization:'Bearer '+s0.token}}).catch(function(){});dados=null;mostrar(msg)}
  $('bSair').onclick=function(){sair()};
  function quando(iso){var d=new Date(iso);if(isNaN(d))return '';return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'America/Sao_Paulo'})+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})}
  function carregar(){
    return rpc('sugestoes_dev').then(function(j){if(!j){sair('Este e-mail não tem acesso às sugestões.');return}dados=j;desenhar()},
      function(e){if(e==='sessao')return;$('lista').innerHTML='<p class="vazio">'+(e==='ausente'?'Falta rodar a atualização do banco (supabase/atualizacao.sql).':'Não consegui carregar agora. Confira a internet.')+'</p>'});
  }
  function desenhar(){
    var d=dados;document.title=(d.novas?'('+d.novas+') ':'')+'Sugestões do app';
    $('resumo').innerHTML='<div class="novas"><b>'+d.novas+'</b><span>'+(d.novas===1?'nova':'novas')+'</span></div><div><b>'+d.andamento+'</b><span>em andamento</span></div><div><b>'+d.feitas+'</b><span>'+(d.feitas===1?'feita':'feitas')+'</span></div>';
    [].forEach.call(document.querySelectorAll('[data-f]'),function(b){b.setAttribute('aria-pressed',b.getAttribute('data-f')===filtro)});
    var l=d.lista.filter(function(x){return filtro==='todas'||x.status===filtro});
    $('lista').innerHTML=l.length?l.map(function(x){
      var id=esc(x.id),bt=function(st,txt,cls){return x.status===st?'':'<button class="btn '+(cls||'ghost')+'" type="button" data-st="'+st+'" data-id="'+id+'">'+txt+'</button>'};
      return '<div class="it '+esc(x.status)+'"><div class="it-t"><div><b>'+esc(x.quem)+'</b><span>'+esc(quando(x.criado_em))+'</span></div><em class="st '+esc(x.status)+'">'+esc(ST[x.status]||x.status)+'</em></div>'+
        '<p>'+esc(x.texto)+'</p>'+(x.tem_foto?'<div data-foto-box="'+id+'"><button class="ver" type="button" data-foto="'+id+'">📷 Ver foto</button></div>':'')+
        '<div class="acoes">'+bt('andamento','Em andamento')+bt('feita','Feita ✓','main')+bt('nova','Voltar para nova')+'</div></div>'}).join(''):
      '<p class="vazio">'+(filtro==='nova'?'Nenhuma sugestão nova. Tudo em dia ✨':'Nada por aqui.')+'</p>';
    $('avisos').innerHTML=d.avisos?'<p>A cada sugestão nova, chega um e-mail no endereço configurado no Supabase.</p><p>Para receber também no celular, instale o app <b>ntfy</b> e assine o tópico <code>'+esc(d.topico)+'</code>.</p><button class="btn ghost" type="button" id="bTeste">Mandar um aviso de teste</button>':
      '<p>Os avisos automáticos ainda não estão ligados no Supabase (extensão pg_net). As sugestões continuam chegando aqui.</p>';
  }
  document.addEventListener('click',function(e){
    var f=e.target.closest('[data-f]');if(f){filtro=f.getAttribute('data-f');if(dados)desenhar();return}
    var s=e.target.closest('[data-st]');if(s&&!ocupado){ocupado=true;s.disabled=true;
      rpc('marcar_sugestao',{p_id:s.getAttribute('data-id'),p_status:s.getAttribute('data-st')}).then(function(j){if(!j||j.r!=='ok'){toast('Não deu certo. Tente de novo.',true);return}toast('Pronto: '+ST[s.getAttribute('data-st')]+'.');return carregar()},function(er){if(er!=='sessao')toast('Não deu certo. Confira a internet.',true)})
        .then(function(){ocupado=false});return}
    var v=e.target.closest('[data-foto]');if(v){v.disabled=true;var id=v.getAttribute('data-foto');
      rpc('foto_sugestao',{p_id:id}).then(function(u){if(!u||String(u).indexOf('data:image/')!==0){toast('Não consegui abrir a foto.',true);v.disabled=false;return}
        var box=document.querySelector('[data-foto-box="'+id+'"]');box.innerHTML='<img alt="Foto da sugestão" src="'+esc(u)+'">'},function(){toast('Não consegui abrir a foto.',true);v.disabled=false});return}
    if(e.target.id==='bTeste'){var b=e.target;b.disabled=true;rpc('testar_aviso_dev').then(function(j){toast(j&&j.r==='ok'?'Aviso de teste enviado. Confira o e-mail (e o ntfy).':'Não consegui mandar o teste agora.',!(j&&j.r==='ok'))},function(){toast('Não consegui mandar o teste agora.',true)}).then(function(){b.disabled=false})}
  });
  setInterval(function(){if(sess&&!document.hidden&&!ocupado)carregar()},60000);
  document.addEventListener('visibilitychange',function(){if(sess&&!document.hidden)carregar()});
  mostrar();
})();
