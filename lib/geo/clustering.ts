import { normalizeInput } from './normalizer'
import { ALIAS_MAP } from './aliases'
import type { DatasetCluster } from './types'

const DISTRICT_STATE: Record<string, string> = {
  // Puducherry UT
  puducherry: 'Puducherry', karaikal: 'Puducherry', mahe: 'Puducherry', yanam: 'Puducherry',
  // Tamil Nadu — all 38 districts
  ariyalur: 'Tamil Nadu', chengalpattu: 'Tamil Nadu', chennai: 'Tamil Nadu',
  coimbatore: 'Tamil Nadu', cuddalore: 'Tamil Nadu', dharmapuri: 'Tamil Nadu',
  dindigul: 'Tamil Nadu', erode: 'Tamil Nadu', kallakurichi: 'Tamil Nadu',
  kanchipuram: 'Tamil Nadu', kanyakumari: 'Tamil Nadu', karur: 'Tamil Nadu',
  krishnagiri: 'Tamil Nadu', madurai: 'Tamil Nadu', mayiladuthurai: 'Tamil Nadu',
  nagapattinam: 'Tamil Nadu', namakkal: 'Tamil Nadu', nilgiris: 'Tamil Nadu',
  perambalur: 'Tamil Nadu', pudukkottai: 'Tamil Nadu', ramanathapuram: 'Tamil Nadu',
  ranipet: 'Tamil Nadu', salem: 'Tamil Nadu', sivaganga: 'Tamil Nadu',
  tenkasi: 'Tamil Nadu', thanjavur: 'Tamil Nadu', theni: 'Tamil Nadu',
  thoothukudi: 'Tamil Nadu', tiruchirappalli: 'Tamil Nadu', tirunelveli: 'Tamil Nadu',
  tirupattur: 'Tamil Nadu', tiruppur: 'Tamil Nadu', tiruvallur: 'Tamil Nadu',
  tiruvannamalai: 'Tamil Nadu', tiruvarur: 'Tamil Nadu', vellore: 'Tamil Nadu',
  villupuram: 'Tamil Nadu', virudhunagar: 'Tamil Nadu',
}

// Puducherry locality signals — all keys from aliases.ts that map to Puducherry localities
const PONDY_LOCALITY_SIGNALS = new Set([
  // core city / UT names
  'puducherry', 'pondicherry', 'pondy', 'pudu', 'puduvai',
  // localities from aliases.ts
  'lawspet', 'lawpet',
  'mudaliarpet', 'mudliarpet',
  'villianur', 'villiyanur', 'villianr',
  'reddiyarpalayam', 'reddiarpalayam',
  'ariyankuppam', 'ariankoopam',
  'whitetown', 'heritagetown',
  'muthialpet',
  'auroville',
  // additional Pondy signals
  'rainbownagar', 'oupalam', 'mannadipet',
  'ozhukarai', 'nettapakkam', 'thiruvandarkoil', 'bahournagar',
  'kamarajnagar', 'senthilnagar', 'subbaiahpuram', 'vambupet',
  'kurusukuppam', 'kurumbapet', 'murungapakkam', 'thilaspet', 'kosapalayam',
])

// Maps normalized alias → district key (must match keys in DISTRICT_STATE)
const ALIAS_TO_DISTRICT: Record<string, string> = {
  // Puducherry
  pondy: 'puducherry', pondicherry: 'puducherry', puducherry: 'puducherry', pudu: 'puducherry',
  puduchery: 'puducherry', pondichery: 'puducherry', ponducherry: 'puducherry',
  pudducherry: 'puducherry', pudhucherry: 'puducherry', puthucherry: 'puducherry',
  karaikal: 'karaikal', karaikkal: 'karaikal', karikal: 'karaikal',
  mahe: 'mahe', yanam: 'yanam',

  // Chennai
  chennai: 'chennai', madras: 'chennai', chenai: 'chennai', chennaai: 'chennai',
  chinnai: 'chennai', chenni: 'chennai', chennay: 'chennai',

  // Coimbatore
  coimbatore: 'coimbatore', cbe: 'coimbatore', kovai: 'coimbatore', covai: 'coimbatore',
  coimbatur: 'coimbatore', koimbatore: 'coimbatore', kombatore: 'coimbatore',

  // Tiruchirappalli
  trichy: 'tiruchirappalli', tiruchy: 'tiruchirappalli', tiruchirappalli: 'tiruchirappalli',
  trichinopoly: 'tiruchirappalli', thirchy: 'tiruchirappalli', tiruchi: 'tiruchirappalli',
  tirucci: 'tiruchirappalli', trichirappalli: 'tiruchirappalli', tiruchirapalli: 'tiruchirappalli',

  // Madurai
  madurai: 'madurai', madura: 'madurai', madurei: 'madurai',

  // Salem
  salem: 'salem', salemm: 'salem', saalem: 'salem', selem: 'salem',

  // Erode
  erode: 'erode', errode: 'erode', erod: 'erode', irode: 'erode',

  // Vellore
  vellore: 'vellore', vellur: 'vellore', velore: 'vellore', vallore: 'vellore',

  // Thanjavur (includes Kumbakonam which is in Thanjavur district)
  thanjavur: 'thanjavur', tanjore: 'thanjavur', tanjavur: 'thanjavur', thanjore: 'thanjavur',
  kumbakonam: 'thanjavur', kumbakonum: 'thanjavur',

  // Tirunelveli
  tirunelveli: 'tirunelveli', nellai: 'tirunelveli', nelai: 'tirunelveli',
  thirunelveli: 'tirunelveli', tinnevelly: 'tirunelveli',

  // Thoothukudi
  thoothukudi: 'thoothukudi', tuticorin: 'thoothukudi', thoothkudi: 'thoothukudi',
  thootukudi: 'thoothukudi', tuti: 'thoothukudi',

  // Kanyakumari (Nagercoil is the HQ of Kanyakumari district)
  kanyakumari: 'kanyakumari', kanniyakumari: 'kanyakumari', kannyakumari: 'kanyakumari',
  nagercoil: 'kanyakumari', nagerkoil: 'kanyakumari', nagarcoil: 'kanyakumari',

  // Villupuram
  villupuram: 'villupuram', villipuram: 'villupuram', vilupuram: 'villupuram',

  // Cuddalore
  cuddalore: 'cuddalore', cudalore: 'cuddalore', cudalur: 'cuddalore',

  // Nagapattinam
  nagapattinam: 'nagapattinam', nagapatinam: 'nagapattinam', nagapatnam: 'nagapattinam',

  // Dindigul
  dindigul: 'dindigul', dindugal: 'dindigul', dindigal: 'dindigul', dindugul: 'dindigul',

  // Tiruppur
  tiruppur: 'tiruppur', tirupur: 'tiruppur', thiruppur: 'tiruppur', thirupur: 'tiruppur',

  // Krishnagiri (Hosur is in Krishnagiri district)
  krishnagiri: 'krishnagiri', krishnagri: 'krishnagiri', krishanagiri: 'krishnagiri',
  hosur: 'krishnagiri', hosoor: 'krishnagiri',

  // Dharmapuri
  dharmapuri: 'dharmapuri', dharamapuri: 'dharmapuri', dharmpur: 'dharmapuri',

  // Namakkal
  namakkal: 'namakkal', namakal: 'namakkal', namakall: 'namakkal',

  // Karur
  karur: 'karur', karoor: 'karur', karuur: 'karur',

  // Perambalur
  perambalur: 'perambalur', perambaloor: 'perambalur', perabalur: 'perambalur',

  // Ariyalur
  ariyalur: 'ariyalur', ariyaloor: 'ariyalur', arialur: 'ariyalur',

  // Sivaganga
  sivaganga: 'sivaganga', sivagangai: 'sivaganga', shivaganga: 'sivaganga',

  // Virudhunagar
  virudhunagar: 'virudhunagar', virudunagar: 'virudhunagar', virudhunagr: 'virudhunagar',

  // Ramanathapuram
  ramanathapuram: 'ramanathapuram', ramnathapuram: 'ramanathapuram', ramnad: 'ramanathapuram',

  // Kanchipuram
  kanchipuram: 'kanchipuram', kancheepuram: 'kanchipuram', kanchi: 'kanchipuram',
  conjeevaram: 'kanchipuram',

  // Chengalpattu
  chengalpattu: 'chengalpattu', chengalpet: 'chengalpattu', chengalpatu: 'chengalpattu',

  // Tiruvannamalai
  tiruvannamalai: 'tiruvannamalai', thiruvannamalai: 'tiruvannamalai',
  tiruvanamali: 'tiruvannamalai', arunachalam: 'tiruvannamalai', tvm: 'tiruvannamalai',

  // Nilgiris
  nilgiris: 'nilgiris', nilgiri: 'nilgiris', ooty: 'nilgiris',
  udhagamandalam: 'nilgiris', coonoor: 'nilgiris', kotagiri: 'nilgiris', gudalur: 'nilgiris',

  // Tenkasi
  tenkasi: 'tenkasi', thenkasi: 'tenkasi', tenkasy: 'tenkasi',

  // Ranipet
  ranipet: 'ranipet', ranippet: 'ranipet', ranipett: 'ranipet',

  // Tirupattur
  tirupattur: 'tirupattur', thirupattur: 'tirupattur', tirupatur: 'tirupattur',

  // Kallakurichi
  kallakurichi: 'kallakurichi', kallakurchi: 'kallakurichi',

  // Mayiladuthurai
  mayiladuthurai: 'mayiladuthurai', mayladuthurai: 'mayiladuthurai', myladuthurai: 'mayiladuthurai',

  // Pudukkottai
  pudukkottai: 'pudukkottai', pudukottai: 'pudukkottai', podukottai: 'pudukkottai',

  // Tiruvallur
  tiruvallur: 'tiruvallur', thiruvallur: 'tiruvallur', tiruvalur: 'tiruvallur',
}

export function detectDatasetCluster(rawInputs: string[]): DatasetCluster {
  const districtVotes: Record<string, number> = {}
  const stateVotes: Record<string, number> = {}

  for (const raw of rawInputs) {
    if (!raw?.trim()) continue
    const n = normalizeInput(raw)

    const aliasDist = ALIAS_TO_DISTRICT[n]
    if (aliasDist) {
      districtVotes[aliasDist] = (districtVotes[aliasDist] ?? 0) + 2
      const st = DISTRICT_STATE[aliasDist]
      if (st) stateVotes[st] = (stateVotes[st] ?? 0) + 2
      continue
    }

    const canonical = ALIAS_MAP[n]
    if (canonical) {
      const cn = normalizeInput(canonical)
      const d = ALIAS_TO_DISTRICT[cn] ?? Object.keys(DISTRICT_STATE).find(k => cn.includes(k))
      if (d) {
        districtVotes[d] = (districtVotes[d] ?? 0) + 1
        const st = DISTRICT_STATE[d]
        if (st) stateVotes[st] = (stateVotes[st] ?? 0) + 1
      }
      continue
    }

    if (PONDY_LOCALITY_SIGNALS.has(n)) {
      districtVotes['puducherry'] = (districtVotes['puducherry'] ?? 0) + 2
      stateVotes['Puducherry'] = (stateVotes['Puducherry'] ?? 0) + 2
      continue
    }

    for (const [district, state] of Object.entries(DISTRICT_STATE)) {
      if (n.includes(district) || district.includes(n)) {
        districtVotes[district] = (districtVotes[district] ?? 0) + 1
        stateVotes[state] = (stateVotes[state] ?? 0) + 1
        break
      }
    }
  }

  const totalVotes = Object.values(districtVotes).reduce((a, b) => a + b, 0)
  if (totalVotes === 0) {
    return { top_state: 'Tamil Nadu', top_district: '', confidence: 0, district_votes: {}, state_votes: {} }
  }

  const top_district = Object.entries(districtVotes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  const top_state = DISTRICT_STATE[top_district] ?? Object.entries(stateVotes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Tamil Nadu'
  const topVotes = districtVotes[top_district] ?? 0
  const confidence = Math.min(topVotes / totalVotes, 1)

  return { top_state, top_district, confidence, district_votes: districtVotes, state_votes: stateVotes }
}

export function clusterBoost(
  candidate: { district?: string; state?: string },
  cluster: DatasetCluster
): number {
  if (!cluster.top_district && cluster.confidence < 0.1) return 0
  const cn = normalizeInput(candidate.district ?? '')
  const cs = normalizeInput(candidate.state ?? '')
  if (cn && cluster.top_district && cn.includes(cluster.top_district)) return 0.20 * cluster.confidence
  if (cs && cluster.top_state && cs.includes(normalizeInput(cluster.top_state))) return 0.08 * cluster.confidence
  return 0
}
