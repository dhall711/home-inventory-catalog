export type CategorySlug =
  | 'art'
  | 'furniture'
  | 'electronics'
  | 'appliances'
  | 'jewelry'
  | 'watches'
  | 'collectibles'
  | 'figurines'
  | 'ethnographic_art'
  | 'decorative_arts'
  | 'pipes'
  | 'musical_instruments'
  | 'coins_currency'
  | 'stamps'
  | 'firearms'
  | 'wine_spirits'
  | 'apparel'
  | 'tools'
  | 'kitchenware'
  | 'books_media'
  | 'sporting'
  | 'other';

export const CATEGORIES: { slug: CategorySlug; name: string }[] = [
  { slug: 'art', name: 'Art' },
  { slug: 'furniture', name: 'Furniture' },
  { slug: 'electronics', name: 'Electronics' },
  { slug: 'appliances', name: 'Appliances' },
  { slug: 'jewelry', name: 'Jewelry' },
  { slug: 'watches', name: 'Watches' },
  { slug: 'collectibles', name: 'Collectibles' },
  { slug: 'figurines', name: 'Figurines' },
  { slug: 'ethnographic_art', name: 'Ethnographic Art & Jewelry' },
  { slug: 'decorative_arts', name: "Decorative Arts (Objet d'Art)" },
  { slug: 'pipes', name: 'Pipes' },
  { slug: 'musical_instruments', name: 'Musical Instruments' },
  { slug: 'coins_currency', name: 'Coins & Currency' },
  { slug: 'stamps', name: 'Stamps' },
  { slug: 'firearms', name: 'Firearms' },
  { slug: 'wine_spirits', name: 'Wine & Spirits' },
  { slug: 'apparel', name: 'Apparel' },
  { slug: 'tools', name: 'Tools' },
  { slug: 'kitchenware', name: 'Kitchenware' },
  { slug: 'books_media', name: 'Books & Media' },
  { slug: 'sporting', name: 'Sporting Goods' },
  { slug: 'other', name: 'Other' },
];

export type ItemStatus = 'active' | 'sold' | 'disposed' | 'lost' | 'review';
export type ValueSource = 'manual' | 'ai' | 'appraisal' | 'receipt';
export type AttachmentKind = 'receipt' | 'appraisal' | 'manual' | 'other';
export type MemberRole = 'owner' | 'member';

export interface Household {
  id: string;
  name: string;
  currency: string;
  created_at: string;
}

export interface Location {
  id: string;
  household_id: string;
  parent_id: string | null;
  name: string;
}

export interface Collection {
  id: string;
  household_id: string;
  name: string;
  description: string | null;
  default_category: CategorySlug | null;
  cover_photo_url: string | null;
  notes: string | null;
}

export interface CustomAttribute {
  key: string;
  value: string;
}

export interface Tag {
  id: string;
  household_id: string;
  name: string;
}

export interface Item {
  id: string;
  household_id: string;
  category: CategorySlug;
  name: string;
  description: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  condition: string | null;
  status: ItemStatus;

  location_id: string | null;
  collection_id: string | null;

  acquired_date: string | null;
  acquired_from: string | null;
  acquired_price: number | null;

  current_value: number | null;
  current_value_source: ValueSource | null;
  current_value_updated_at: string | null;

  primary_photo_url: string | null;
  primary_photo_thumb_url: string | null;

  notes: string | null;

  ai_confidence: number | null;
  ai_raw_json: unknown;

  custom_attributes: Record<string, string> | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemPhoto {
  id: string;
  item_id: string;
  url: string;
  thumb_url: string | null;
  is_primary: boolean;
  sort_order: number;
  source_batch_id: string | null;
  bbox_json: BoundingBox | null;
  created_at: string;
}

export interface ItemAttachment {
  id: string;
  item_id: string;
  kind: AttachmentKind;
  url: string;
  filename: string | null;
  size_bytes: number | null;
  uploaded_at: string;
}

export interface ValueHistoryRow {
  id: string;
  item_id: string;
  value: number;
  source: ValueSource;
  dated_on: string;
  notes: string | null;
}

export interface BatchUpload {
  id: string;
  household_id: string;
  source_image_url: string;
  status: 'pending' | 'analyzing' | 'review' | 'complete' | 'error';
  detected_count: number;
  notes: string | null;
  created_at: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ItemFilters {
  q?: string;
  category?: CategorySlug | '';
  location_id?: string;
  collection_id?: string;
  tag_id?: string;
  status?: ItemStatus | '';
  min_value?: number;
  max_value?: number;
  has_serial?: boolean;
  has_receipt?: boolean;
  page?: number;
  page_size?: number;
  sort?: SortOption;
}

export type SortOption =
  | 'updated_desc'
  | 'created_desc'
  | 'name_asc'
  | 'value_desc'
  | 'value_asc'
  | 'acquired_desc';

// AI extraction result for a single item
export interface AIExtractedItem {
  category: CategorySlug;
  name: string;
  description?: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  condition?: string;
  acquired_date?: string;
  acquired_price?: number;
  estimated_value?: number;
  estimated_value_reasoning?: string;
  confidence?: number;
  attributes?: Record<string, string | number | boolean | null | undefined>;
}

// AI batch detection
export interface AIDetectedItem {
  name: string;
  category: CategorySlug;
  description?: string;
  bbox: BoundingBox;
  confidence?: number;
  estimated_value?: number;
}

// Per-category attribute schemas (for forms & DB writes)
export const CATEGORY_ATTRIBUTES: Record<CategorySlug, AttributeField[]> = {
  art: [
    { key: 'artist', label: 'Artist', type: 'text' },
    { key: 'medium', label: 'Medium', type: 'text' },
    { key: 'dimensions', label: 'Dimensions', type: 'text' },
    { key: 'year_created', label: 'Year', type: 'text' },
    { key: 'signed', label: 'Signed', type: 'boolean' },
    { key: 'edition', label: 'Edition', type: 'text' },
    { key: 'provenance', label: 'Provenance', type: 'textarea' },
    { key: 'framed', label: 'Framed', type: 'boolean' },
  ],
  electronics: [
    { key: 'mac_address', label: 'MAC address', type: 'text' },
    { key: 'imei', label: 'IMEI', type: 'text' },
    { key: 'firmware', label: 'Firmware', type: 'text' },
    { key: 'warranty_until', label: 'Warranty until', type: 'date' },
    { key: 'accessories', label: 'Accessories', type: 'textarea' },
  ],
  jewelry: [
    { key: 'metal', label: 'Metal', type: 'text' },
    { key: 'karat', label: 'Karat', type: 'text' },
    { key: 'stones', label: 'Stones', type: 'text' },
    { key: 'carat_weight', label: 'Carat weight', type: 'text' },
    { key: 'hallmarks', label: 'Hallmarks', type: 'text' },
    { key: 'appraisal_date', label: 'Appraisal date', type: 'date' },
  ],
  furniture: [
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'dimensions_w_d_h', label: 'Dimensions (W x D x H)', type: 'text' },
    { key: 'designer', label: 'Designer', type: 'text' },
    { key: 'style_period', label: 'Style/Period', type: 'text' },
  ],
  watches: [
    { key: 'movement', label: 'Movement', type: 'text' },
    { key: 'case_material', label: 'Case material', type: 'text' },
    { key: 'case_size', label: 'Case size', type: 'text' },
    { key: 'band_material', label: 'Band material', type: 'text' },
    { key: 'reference_number', label: 'Reference #', type: 'text' },
    { key: 'box_papers', label: 'Box & papers', type: 'boolean' },
  ],
  collectibles: [
    { key: 'edition', label: 'Edition', type: 'text' },
    { key: 'grade', label: 'Grade', type: 'text' },
    { key: 'certification', label: 'Certification', type: 'text' },
    { key: 'rarity', label: 'Rarity', type: 'text' },
  ],
  figurines: [
    { key: 'artist_or_sculptor', label: 'Artist / Sculptor', type: 'text' },
    { key: 'series', label: 'Series', type: 'text' },
    { key: 'edition_number', label: 'Edition #', type: 'text' },
    { key: 'edition_size', label: 'Edition size', type: 'text' },
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'finish', label: 'Finish', type: 'text' },
    { key: 'dimensions', label: 'Dimensions', type: 'text' },
    { key: 'year_produced', label: 'Year produced', type: 'text' },
    { key: 'marks_signature', label: 'Marks / Signature', type: 'text' },
    { key: 'original_box', label: 'Original box', type: 'boolean' },
    { key: 'coa', label: 'Certificate of authenticity', type: 'boolean' },
    { key: 'retired', label: 'Retired', type: 'boolean' },
  ],
  ethnographic_art: [
    { key: 'culture_or_tribe', label: 'Culture / Tribe / Nation', type: 'text' },
    { key: 'artist', label: 'Artist', type: 'text' },
    { key: 'region', label: 'Region', type: 'text' },
    { key: 'period_or_era', label: 'Period / Era', type: 'text' },
    { key: 'materials', label: 'Materials', type: 'text' },
    { key: 'technique', label: 'Technique', type: 'text' },
    { key: 'hallmarks', label: 'Hallmarks / Marks', type: 'text' },
    { key: 'signed', label: 'Signed', type: 'boolean' },
    { key: 'certificate_authenticity', label: 'Certificate of authenticity', type: 'boolean' },
    { key: 'provenance', label: 'Provenance', type: 'textarea' },
    { key: 'dimensions', label: 'Dimensions', type: 'text' },
  ],
  decorative_arts: [
    { key: 'period_or_style', label: 'Period / Style', type: 'text' },
    { key: 'origin_country', label: 'Country of origin', type: 'text' },
    { key: 'maker_or_house', label: 'Maker / House', type: 'text' },
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'technique', label: 'Technique', type: 'text' },
    { key: 'marks', label: 'Marks', type: 'text' },
    { key: 'year_or_circa', label: 'Year / Circa', type: 'text' },
    { key: 'dimensions', label: 'Dimensions', type: 'text' },
    { key: 'provenance', label: 'Provenance', type: 'textarea' },
  ],
  pipes: [
    { key: 'maker', label: 'Maker', type: 'text' },
    { key: 'country_of_origin', label: 'Country of origin', type: 'text' },
    { key: 'shape', label: 'Shape', type: 'text' },
    { key: 'grade_or_grading', label: 'Grade / Grading', type: 'text' },
    { key: 'material', label: 'Material', type: 'text' },
    { key: 'stem_material', label: 'Stem material', type: 'text' },
    { key: 'finish', label: 'Finish', type: 'text' },
    { key: 'nomenclature', label: 'Nomenclature / Date stamps', type: 'text' },
    { key: 'year_made', label: 'Year made', type: 'text' },
    { key: 'chamber_diameter', label: 'Chamber diameter', type: 'text' },
    { key: 'length_inches', label: 'Length (in)', type: 'text' },
    { key: 'estate', label: 'Estate (pre-owned)', type: 'boolean' },
    { key: 'smoked', label: 'Smoked', type: 'boolean' },
  ],
  musical_instruments: [
    { key: 'instrument_type', label: 'Instrument type', type: 'text' },
    { key: 'maker', label: 'Maker', type: 'text' },
    { key: 'year_made', label: 'Year made', type: 'text' },
    { key: 'serial_number', label: 'Serial #', type: 'text' },
    { key: 'body_material', label: 'Body material', type: 'text' },
    { key: 'finish', label: 'Finish', type: 'text' },
    { key: 'case_included', label: 'Case included', type: 'boolean' },
  ],
  coins_currency: [
    { key: 'denomination', label: 'Denomination', type: 'text' },
    { key: 'year', label: 'Year', type: 'text' },
    { key: 'mint_mark', label: 'Mint mark', type: 'text' },
    { key: 'composition', label: 'Composition', type: 'text' },
    { key: 'grade', label: 'Grade', type: 'text' },
    { key: 'grading_service', label: 'Grading service', type: 'text' },
    { key: 'certification_number', label: 'Cert #', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
  ],
  stamps: [
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'issue_year', label: 'Issue year', type: 'text' },
    { key: 'scott_number', label: 'Scott #', type: 'text' },
    { key: 'denomination', label: 'Denomination', type: 'text' },
    { key: 'condition_grade', label: 'Condition grade', type: 'text' },
    { key: 'perforation', label: 'Perforation', type: 'text' },
    { key: 'centering', label: 'Centering', type: 'text' },
    { key: 'gum_condition', label: 'Gum condition', type: 'text' },
    { key: 'certification', label: 'Certification', type: 'text' },
  ],
  firearms: [
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'caliber_or_gauge', label: 'Caliber / Gauge', type: 'text' },
    { key: 'barrel_length', label: 'Barrel length', type: 'text' },
    { key: 'finish', label: 'Finish', type: 'text' },
    { key: 'stock_material', label: 'Stock material', type: 'text' },
    { key: 'year_manufactured', label: 'Year manufactured', type: 'text' },
    { key: 'nfa_status', label: 'NFA status', type: 'text' },
    { key: 'transfer_history', label: 'Transfer history', type: 'textarea' },
  ],
  wine_spirits: [
    { key: 'producer', label: 'Producer', type: 'text' },
    { key: 'region', label: 'Region', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'vintage', label: 'Vintage', type: 'text' },
    { key: 'bottle_size', label: 'Bottle size', type: 'text' },
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'abv', label: 'ABV', type: 'text' },
    { key: 'drink_window', label: 'Drink window', type: 'text' },
  ],
  appliances: [],
  apparel: [],
  tools: [],
  kitchenware: [],
  books_media: [],
  sporting: [],
  other: [],
};

export interface AttributeField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'boolean' | 'date' | 'number';
}

export const CATEGORY_TABLE_BY_SLUG: Partial<Record<CategorySlug, string>> = {
  art: 'item_attributes_art',
  electronics: 'item_attributes_electronics',
  jewelry: 'item_attributes_jewelry',
  furniture: 'item_attributes_furniture',
  watches: 'item_attributes_watches',
  collectibles: 'item_attributes_collectibles',
  figurines: 'item_attributes_figurines',
  ethnographic_art: 'item_attributes_ethnographic_art',
  decorative_arts: 'item_attributes_decorative_arts',
  pipes: 'item_attributes_pipes',
  musical_instruments: 'item_attributes_musical_instruments',
  coins_currency: 'item_attributes_coins_currency',
  stamps: 'item_attributes_stamps',
  firearms: 'item_attributes_firearms',
  wine_spirits: 'item_attributes_wine_spirits',
};
