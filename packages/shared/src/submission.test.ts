import { describe, expect, it } from 'vitest'
import { missingForSubmission, type SubmissionCandidate } from './submission.js'

const complete: SubmissionCandidate = {
  name: 'Alpha Academy',
  cityName: 'Pune',
  address: '12 FC Road, Shivajinagar, Pune 411005',
  contactPhone: '9876543210',
  exams: ['jee'],
}

describe('missingForSubmission (BR-012)', () => {
  it('reports nothing for a complete listing', () => {
    expect(missingForSubmission(complete)).toEqual([])
  })

  it.each([
    ['name', { name: '  ' }],
    ['city', { cityName: null }],
    ['address', { address: '' }],
    ['contactPhone', { contactPhone: null }],
    ['exams', { exams: [] }],
  ] as const)('reports %s alone when only it is missing', (field, override) => {
    expect(missingForSubmission({ ...complete, ...override })).toEqual([field])
  })

  it('reports every missing field in a stable order', () => {
    expect(missingForSubmission({})).toEqual(['name', 'city', 'address', 'contactPhone', 'exams'])
  })
})
