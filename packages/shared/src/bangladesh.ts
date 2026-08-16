/**
 * Bangladesh's eight administrative divisions and the 64 districts inside them.
 *
 * Used for the architect's practice location: they pick a division and district
 * on the verification wizard, and land owners filter the directory by the same
 * two values. Storing a fixed code rather than free text is what makes the
 * filter an exact match instead of a fuzzy search over addresses.
 */
export const BD_DIVISIONS = [
  "Barishal",
  "Chattogram",
  "Dhaka",
  "Khulna",
  "Mymensingh",
  "Rajshahi",
  "Rangpur",
  "Sylhet",
] as const;

export type BdDivision = (typeof BD_DIVISIONS)[number];

/** Districts keyed by their division, each list alphabetical. */
export const BD_DISTRICTS: Record<BdDivision, readonly string[]> = {
  Barishal: ["Barguna", "Barishal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"],
  Chattogram: [
    "Bandarban",
    "Brahmanbaria",
    "Chandpur",
    "Chattogram",
    "Cox's Bazar",
    "Cumilla",
    "Feni",
    "Khagrachhari",
    "Lakshmipur",
    "Noakhali",
    "Rangamati",
  ],
  Dhaka: [
    "Dhaka",
    "Faridpur",
    "Gazipur",
    "Gopalganj",
    "Kishoreganj",
    "Madaripur",
    "Manikganj",
    "Munshiganj",
    "Narayanganj",
    "Narsingdi",
    "Rajbari",
    "Shariatpur",
    "Tangail",
  ],
  Khulna: [
    "Bagerhat",
    "Chuadanga",
    "Jashore",
    "Jhenaidah",
    "Khulna",
    "Kushtia",
    "Magura",
    "Meherpur",
    "Narail",
    "Satkhira",
  ],
  Mymensingh: ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"],
  Rajshahi: [
    "Bogura",
    "Chapai Nawabganj",
    "Joypurhat",
    "Naogaon",
    "Natore",
    "Pabna",
    "Rajshahi",
    "Sirajganj",
  ],
  Rangpur: [
    "Dinajpur",
    "Gaibandha",
    "Kurigram",
    "Lalmonirhat",
    "Nilphamari",
    "Panchagarh",
    "Rangpur",
    "Thakurgaon",
  ],
  Sylhet: ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"],
};

/** Every district, flat — used to validate a submitted district server-side. */
export const BD_ALL_DISTRICTS: readonly string[] = BD_DIVISIONS.flatMap((d) => BD_DISTRICTS[d]);

/** True when the district really belongs to the division (the form pairs them). */
export function isDistrictInDivision(division: string, district: string): boolean {
  const list = BD_DISTRICTS[division as BdDivision];
  return Array.isArray(list) && list.includes(district);
}

// ---------------------------------------------------------------------------
// Postcodes
//
// Bangladesh Post gives every district one contiguous block of four-digit
// codes, and the blocks are assigned by general post office rather than by
// division — which is why Khulna's districts sit at 9000+ while the rest of
// Khulna division is in the 7000s, and why Faridpur and Gopalganj are in the
// 7800s and 8100s despite being Dhaka division. Ranges below are the published
// district blocks, not a guess from the division layout.
//
// This is what makes "you say you live in Uttara, Dhaka but gave postcode 8402"
// a catchable typo. It's the block that's checked, not the exact office — the
// full ~600-office list would be a lot of table for no extra signal here.
// ---------------------------------------------------------------------------

/** First and last postcode of each district's block, inclusive. */
export const DISTRICT_POSTCODE_RANGES: Record<string, readonly [number, number]> = {
  // Barishal
  Barishal: [8200, 8299],
  Bhola: [8300, 8399],
  Jhalokati: [8400, 8499],
  Pirojpur: [8500, 8599],
  Patuakhali: [8600, 8699],
  Barguna: [8700, 8799],
  // Chattogram
  Brahmanbaria: [3400, 3499],
  Cumilla: [3500, 3599],
  Chandpur: [3600, 3699],
  Lakshmipur: [3700, 3799],
  Noakhali: [3800, 3899],
  Feni: [3900, 3999],
  Chattogram: [4000, 4399],
  Khagrachhari: [4400, 4499],
  Rangamati: [4500, 4599],
  Bandarban: [4600, 4699],
  "Cox's Bazar": [4700, 4799],
  // Dhaka
  Dhaka: [1000, 1399],
  Narayanganj: [1400, 1499],
  Munshiganj: [1500, 1599],
  Narsingdi: [1600, 1699],
  Gazipur: [1700, 1799],
  Manikganj: [1800, 1899],
  Tangail: [1900, 1999],
  Kishoreganj: [2300, 2399],
  Rajbari: [7700, 7799],
  Faridpur: [7800, 7899],
  Madaripur: [7900, 7999],
  Shariatpur: [8000, 8099],
  Gopalganj: [8100, 8199],
  // Khulna
  Kushtia: [7000, 7099],
  Meherpur: [7100, 7199],
  Chuadanga: [7200, 7299],
  Jhenaidah: [7300, 7399],
  Jashore: [7400, 7499],
  Narail: [7500, 7599],
  Magura: [7600, 7699],
  Khulna: [9000, 9299],
  Bagerhat: [9300, 9399],
  Satkhira: [9400, 9499],
  // Mymensingh
  Jamalpur: [2000, 2099],
  Sherpur: [2100, 2199],
  Mymensingh: [2200, 2299],
  Netrokona: [2400, 2499],
  // Rajshahi
  Bogura: [5800, 5899],
  Joypurhat: [5900, 5999],
  Rajshahi: [6000, 6299],
  "Chapai Nawabganj": [6300, 6399],
  Natore: [6400, 6499],
  Naogaon: [6500, 6599],
  Pabna: [6600, 6699],
  Sirajganj: [6700, 6799],
  // Rangpur
  Panchagarh: [5000, 5099],
  Thakurgaon: [5100, 5199],
  Dinajpur: [5200, 5299],
  Nilphamari: [5300, 5399],
  Rangpur: [5400, 5499],
  Lalmonirhat: [5500, 5599],
  Kurigram: [5600, 5699],
  Gaibandha: [5700, 5799],
  // Sylhet
  Sunamganj: [3000, 3099],
  Sylhet: [3100, 3199],
  Moulvibazar: [3200, 3299],
  Habiganj: [3300, 3399],
};

/** A Bangladeshi postcode is four digits; nothing else is worth checking. */
export function isPostcodeShape(raw: string | undefined): boolean {
  return /^\d{4}$/.test((raw ?? "").trim());
}

/**
 * Whether a postcode falls inside the district it was given for.
 *
 * `undefined` means there was nothing to compare — no postcode, no district,
 * or a district this table doesn't cover — which is "not checked", not
 * "doesn't match". Callers must keep the three states apart, the same way
 * nidMatchesDateOfBirth does.
 */
export function postcodeFitsDistrict(
  postcode: string | undefined,
  district: string | undefined
): boolean | undefined {
  if (!isPostcodeShape(postcode)) return undefined;

  const range = DISTRICT_POSTCODE_RANGES[(district ?? "").trim()];
  if (!range) return undefined;

  const value = Number((postcode ?? "").trim());
  return value >= range[0] && value <= range[1];
}

/** The district a postcode belongs to, for "did you mean …?" in a form. */
export function districtForPostcode(postcode: string | undefined): string | undefined {
  if (!isPostcodeShape(postcode)) return undefined;

  const value = Number((postcode ?? "").trim());
  return Object.keys(DISTRICT_POSTCODE_RANGES).find((district) => {
    const [low, high] = DISTRICT_POSTCODE_RANGES[district]!;
    return value >= low && value <= high;
  });
}
