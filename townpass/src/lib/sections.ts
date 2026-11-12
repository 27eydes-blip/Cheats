/**
 * Section types and their section-specific fields. Every city gets the same
 * building blocks; add a new type here and it shows up in admin + the guide.
 * Extra fields are stored in listings.details (JSON).
 */

export interface FieldDef {
  key: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
}

export interface SectionType {
  type: string;
  defaultTitle: string;
  icon: string; // simple emoji keeps it dependency-free and tiny
  /** which core columns this type uses */
  uses: { hours: boolean; address: boolean; phone: boolean; price: boolean; tip: boolean; body: boolean };
  priceLabel?: string;
  fields: FieldDef[];
}

export const SECTION_TYPES: SectionType[] = [
  {
    type: "essentials",
    defaultTitle: "Essentials",
    icon: "🛒",
    uses: { hours: true, address: true, phone: true, price: false, tip: true, body: false },
    fields: [],
  },
  {
    type: "food",
    defaultTitle: "Dinner",
    icon: "🍽️",
    uses: { hours: true, address: true, phone: true, price: true, tip: true, body: false },
    priceLabel: "Price range",
    fields: [{ key: "reservations", label: "Reservation tips", multiline: true }],
  },
  {
    type: "nightlife",
    defaultTitle: "Nightlife",
    icon: "🍸",
    uses: { hours: true, address: true, phone: true, price: false, tip: true, body: false },
    fields: [
      { key: "cover", label: "Cover", placeholder: "Free / $20 after 10pm" },
      { key: "dress_code", label: "Dress code" },
      { key: "lines", label: "When lines get long" },
    ],
  },
  {
    type: "parking",
    defaultTitle: "Parking",
    icon: "🅿️",
    uses: { hours: false, address: true, phone: false, price: true, tip: true, body: false },
    priceLabel: "Price",
    fields: [
      { key: "rules", label: "Rules / time limits", multiline: true },
      { key: "permit", label: "Permit-only zones" },
      { key: "warning", label: "Tow / ticket warning" },
    ],
  },
  {
    type: "beaches",
    defaultTitle: "Beaches",
    icon: "🏖️",
    uses: { hours: true, address: true, phone: false, price: false, tip: true, body: false },
    fields: [
      { key: "parking", label: "Parking / permit rules", multiline: true },
      { key: "facilities", label: "Facilities" },
      { key: "best_time", label: "Best time to go" },
    ],
  },
  {
    type: "tips",
    defaultTitle: "Insider Tips",
    icon: "🤫",
    uses: { hours: false, address: false, phone: false, price: false, tip: false, body: true },
    fields: [],
  },
];

export function sectionType(type: string): SectionType {
  return SECTION_TYPES.find((s) => s.type === type) ?? SECTION_TYPES[0];
}
