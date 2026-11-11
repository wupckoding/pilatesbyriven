/**
 * Normaliza un WhatsApp a E.164. Sin código de país se asume Costa Rica (+506, 8 dígitos).
 * Devuelve null si no parece un número válido.
 */
export function normalizeWhatsapp(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const hasPlus = text.startsWith('+') || text.startsWith('00')
  let digits = text.replace(/\D/g, '')
  if (text.startsWith('00')) digits = digits.slice(2)
  if (!hasPlus && digits.length === 8) return `+506${digits}`
  if (digits.length < 8 || digits.length > 15) return null
  if (!hasPlus && digits.length < 10) return null
  return `+${digits}`
}
