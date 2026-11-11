// Opciones del formulario de registro y consentimiento informado (anexo del documento de requisitos).
// Las claves coinciden con las que valida el servidor.
export const CONDITIONS = [
  ['columna', 'Lesiones de columna'], ['hernia_discal', 'Hernia discal'], ['escoliosis', 'Escoliosis'], ['rodilla', 'Rodilla'],
  ['cadera', 'Cadera'], ['hombro', 'Hombro'], ['muneca', 'Muñeca'], ['tobillo', 'Tobillo'], ['cirugias', 'Cirugías previas'],
  ['osteoporosis', 'Osteoporosis u osteopenia'], ['hipertension', 'Hipertensión'], ['diabetes', 'Diabetes'],
  ['embarazo', 'Embarazo'], ['posparto', 'Posparto'], ['otras', 'Otras condiciones'],
]
export const PILATES_TYPES = [['mat', 'Pilates Mat'], ['reformer', 'Pilates Reformer'], ['cadillac', 'Pilates Cadillac'], ['otro', 'Otro']]
export const EXERCISES = [['gimnasio', 'Gimnasio'], ['yoga', 'Yoga'], ['running', 'Running'], ['deportes', 'Deportes'], ['ninguno', 'Ninguno']]
export const GOALS = [
  ['core', 'Fortalecer el core'], ['postura', 'Mejorar postura'], ['rehabilitacion', 'Rehabilitación o prevención de lesiones'],
  ['dolor', 'Reducir dolor'], ['flexibilidad', 'Flexibilidad y movilidad'], ['tonificacion', 'Tonificación'],
  ['bienestar', 'Bienestar general'], ['preparacion', 'Preparación física específica'],
]
export const SCHEDULES = [['manana', 'Mañana'], ['tarde', 'Tarde'], ['noche', 'Noche']]

export const BLANK_ANSWERS = {
  conditions: [], surgeriesDetail: '', otherConditionsDetail: '', avoidMovements: '', careNotes: '',
  activeInjury: null, injuryZone: '', injuryNotes: '',
  painLevel: null, painZone: '', painFrequency: '', painNotes: '',
  pilatesBefore: null, pilatesTypes: [], pilatesOther: '',
  exercises: [], sportsDetail: '', goals: [], goalDetail: '', weeklyFrequency: null, schedules: [],
}

const label = (list, key) => list.find(([k]) => k === key)?.[1] || key
const many = (list, keys) => (keys?.length ? keys.map((k) => label(list, k)).join(', ') : null)
const YES_NO = { yes: 'Sí', no: 'No' }

/** Respuestas en formato de lectura para administración. Lo vacío se muestra como "Sin informar". */
export const describeAnswers = (a) => [
  { title: 'Historial médico y lesiones', rows: [
    ['Condiciones o lesiones', many(CONDITIONS, a.conditions)],
    ['Cirugías: ¿cuáles?', a.surgeriesDetail],
    ['Otras condiciones', a.otherConditionsDetail],
  ] },
  { title: 'Limitaciones o consideraciones', rows: [
    ['Movimientos que debe evitar', a.avoidMovements],
    ['Algo importante para cuidar su cuerpo', a.careNotes],
  ] },
  { title: 'Lesiones activas y dolor', rows: [
    ['¿Lesión activa?', YES_NO[a.activeInjury]],
    ['Zona', a.injuryZone],
    ['Observaciones', a.injuryNotes],
    ['Dolor actual (1 a 10)', a.painLevel],
    ['Zona del dolor', a.painZone],
    ['Frecuencia', a.painFrequency],
    ['Observaciones del dolor', a.painNotes],
  ] },
  { title: 'Experiencia y actividad física', rows: [
    ['¿Ha practicado Pilates?', YES_NO[a.pilatesBefore]],
    ['Tipos', many(PILATES_TYPES, a.pilatesTypes)],
    ['Otro (Pilates)', a.pilatesOther],
    ['Otros ejercicios', many(EXERCISES, a.exercises)],
    ['Deportes: ¿cuál?', a.sportsDetail],
  ] },
  { title: 'Objetivos y disponibilidad', rows: [
    ['Objetivos', many(GOALS, a.goals)],
    ['Preparación específica', a.goalDetail],
    ['Veces por semana', a.weeklyFrequency],
    ['Horarios preferidos', many(SCHEDULES, a.schedules)],
  ] },
]
