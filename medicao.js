// Medição de visitas com o Google Analytics 4, só com a permissão da visitante (LGPD).
// Sem o código em config.js (window.MEDICAO.googleAnalytics), nada é carregado e o aviso não aparece.
// Nada vai para o Google antes de "Aceitar". A escolha fica guardada no aparelho por 1 ano;
// "Recusar" desliga a medição e apaga os cookies do Google. O link "Cookies" do rodapé reabre o aviso.
// Os QR codes dos impressos trazem ?o=cartao, ?o=cartaz... e isso vira a origem da visita.
// Nome e telefone da cliente nunca vão para o Google: o endereço enviado leva só a página e a origem.
(function(){
  var ID=String((window.MEDICAO||{}).googleAnalytics||'').trim();
  if(!/^G-[A-Z0-9]{4,16}$/.test(ID))return;
  var CHAVE='amanda-cookies',ANO=365*864e5,IMPRESSOS=['cartao','cartaz','espelho','sandra'];
  var RAIZ=((document.currentScript||{}).src||location.href).replace(/[^/]*([?#].*)?$/,'');
  var ligado=false,caixa=null;

  function ler(){try{var v=JSON.parse(localStorage.getItem(CHAVE));if(v&&/^(sim|nao)$/.test(v.escolha)&&Date.now()-v.em<ANO)return v.escolha}catch(e){}return ''}
  function guardar(e){try{localStorage.setItem(CHAVE,JSON.stringify({escolha:e,em:Date.now()}))}catch(x){}}

  window.dataLayer=window.dataLayer||[];
  function gtag(){window.dataLayer.push(arguments)}
  // só a página e a origem: os parâmetros do link (nome da cliente, dias, serviço) ficam de fora
  function endereco(){
    var q=new URLSearchParams(location.search),u=new URL(location.pathname,location.origin),o=(q.get('o')||'').toLowerCase();
    ['utm_source','utm_medium','utm_campaign','utm_content'].forEach(function(k){var v=q.get(k);if(v)u.searchParams.set(k,v.slice(0,60))});
    if(/^[a-z0-9-]{2,20}$/.test(o)&&!u.searchParams.has('utm_source')){u.searchParams.set('utm_source',o);u.searchParams.set('utm_medium',IMPRESSOS.indexOf(o)>=0?'qr':'link')}
    return u.href}
  function ligar(){
    window['ga-disable-'+ID]=false;
    if(ligado){gtag('consent','update',{analytics_storage:'granted'});return}
    ligado=true;
    gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    gtag('js',new Date());
    gtag('config',ID,{page_location:endereco(),allow_google_signals:false,allow_ad_personalization_signals:false,cookie_expires:31536000});
    var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ID);document.head.appendChild(s)}
  function desligar(){
    window['ga-disable-'+ID]=true;
    if(ligado)gtag('consent','update',{analytics_storage:'denied'});
    // apaga os cookies do Google Analytics (_ga e _ga_XXXX)
    document.cookie.split(';').forEach(function(c){var n=c.split('=')[0].trim();
      if(/^_ga/.test(n))['','; domain='+location.hostname,'; domain=.'+location.hostname].forEach(function(d){document.cookie=n+'=; Max-Age=0; path=/'+d})})}
  // o site chama window.medir('agendamento', {...}) quando a cliente pede um horário
  window.medir=function(nome,params){if(ligado&&!window['ga-disable-'+ID])gtag('event',nome,params||{})};

  var CSS='.ck{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9999;max-width:520px;margin:0 auto;background:#FFF8F1;color:#16302C;border:1px solid #E7D6C6;border-radius:18px;box-shadow:0 12px 40px rgba(5,63,58,.25);padding:14px 16px;font:14px/1.5 Montserrat,system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left}'+
    '.ck[hidden]{display:none}.ck p{margin:0}.ck b{color:#053F3A;margin-right:4px}.ck a{color:#0B5F59;font-weight:700}'+
    '.ck .ck-agora{margin-top:6px;font-size:13px;color:#55706B}.ck-b{display:flex;gap:10px;margin-top:12px}'+
    '.ck-b button{flex:1;min-height:46px;border-radius:12px;border:2px solid #0B5F59;font-family:inherit;font-weight:700;font-size:15px;cursor:pointer}'+
    '.ck-b [data-ck=nao]{background:#fff;color:#0B5F59}.ck-b [data-ck=sim]{background:#0B5F59;color:#fff}'+
    '.ck-b button:focus-visible{outline:3px solid #F5C59D;outline-offset:2px}';
  function aviso(){
    if(!caixa){
      var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
      caixa=document.createElement('div');caixa.className='ck';caixa.setAttribute('role','region');caixa.setAttribute('aria-label','Aviso de cookies');
      caixa.innerHTML='<p><b>Cookies</b>Posso usar cookies do Google Analytics para contar as visitas e saber como você chegou aqui? Não uso para propaganda. <a href="'+RAIZ+'regras/#cookies">Saiba mais</a></p>'+
        '<p class="ck-agora" hidden></p><div class="ck-b"><button type="button" data-ck="nao">Recusar</button><button type="button" data-ck="sim">Aceitar</button></div>';
      caixa.addEventListener('click',function(e){var b=e.target.closest('[data-ck]');if(!b)return;
        var v=b.getAttribute('data-ck');guardar(v);caixa.hidden=true;if(v==='sim')ligar();else desligar()});
      document.body.appendChild(caixa)}
    var atual=ler(),ag=caixa.querySelector('.ck-agora');
    ag.hidden=!atual;ag.textContent=atual==='sim'?'Hoje: cookies aceitos.':atual==='nao'?'Hoje: cookies recusados.':'';
    caixa.hidden=false}

  // link "Cookies" do rodapé: aparece só com a medição ligada e reabre o aviso
  [].forEach.call(document.querySelectorAll('[data-cookies]'),function(el){el.hidden=false});
  document.addEventListener('click',function(e){
    var c=e.target.closest('a[data-cookies],[data-cookies] a');
    if(c){e.preventDefault();aviso();return}
    if(!ligado)return;
    var a=e.target.closest('a[href]');if(!a)return;
    var onde=(a.closest('[id]')||{}).id||'pagina';
    if(/^https:\/\/wa\.me\//.test(a.href))window.medir('contato_whatsapp',{local:onde.slice(0,40)});
    else if(/instagram\.com\//.test(a.href))window.medir('abrir_instagram',{local:onde.slice(0,40)})},true);

  var escolha=ler();
  if(escolha==='sim')ligar();
  else if(!escolha)aviso();
})();
