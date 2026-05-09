/**
 * bankColors.js
 * Data warna brand resmi bank-bank di Indonesia
 * Terakhir diverifikasi: Mei 2026
 *
 * Struktur tiap entry:
 *   color  — warna primer (hex)
 *   c2     — warna primer lebih gelap / aksen (hex)
 *   domain — domain resmi bank
 *
 * Catatan perubahan vs data lama:
 *   - BNI       : warna dikoreksi ke teal #005e6a (primer), oranye #f15a23 jadi c2
 *   - BSI       : dikoreksi ke teal mint #00A39D (brand guide resmi), c2 kuning #F8AD3C
 *   - Danamon   : dikoreksi ke hijau #046148 (rebranding Juli 2024, identitas MUFG)
 *   - Permata   : dikoreksi ke active blue #1565C0 (rebranding Sep 2024, lotus + Bangkok Bank)
 *   - Bukopin   : dikoreksi ke kuning #f5c400 → kini KB Bank (rebranding 2021/2024)
 *   - Bukopin Syariah : kini KB Bank Syariah (rebranding Mar 2024), warna kuning KB Group
 *   - Muamalat  : dikoreksi ke ungu #5b2d8e primer, hijau #7DC242 sebagai c2
 *   - OCBC NISP : berganti nama jadi OCBC (Nov 2023), warna merah tetap relevan
 */

const bankColors = {

  // ─────────────────────────────────────────
  // BANK PEMERINTAH
  // ─────────────────────────────────────────

  bri: {
    color: '#00529c',
    c2:    '#003d7a',
    domain: 'www.bri.co.id',
  },
  bni: {
    // Primer = teal-cyan (huruf BNI), c2 = oranye (kotak 46)
    color: '#005e6a',
    c2:    '#f15a23',
    domain: 'www.bni.co.id',
  },
  bca: {
    color: '#0060af',
    c2:    '#004d8c',
    domain: 'www.bca.co.id',
  },
  mandiri: {
    color: '#003d77',
    c2:    '#002d58',
    domain: 'www.bankmandiri.co.id',
  },
  btn: {
    color: '#0069ab',
    c2:    '#005289',
    domain: 'www.btn.co.id',
  },
  bsi: {
    // Warna resmi dari brand guide BSI: teal mint + kuning emas
    color: '#00A39D',
    c2:    '#F8AD3C',
    domain: 'www.bankbsi.co.id',
  },

  // ─────────────────────────────────────────
  // BANK SYARIAH
  // ─────────────────────────────────────────

  bcasyariah: {
    color: '#0060af',
    c2:    '#004d8c',
    domain: 'www.bcasyariah.co.id',
  },
  btnsyariah: {
    color: '#0069ac',
    c2:    '#00528a',
    domain: 'www.btn.co.id',
  },
  btpnsyariah: {
    color: '#E30613',
    c2:    '#b80510',
    domain: 'www.btpnsyariah.com',
  },
  // KB Bank Syariah (ex-Bank Syariah Bukopin → ex-KB Bukopin Syariah)
  // Rebranding: Mar 2024 → KB Bank Syariah, warna KB Group (kuning)
  bukopinsyariah: {
    color: '#f5c400',
    c2:    '#c49d00',
    domain: 'www.kbbanksyariah.co.id',
  },
  danamonsyariah: {
    // Mengikuti rebranding Danamon 2024 → hijau MUFG
    color: '#046148',
    c2:    '#034f39',
    domain: 'www.danamon.co.id',
  },
  cimbniagasyariah: {
    color: '#C00000',
    c2:    '#960000',
    domain: 'www.cimbniaga.co.id',
  },
  megasyariah: {
    color: '#E31E24',
    c2:    '#b5181d',
    domain: 'www.bms.co.id',
  },
  muamalat: {
    // Warna baru: ungu muda (primer) + hijau muda (c2)
    color: '#5b2d8e',
    c2:    '#7DC242',
    domain: 'www.bankmuamalat.co.id',
  },
  nanobanksyariah: {
    color: '#002657',
    c2:    '#001e42',
    domain: 'www.nanobank.co.id',
  },
  ntbsyariah: {
    color: '#006B3F',
    c2:    '#00552f',
    domain: 'www.bankntbsyariah.co.id',
  },
  panindubaisyariah: {
    color: '#005AB2',
    c2:    '#00478c',
    domain: 'www.banksyariah.co.id',
  },
  sinarmassyariah: {
    color: '#0070B8',
    c2:    '#005a93',
    domain: 'www.sinarmassyariah.co.id',
  },
  victoriasyariah: {
    color: '#003087',
    c2:    '#00256b',
    domain: 'www.bankvictoriasyariah.co.id',
  },

  // ─────────────────────────────────────────
  // BANK SWASTA NASIONAL
  // ─────────────────────────────────────────

  // KB Bank (ex-Bank Bukopin → ex-KB Bukopin)
  // Rebranding: Feb 2021 → KB Bukopin, Mar 2024 → KB Bank
  // Warna baru: kuning KB Kookmin Group
  bukopin: {
    color: '#f5c400',
    c2:    '#c49d00',
    domain: 'www.kbbank.id',
  },
  danamon: {
    // Rebranding logo Juli 2024 → hijau (identitas MUFG Group)
    color: '#046148',
    c2:    '#034f39',
    domain: 'www.danamon.co.id',
  },
  cimbniaga: {
    // Pantone 202C + 485C → merah gelap (Annual Report 2022)
    color: '#C00000',
    c2:    '#960000',
    domain: 'www.cimbniaga.co.id',
  },
  paninbank: {
    color: '#005AB2',
    c2:    '#00478c',
    domain: 'www.panin.co.id',
  },
  permatabank: {
    // Rebranding Sep 2024: logo permata → bunga lotus, warna → active blue
    color: '#1565C0',
    c2:    '#1044a0',
    domain: 'www.permatabank.com',
  },
  maybank: {
    color: '#FFCC00',
    c2:    '#e6b800',
    domain: 'www.maybank.co.id',
  },
  mega: {
    color: '#E31E24',
    c2:    '#b5181d',
    domain: 'www.bankmega.com',
  },
  sinarmas: {
    color: '#0070B8',
    c2:    '#005a93',
    domain: 'www.banksinarmas.com',
  },
  // OCBC (ex-OCBC NISP, rebranding Nov 2023)
  ocbc: {
    color: '#E31E24',
    c2:    '#b80510',
    domain: 'www.ocbc.id',
  },
  maspion: {
    color: '#003580',
    c2:    '#002860',
    domain: 'www.bankmaspion.co.id',
  },
  mestika: {
    color: '#C8102E',
    c2:    '#a00d25',
    domain: 'www.bankmestika.co.id',
  },
  nagari: {
    color: '#1A5276',
    c2:    '#154360',
    domain: 'www.banknagari.co.id',
  },
  nobubank: {
    color: '#002D72',
    c2:    '#002460',
    domain: 'www.nobubank.com',
  },
  mncbank: {
    color: '#003087',
    c2:    '#00256b',
    domain: 'www.mncbank.co.id',
  },
  victoria: {
    color: '#003087',
    c2:    '#00256b',
    domain: 'www.victoriabank.co.id',
  },
  capital: {
    color: '#002D72',
    c2:    '#002460',
    domain: 'www.bankCapital.co.id',
  },
  primabank: {
    color: '#003087',
    c2:    '#00256b',
    domain: 'www.bankprima.co.id',
  },
  ina: {
    color: '#292567',
    c2:    '#1e1c52',
    domain: 'www.bankina.co.id',
  },
  indexselindo: {
    color: '#003580',
    c2:    '#002860',
    domain: 'www.bankindex.co.id',
  },
  bumiartha: {
    color: '#234089',
    c2:    '#1a3170',
    domain: 'www.bumiartha.co.id',
  },
  bws: {
    color: '#003580',
    c2:    '#002860',
    domain: 'www.bankws.co.id',
  },
  ntt: {
    color: '#003580',
    c2:    '#002860',
    domain: 'www.bankntt.co.id',
  },
  sultra: {
    color: '#003580',
    c2:    '#002860',
    domain: 'www.banksultra.co.id',
  },
  sumsel: {
    color: '#003580',
    c2:    '#002860',
    domain: 'www.banksumselbabel.co.id',
  },
  sumut: {
    color: '#003580',
    c2:    '#002860',
    domain: 'www.banksumut.co.id',
  },
  ganesha: {
    color: '#003580',
    c2:    '#002860',
    domain: 'www.bankganesha.co.id',
  },
  regionalbank: {
    color: '#003580',
    c2:    '#002860',
    domain: 'www.regionalbank.co.id',
  },
  privatebank: {
    color: '#003580',
    c2:    '#002860',
    domain: 'www.privatbank.co.id',
  },
  sahabatsampoerna: {
    color: '#003D88',
    c2:    '#002d68',
    domain: 'www.banksahabat.com',
  },
  dki: {
    color: '#1A5276',
    c2:    '#154360',
    domain: 'www.bankdki.co.id',
  },
  jakarta: {
    color: '#1A5276',
    c2:    '#154360',
    domain: 'www.bankjakarta.co.id',
  },
  mas: {
    color: '#003580',
    c2:    '#002860',
    domain: 'www.bankmas.co.id',
  },
  jago: {
    color: '#F05A28',
    c2:    '#c04820',
    domain: 'www.jago.com',
  },
  raya: {
    color: '#00549A',
    c2:    '#00437b',
    domain: 'www.bankraya.co.id',
  },
  neo: {
    color: '#ff9f00',
    c2:    '#cc7f00',
    domain: 'www.neo.co.id',
  },
  hibank: {
    color: '#005E6A',
    c2:    '#004b54',
    domain: 'www.hibank.co.id',
  },
  superbank: {
    color: '#C0FF00',
    c2:    '#9acc00',
    domain: 'www.superbank.id',
  },
  saqu: {
    color: '#fdd835',
    c2:    '#cab020',
    domain: 'www.saqu.com',
  },
  salutgo: {
    color: '#00A86B',
    c2:    '#008556',
    domain: 'www.salutgo.id',
  },
  okbank: {
    color: '#004B87',
    c2:    '#003a6b',
    domain: 'www.okbank.id',
  },
  blu: {
    color: '#00C1F8',
    c2:    '#009acc',
    domain: 'www.blubybcadigital.id',
  },
  bcadigital: {
    color: '#005EB8',
    c2:    '#004a9e',
    domain: 'www.blubybcadigital.id',
  },
  linebank: {
    color: '#00C300',
    c2:    '#009a00',
    domain: 'www.linebank.co.id',
  },
  krombank: {
    color: '#6A36D3',
    c2:    '#542ba8',
    domain: 'www.krom.id',
  },
  aladin: {
    color: '#0a71af',
    c2:    '#085a8c',
    domain: 'aladinbank.id',
  },
  seabank: {
    color: '#EE4D2D',
    c2:    '#bf3e24',
    domain: 'www.seabank.co.id',
  },

  // ─────────────────────────────────────────
  // BANK ASING
  // ─────────────────────────────────────────

  hsbc: {
    color: '#DB0011',
    c2:    '#b0000e',
    domain: 'www.hsbc.co.id',
  },
  ccbindonesia: {
    color: '#b30738',
    c2:    '#8f062d',
    domain: 'www.ccb.co.id',
  },
  chinaconstructionbankindonesia: {
    color: '#b30738',
    c2:    '#8f062d',
    domain: 'www.ccb.co.id',
  },
  citibank: {
    color: '#1c4882',
    c2:    '#163868',
    domain: 'www.citibank.co.id',
  },
  dbs: {
    color: '#DA1710',
    c2:    '#ae120d',
    domain: 'www.dbs.com',
  },
  maybank2: {
    color: '#FFCC00',
    c2:    '#e6b800',
    domain: 'www.maybank.co.id',
  },
  anz: {
    color: '#007DBA',
    c2:    '#005f9a',
    domain: 'www.anz.co.id',
  },
  commonwealthbank: {
    color: '#F0A500',
    c2:    '#c08400',
    domain: 'www.commbank.co.id',
  },
  deutschebank: {
    color: '#0018a8',
    c2:    '#001487',
    domain: 'www.db.com',
  },
  hanabank: {
    color: '#009E60',
    c2:    '#007d4d',
    domain: 'www.koreaexim.or.id',
  },
  ibkbank: {
    color: '#003580',
    c2:    '#002860',
    domain: 'www.ibkbank.co.id',
  },
  icbc: {
    color: '#B30014',
    c2:    '#8c0010',
    domain: 'www.icbc.co.id',
  },
  ingbank: {
    color: '#ff6600',
    c2:    '#cc5200',
    domain: 'www.ing.co.id',
  },
  jtrustbank: {
    color: '#003087',
    c2:    '#00256b',
    domain: 'www.jtrustbank.co.id',
  },
  mizuho: {
    color: '#003087',
    c2:    '#00256b',
    domain: 'www.mizuhobank.co.id',
  },
  mufg: {
    color: '#E60012',
    c2:    '#b8000e',
    domain: 'www.mufg.jp',
  },
  bnpparibas: {
    color: '#009C77',
    c2:    '#007a5f',
    domain: 'www.bnpparibas.co.id',
  },
  shinhanbank: {
    color: '#E31E24',
    c2:    '#b5181d',
    domain: 'www.shinhanbank.co.id',
  },
  smbcindonesia: {
    color: '#134939',
    c2:    '#0e3a2c',
    domain: 'www.smbc.co.id',
  },
  ctbcbank: {
    color: '#107c79',
    c2:    '#0d6360',
    domain: 'www.ctbcbank.co.id',
  },
  bangkokbank: {
    color: '#1f4396',
    c2:    '#172f73',
    domain: 'www.bangkokbank.co.id',
  },
  creditsuisse: {
    color: '#183964',
    c2:    '#122c4e',
    domain: 'www.credit-suisse.com',
  },
  ofamerica: {
    color: '#EE2A24',
    c2:    '#bf221d',
    domain: 'bankofamerica.co.id',
  },
  ofchina: {
    color: '#B30738',
    c2:    '#8f062d',
    domain: 'bankofchina.co.id',
  },
  ofindia: {
    color: '#EE7A00',
    c2:    '#bf6200',
    domain: 'boiindonesia.co.id',
  },
  oub: {
    color: '#E1091D',
    c2:    '#b40717',
    domain: 'www.uob.co.id',
  },
  sbi: {
    color: '#292075',
    c2:    '#1f185a',
    domain: 'www.sbiindo.com',
  },
  resona: {
    color: '#009E5E',
    c2:    '#007e4b',
    domain: 'resona.co.id',
  },
  standartcartered: {
    color: '#38d200',
    c2:    '#0473ea',
    domain: 'sc.co.id',
  },
  jpmorganchaseandco: {
    color: '#003087',
    c2:    '#00256b',
    domain: 'jpmorgan.co.id',
  },
  arthagrahainternasional: {
    color: '#A28548',
    c2:    '#826a3a',
    domain: 'arthagraha.co.id',
  },
  allobank: {
    color: '#1A1A1A',
    c2:    '#0d0d0d',
    domain: 'allobank.com',
  },
};

export default bankColors;

// Untuk CommonJS:
// module.exports = bankColors;
