export interface VoiceOption {
  id: string
  label: string
  gender: 'männlich' | 'weiblich' | 'neutral'
  description: string
}

export const OPENAI_VOICES: VoiceOption[] = [
  { id: 'echo',    label: 'Echo',    gender: 'männlich', description: 'Klar, professionell' },
  { id: 'ash',     label: 'Ash',     gender: 'männlich', description: 'Direkt, prägnant' },
  { id: 'verse',   label: 'Verse',   gender: 'männlich', description: 'Ausdrucksstark' },
  { id: 'marin',   label: 'Marin',   gender: 'männlich', description: 'Warm, natürlich' },
  { id: 'shimmer', label: 'Shimmer', gender: 'weiblich', description: 'Sanft, einladend' },
  { id: 'coral',   label: 'Coral',   gender: 'weiblich', description: 'Lebendig, jugendlich' },
  { id: 'sage',    label: 'Sage',    gender: 'weiblich', description: 'Ruhig, kompetent' },
  { id: 'cedar',   label: 'Cedar',   gender: 'weiblich', description: 'Geerdet, vertrauensvoll' },
  { id: 'alloy',   label: 'Alloy',   gender: 'neutral',  description: 'Ausgewogen, vielseitig' },
  { id: 'ballad',  label: 'Ballad',  gender: 'neutral',  description: 'Melodisch, fließend' },
]

export const DEFAULT_VOICE = 'echo'
export const DEFAULT_AGENT_NAME = 'Luca'
