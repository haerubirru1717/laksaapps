const BANKS = {
  // ── Bank Pemerintah ──
  bri:       {color:'#00529c',c2:'#003d7a',domain:'www.bri.co.id'},
  bni:       {color:'#005e6a',c2:'#f15a23',domain:'www.bni.co.id'},
  bca:       {color:'#0060af',c2:'#004d8c',domain:'www.bca.co.id'},
  mandiri:   {color:'#003d77',c2:'#002d58',domain:'www.bankmandiri.co.id'},
  btn:       {color:'#0069ab',c2:'#005289',domain:'www.btn.co.id'},
  bsi:       {color:'#00A39D',c2:'#F8AD3C',domain:'www.bankbsi.co.id'},

  // ── Bank Syariah ──
  bcasyariah:{color:'#0060af',c2:'#004d8c',domain:'www.bcasyariah.co.id'},
  btnsyariah:{color:'#0069ac',c2:'#00528a',domain:'www.btn.co.id'},
  btpnsyariah:{color:'#E30613',c2:'#b80510',domain:'www.btpnsyariah.com'},
  bukopinsyariah:{color:'#f5c400',c2:'#c49d00',domain:'www.kbbanksyariah.co.id'},
  danamonsyariah:{color:'#046148',c2:'#034f39',domain:'www.danamon.co.id'},
  cimbniagasyariah:{color:'#C00000',c2:'#960000',domain:'www.cimbniaga.co.id'},
  megasyariah:{color:'#E31E24',c2:'#b5181d',domain:'www.bms.co.id'},
  muamalat:  {color:'#5b2d8e',c2:'#7DC242',domain:'www.bankmuamalat.co.id'},
  nanobanksyariah:{color:'#002657',c2:'#001e42',domain:'www.nanobank.co.id'},
  ntbsyariah:{color:'#006B3F',c2:'#00552f',domain:'www.bankntbsyariah.co.id'},
  panindubaisyariah:{color:'#005AB2',c2:'#00478c',domain:'www.banksyariah.co.id'},
  sinarmassyariah:{color:'#0070B8',c2:'#005a93',domain:'www.sinarmassyariah.co.id'},
  victoriasyariah:{color:'#003087',c2:'#00256b',domain:'www.bankvictoriasyariah.co.id'},

  // ── Bank Swasta Nasional ──
  bukopin:   {color:'#f5c400',c2:'#c49d00',domain:'www.kbbank.id'},
  danamon:   {color:'#046148',c2:'#034f39',domain:'www.danamon.co.id'},
  cimbniaga: {color:'#C00000',c2:'#960000',domain:'www.cimbniaga.co.id'},
  paninbank: {color:'#005AB2',c2:'#00478c',domain:'www.panin.co.id'},
  permatabank:{color:'#1565C0',c2:'#1044a0',domain:'www.permatabank.com'},
  maybank:   {color:'#FFCC00',c2:'#e6b800',domain:'www.maybank.co.id'},
  mega:      {color:'#E31E24',c2:'#b5181d',domain:'www.bankmega.com'},
  sinarmas:  {color:'#0070B8',c2:'#005a93',domain:'www.banksinarmas.com'},
  ocbcnisp:  {color:'#E31E24',c2:'#b80510',domain:'www.ocbcnisp.com'},
  maspion:   {color:'#003580',c2:'#002860',domain:'www.bankmaspion.co.id'},
  mestika:   {color:'#C8102E',c2:'#a00d25',domain:'www.bankmestika.co.id'},
  nagari:    {color:'#1A5276',c2:'#154360',domain:'www.banknagari.co.id'},
  nobubank:  {color:'#002D72',c2:'#002460',domain:'www.nobubank.com'},
  mncbank:   {color:'#003087',c2:'#00256b',domain:'www.mncbank.co.id'},
  victoria:  {color:'#003087',c2:'#00256b',domain:'www.victoriabank.co.id'},
  capital:   {color:'#002D72',c2:'#002460',domain:'www.bankCapital.co.id'},
  primabank: {color:'#003087',c2:'#00256b',domain:'www.bankprima.co.id'},
  ina:       {color:'#292567',c2:'#1e1c52',domain:'www.bankina.co.id'},
  indexselindo:{color:'#003580',c2:'#002860',domain:'www.bankindex.co.id'},
  bumiartha: {color:'#234089',c2:'#1a3170',domain:'www.bumiartha.co.id'},
  bws:       {color:'#003580',c2:'#002860',domain:'www.bankws.co.id'},
  ntt:       {color:'#003580',c2:'#002860',domain:'www.bankntt.co.id'},
  sultra:    {color:'#003580',c2:'#002860',domain:'www.banksultra.co.id'},
  sumsel:    {color:'#003580',c2:'#002860',domain:'www.banksumselbabel.co.id'},
  sumut:     {color:'#003580',c2:'#002860',domain:'www.banksumut.co.id'},
  ganesha:   {color:'#003580',c2:'#002860',domain:'www.bankganesha.co.id'},
  regionalbank:{color:'#003580',c2:'#002860',domain:'www.regionalbank.co.id'},
  privatebank:{color:'#003580',c2:'#002860',domain:'www.privatbank.co.id'},
  sahabatsampoerna:{color:'#003D88',c2:'#002d68',domain:'www.banksahabat.com'},
  dki:       {color:'#1A5276',c2:'#154360',domain:'www.bankdki.co.id'},
  jakarta:   {color:'#1A5276',c2:'#154360',domain:'www.bankjakarta.co.id'},
  mas:       {color:'#003580',c2:'#002860',domain:'www.bankmas.co.id'},
  jago:      {color:'#F05A28',c2:'#c04820',domain:'www.jago.com'},
  raya:      {color:'#00549A',c2:'#00437b',domain:'www.bankraya.co.id'},
  neo:       {color:'#ff9f00',c2:'#cc7f00',domain:'www.neo.co.id'},
  hibank:    {color:'#005E6A',c2:'#004b54',domain:'www.hibank.co.id'},
  superbank: {color:'#C0FF00',c2:'#9acc00',domain:'www.superbank.id'},
  saqu:      {color:'#fdd835',c2:'#cab020',domain:'www.saqu.com'},
  salutgo:   {color:'#00A86B',c2:'#008556',domain:'www.salutgo.id'},
  okbank:    {color:'#004B87',c2:'#003a6b',domain:'www.okbank.id'},
  blu:       {color:'#00C1F8',c2:'#009acc',domain:'www.blubybcadigital.id'},
  bcadigital:{color:'#005EB8',c2:'#004a9e',domain:'www.blubybcadigital.id'},
  linebank:  {color:'#00C300',c2:'#009a00',domain:'www.linebank.co.id'},
  krombank:  {color:'#6A36D3',c2:'#542ba8',domain:'www.krom.id'},
  aladin:    {color:'#0a71af',c2:'#085a8c',domain:'aladinbank.id'},
  seabank:   {color:'#EE4D2D',c2:'#bf3e24',domain:'www.seabank.co.id'},

  // ── Bank Asing ──
  hsbc:      {color:'#DB0011',c2:'#b0000e',domain:'www.hsbc.co.id'},
  ccbindonesia:{color:'#b30738',c2:'#8f062d',domain:'www.ccb.co.id'},
  chinaconstructionbankindonesia:{color:'#b30738',c2:'#8f062d',domain:'www.ccb.co.id'},
  citibank:  {color:'#1c4882',c2:'#163868',domain:'www.citibank.co.id'},
  dbs:       {color:'#DA1710',c2:'#ae120d',domain:'www.dbs.com'},
  maybank2:  {color:'#FFCC00',c2:'#e6b800',domain:'www.maybank.co.id'},
  anz:       {color:'#007DBA',c2:'#005f9a',domain:'www.anz.co.id'},
  commonwealthbank:{color:'#F0A500',c2:'#c08400',domain:'www.commbank.co.id'},
  deutschebank:{color:'#0018a8',c2:'#001487',domain:'www.db.com'},
  hanabank:  {color:'#009E60',c2:'#007d4d',domain:'www.koreaexim.or.id'},
  ibkbank:   {color:'#003580',c2:'#002860',domain:'www.ibkbank.co.id'},
  icbc:      {color:'#B30014',c2:'#8c0010',domain:'www.icbc.co.id'},
  ingbank:   {color:'#ff6600',c2:'#cc5200',domain:'www.ing.co.id'},
  jtrustbank:{color:'#003087',c2:'#00256b',domain:'www.jtrustbank.co.id'},
  mizuho:    {color:'#003087',c2:'#00256b',domain:'www.mizuhobank.co.id'},
  mufg:      {color:'#E60012',c2:'#b8000e',domain:'www.mufg.jp'},
  bnpparibas:{color:'#009C77',c2:'#007a5f',domain:'www.bnpparibas.co.id'},
  shinhanbank:{color:'#E31E24',c2:'#b5181d',domain:'www.shinhanbank.co.id'},
  smbcindonesia:{color:'#134939',c2:'#0e3a2c',domain:'www.smbc.co.id'},
  ctbcbank:  {color:'#107c79',c2:'#0d6360',domain:'www.ctbcbank.co.id'},
  bangkokbank:{color:'#1f4396',c2:'#172f73',domain:'www.bangkokbank.co.id'},
  creditsuisse:{color:'#183964',c2:'#122c4e',domain:'www.credit-suisse.com'},
  ofamerica: {color:'#EE2A24',c2:'#bf221d',domain:'bankofamerica.co.id'},
  ofchina:   {color:'#B30738',c2:'#8f062d',domain:'bankofchina.co.id'},
  ofindia:   {color:'#EE7A00',c2:'#bf6200',domain:'boiindonesia.co.id'},
  oub:       {color:'#E1091D',c2:'#b40717',domain:'www.uob.co.id'},
  sbi:       {color:'#292075',c2:'#1f185a',domain:'www.sbiindo.com'},
  resona:    {color:'#009E5E',c2:'#007e4b',domain:'resona.co.id'},
  standartcartered:{color:'#38d200',c2:'#0473ea',domain:'sc.co.id'},
  jpmorganchaseandco:{color:'#003087',c2:'#00256b',domain:'jpmorgan.co.id'},
  arthagrahainternasional:{color:'#A28548',c2:'#826a3a',domain:'arthagraha.co.id'},
  allobank:  {color:'#1A1A1A',c2:'#0d0d0d',domain:'allobank.com'},

  // ── E-Wallet & Digital Payment ──
  jenius:    {color:'#2B5592',c2:'#1d3d70',domain:'jenius.com'},
  gopay:     {color:'#00ACEA',c2:'#008bbf',domain:'gopay.co.id'},
  ovo:       {color:'#6231A0',c2:'#4e2680',domain:'ovo.id'},
  dana:      {color:'#118EEA',c2:'#0d72c0',domain:'dana.id'},
  shopeepay: {color:'#EE4D2D',c2:'#c93b1e',domain:'shopee.co.id'},
  shopee:    {color:'#EE4D2D',c2:'#c93b1e',domain:'shopee.co.id',slug:'shopeepay'},

  // ── Kas/Tunai ──
  tunai:     {color:'#34d399',c2:'#10b981',domain:null},
  cash:      {color:'#34d399',c2:'#10b981',domain:null},
  dompet:    {color:'#5c6ac4',c2:'#4355b9',domain:null,isWallet:true},
  kas:       {color:'#d4920a',c2:'#a87200',domain:null}
};

// ── DAFTAR SEMUA FILE SVG ──
const SVG_FILES = [
  'aladin','allobank','anz','arthagrahainternasional','bangkokbank',
  'bca','bcadigital','bcasyariah','blu','bni','bnpparibas','bri','bsi',
  'btn','btnsyariah','btpnsyariah','bukopin','bukopinsyariah','bumiartha',
  'bws','capital','ccbindonesia','chinaconstructionbankindonesia',
  'cimbniaga','cimbniagasyariah','citibank','commonwealthbank','creditsuisse',
  'ctbcbank','danamon','danamonsyariah','dbs','deutschebank','dki',
  'ganesha','hanabank','hibank','hsbc','ibkbank','icbc','ina','indexselindo',
  'ingbank','jago','jakarta','jenius','jpmorganchaseandco',
  'jtrustbank','krombank','linebank','mandiri','mas','maspion','maybank',
  'mega','megasyariah','mestika','mizuho','mncbank','muamalat','mufg',
  'nagari','nanobanksyariah','neo','nobubank','ntbsyariah','ntt','ocbcnisp',
  'ofamerica','ofchina','ofindia','okbank','oub','paninbank',
  'panindubaisyariah','permatabank','primabank','privatebank','raya',
  'regionalbank','resona','sahabatsampoerna','salutgo','saqu','sbi','seabank',
  'shinhanbank','sinarmas','sinarmassyariah','smbcindonesia','standartcartered',
  'sultra','sumsel','sumut','superbank','victoria','victoriasyariah'
];

// ── LOGO SYSTEM ──
// Strategi deteksi globe: Google selalu mengembalikan 200 OK + PNG 16x16
// saat favicon tidak ditemukan. Favicon asli selalu > 16px.

function _showInit(img, fbClass) {
  img.style.display = 'none';
  const fb = img.nextElementSibling;
  if (fb && fb.classList.contains(fbClass)) fb.style.display = 'flex';
}

// Dipanggil saat gambar berhasil load
window._logoLoad = function(img) {
  const fbClass = img.dataset.fbClass;
  const state = img.dataset.state || 'init';
  const useFav = img.dataset.faviconMode === 'true';

  // Saat loading favicon (detail=init, dashboard=fav), cek apakah globe (16x16)
  const loadingFav = (useFav && state === 'init') || (!useFav && state === 'fav');
  if (loadingFav && img.naturalWidth <= 16) {
    // Globe Google terdeteksi → coba SVG
    const svgSrc = img.dataset.svgFallback;
    if (useFav && svgSrc) {
      img.dataset.state = 'svg';
      img.src = svgSrc;
    } else {
      _showInit(img, fbClass);
    }
  }
  // Gambar valid → tampilkan otomatis (browser default behavior)
};

// Dipanggil saat gambar gagal load (file tidak ada / HTTP error)
window._logoErr = function(img) {
  const fbClass = img.dataset.fbClass;
  const state = img.dataset.state || 'init';
  const useFav = img.dataset.faviconMode === 'true';

  if (state === 'init') {
    if (useFav) {
      // Detail mode: favicon HTTP error → coba SVG
      const svgSrc = img.dataset.svgFallback;
      if (svgSrc) { img.dataset.state = 'svg'; img.src = svgSrc; return; }
    } else {
      // Dashboard mode: SVG tidak ada → coba favicon
      const favUrl = img.dataset.fav;
      if (favUrl) { img.dataset.state = 'fav'; img.src = favUrl; return; }
    }
  }
  // Semua opsi habis → inisial teks
  _showInit(img, fbClass);
};

// ── FUNGSI DETEKSI BANK ──
const detBank = (name) => {
  let n = (name || '').toLowerCase().trim();

  // 1. Alias untuk nama resmi/panjang yang berbeda jauh dari nama file
  const aliases = {
    'central asia syariah':'bcasyariah','central asia':'bca',
    'rakyat indonesia':'bri','negara indonesia':'bni',
    'syariah indonesia':'bsi','tabungan negara syariah':'btnsyariah',
    'tabungan negara':'btn','go-pay':'gopay','neo commerce':'neo',
    'artha bumi':'bumiartha','bumi artha':'bumiartha',
    'artha graha':'arthagrahainternasional',
    'china construction':'chinaconstructionbankindonesia',
    'jpmorgan':'jpmorganchaseandco','standard chartered':'standartcartered',
    'panin dubai syariah':'panindubaisyariah'
  };
  let forcedSlug = null, aLen = 0;
  for (let a in aliases) {
    if (n.includes(a) && a.length > aLen) { forcedSlug = aliases[a]; aLen = a.length; }
  }

  // 2. Bersihkan nama (hapus kata "bank", spasi, karakter khusus)
  const nClean = n.replace(/\bbank\b/gi, '').trim().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

  if (forcedSlug) {
    const b = BANKS[forcedSlug] || { color: null, c2: null, domain: forcedSlug + '.co.id' };
    return { ...b, slug: forcedSlug };
  }

  // 3. Cari di BANKS database (exact + partial match, syariah-safe)
  let best = null, bestLen = 0, bestK = null;
  const isSyariah = nClean.includes('syariah');
  for (const [k, b] of Object.entries(BANKS)) {
    const kClean = k.replace(/\bbank\b/g, '').replace(/[^a-z0-9]/g, '');
    if (!kClean) continue;
    const kHasSyariah = kClean.includes('syariah');
    const exact = (nClean === kClean);
    const partial = nClean.includes(kClean) && (isSyariah === kHasSyariah);
    if ((exact || partial) && kClean.length > bestLen) {
      best = b; bestLen = kClean.length; bestK = kClean;
    }
  }
  if (best) return { ...best, slug: best.slug || bestK };

  // 4. Auto-match: cari file SVG terbaik dari daftar file yang tersedia
  let bestFile = null, bestScore = 0;
  for (const f of SVG_FILES) {
    let score = 0;
    const fStrip = f.replace(/bank/g, '');
    if (nClean === f || nClean === fStrip) { score = 10000; }
    else if ((f.includes(nClean) || fStrip.includes(nClean)) && nClean.length >= 3) { score = 5000 + nClean.length; }
    else if ((nClean.includes(f) || nClean.includes(fStrip)) && f.length >= 3 && fStrip.length >= 3) {
      const fSy = f.includes('syariah');
      if (isSyariah === fSy) score = 3000 + f.length;
    }
    if (score > bestScore) { bestScore = score; bestFile = f; }
  }
  if (bestFile && bestScore >= 3000) {
    const b = BANKS[bestFile] || { color: null, c2: null, domain: bestFile + '.co.id' };
    return { ...b, slug: bestFile };
  }

  // 5. Dompet/wallet detection
  if (/dompet|tunai|cash|wallet|kas/i.test(n))
    return { color: '#5c6ac4', c2: '#4355b9', domain: null, isWallet: true, slug: nClean };

  // 6. Fallback
  const slug = nClean || 'unknown';
  return { color: null, c2: null, domain: slug + '.co.id', guessed: true, slug: slug };
};

// ⚡ FUNGSI RENDER LOGO ⚡
// Dashboard (useFavicon=false): SVG → Favicon (globe check) → Inisial
// Detail   (useFavicon=true) : Favicon (globe check) → SVG → Inisial
function getLogoHtml(accName, b, imgClass, fbClass, imgStyle = '', useFavicon = false) {
  const init = (accName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3) || '?').toUpperCase();
  const slug = b && b.slug ? b.slug : (b && b.domain ? b.domain.split('.')[0] : null);
  const domain = b && b.domain ? b.domain : null;

  if (!slug && !domain) return `<div class="${fbClass}" style="display:flex">${init}</div>`;

  const scale = (b && b.logoScale) ? b.logoScale : 1.45;
  const scaleStyle = `transform:scale(${scale});transform-origin:center center;`;
  const finalStyle = imgStyle ? `${imgStyle}${scaleStyle}` : scaleStyle;

  const svgSrc = `Banks%20Logo/${slug}.svg`;
  const favDomain = domain || (slug + '.co.id');
  // fallback_opts=TYPE,SIZE,URL → Google selalu HTTP 200.
  // Saat favicon tidak ada → PNG 16x16 (globe) → ditolak via naturalWidth check.
  // Saat favicon ada → PNG ukuran asli (>16px) → diterima.
  const favUrl = (b && b.favicon)
    ? b.favicon
    : `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${favDomain}&size=128`;

  const handlers = `onload="window._logoLoad(this)" onerror="window._logoErr(this)"`;
  const commonData = `data-svg-fallback="${svgSrc}" data-fb-class="${fbClass}" data-favicon-mode="${useFavicon}"`;

  if (!useFavicon) {
    // Dashboard: mulai dari SVG, fallback ke favicon jika SVG tidak ada
    return `<img class="${imgClass}" src="${svgSrc}" alt="" style="${finalStyle}"
      data-fav="${favUrl}" ${commonData} ${handlers}/>
      <div class="${fbClass}" style="display:none">${init}</div>`;
  }

  // Detail: mulai dari favicon, globe check via naturalWidth, fallback ke SVG
  return `<img class="${imgClass}" src="${favUrl}" alt="" style="${finalStyle}"
    ${commonData} ${handlers}/>
    <div class="${fbClass}" style="display:none">${init}</div>`;
}
