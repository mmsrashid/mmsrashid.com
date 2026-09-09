export const OWNERSHIP_KINDS = ['personal', 'company'] as const
export type OwnershipKind = (typeof OWNERSHIP_KINDS)[number]

export const PROPERTY_STATUSES = ['active', 'sold'] as const
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number]

/**
 * How a category is treated for property purposes.
 *
 * `interest` is the Section 24 case: a genuine cash cost that is NOT deductible
 * against rental income for an individual, and instead drives a 20% tax reducer.
 * `capital` is improvement rather than repair — deductible against neither
 * rental income nor anything until disposal.
 */
export const PROPERTY_TREATMENTS = [
  'rental_income', 'allowable', 'interest', 'capital', 'non_allowable',
] as const
export type PropertyTreatment = (typeof PROPERTY_TREATMENTS)[number]

export const PROPERTY_TREATMENT_LABEL: Record<PropertyTreatment, string> = {
  rental_income: 'Rent received',
  allowable: 'Allowable expense',
  interest: 'Mortgage interest (not allowable)',
  capital: 'Capital / improvement',
  non_allowable: 'Not allowable',
}

/**
 * What a location is.
 *
 * The second dimension on a transaction answers "who or what was this for", and
 * a property is only one kind of answer — a payment can belong to a person.
 * Only `property` reaches the property P&L; a person-tagged transaction stays
 * in the personal book, because paying someone is personal spending attributed
 * to them, not property income or expense.
 */
export const LOCATION_KINDS = ['property', 'person', 'other'] as const
export type LocationKind = (typeof LOCATION_KINDS)[number]

export const LOCATION_KIND_LABEL: Record<LocationKind, string> = {
  property: 'Property',
  person: 'Person',
  other: 'Other',
}

export interface MoneyProperty {
  id: string
  user_id: string
  /** Present on every row once migration 019 has run; older rows read as property. */
  kind?: LocationKind
  code: string
  label: string | null
  ownership: OwnershipKind
  share_percent: number
  acquired_date: string | null
  disposed_date: string | null
  status: PropertyStatus
  notes: string | null
  created_at: string
}

/** Property-specific categories, added to the general starter set. */
export const PROPERTY_CATEGORY_SEED: {
  name: string
  kind: 'spending' | 'income'
  property_treatment: PropertyTreatment
}[] = [
  { name: 'Rent received', kind: 'income', property_treatment: 'rental_income' },
  { name: 'Mortgage interest', kind: 'spending', property_treatment: 'interest' },
  { name: 'Letting fees', kind: 'spending', property_treatment: 'allowable' },
  { name: 'Property repairs', kind: 'spending', property_treatment: 'allowable' },
  { name: 'Property insurance', kind: 'spending', property_treatment: 'allowable' },
  { name: 'Ground rent & service charge', kind: 'spending', property_treatment: 'allowable' },
  // Allowable only for periods the landlord actually pays it — a void, an
  // all-inclusive let, or an HMO. Where the tenant is liable it is not the
  // landlord's expense at all, so tagging a tenant-paid bill here would
  // understate taxable profit.
  { name: 'Council tax', kind: 'spending', property_treatment: 'allowable' },
  { name: 'Utilities (property)', kind: 'spending', property_treatment: 'allowable' },
  { name: 'Safety certificates', kind: 'spending', property_treatment: 'allowable' },
  { name: 'Property improvements', kind: 'spending', property_treatment: 'capital' },
]
