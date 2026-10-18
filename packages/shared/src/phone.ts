import { z } from 'zod'

/// The one definition of a valid phone number: ten digits, no prefix. Used by
/// enquiries and by a listing's private contact phone.
export const phoneSchema = z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits')

/// Turns the ways people actually type an Indian mobile number into the stored
/// form. Anything it cannot interpret is returned digits-only, for phoneSchema
/// to reject with a readable message.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}
