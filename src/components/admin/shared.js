export const classTypeLabels = {
  'semi-grupal': 'Semi-grupal',
  duo: 'Duo',
  privada: 'Privada',
  mat: 'MAT',
}

export const weekDays = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
]

export const currency = (value) => `$${Number(value || 0).toFixed(2)}`
