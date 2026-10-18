/// BR-012: the details a listing must carry before it can be submitted for
/// review, because they are what the owner verifies. The API enforces this and
/// the partner page draws its checklist from it, so the two cannot disagree.
export const SUBMISSION_FIELDS = ['name', 'city', 'address', 'contactPhone', 'exams'] as const
export type SubmissionField = (typeof SUBMISSION_FIELDS)[number]

export const SUBMISSION_FIELD_LABELS: Record<SubmissionField, string> = {
  name: 'Institute name',
  city: 'City',
  address: 'Full address',
  contactPhone: 'Contact phone',
  exams: 'At least one exam',
}

export type SubmissionCandidate = {
  name?: string | null
  cityName?: string | null
  address?: string | null
  contactPhone?: string | null
  exams?: readonly string[] | null
}

const blank = (value?: string | null) => !value || value.trim().length === 0

export function missingForSubmission(candidate: SubmissionCandidate): SubmissionField[] {
  const missing: SubmissionField[] = []
  if (blank(candidate.name)) missing.push('name')
  if (blank(candidate.cityName)) missing.push('city')
  if (blank(candidate.address)) missing.push('address')
  if (blank(candidate.contactPhone)) missing.push('contactPhone')
  if (!candidate.exams || candidate.exams.length === 0) missing.push('exams')
  return missing
}
