// Regions Taxonomy - Canonical reference for region codes and country membership
// Non-negotiable rules:
// 1. Russia is excluded from everything
// 2. No overlap: each country belongs to exactly one region
// 3. Four canonical regions: ASPAC, AMERICAS, EMEC, IMEA

export const REGION_CODES = {
  ASPAC: 'ASPAC',
  AMERICAS: 'AMERICAS',
  EMEC: 'EMEC',
  IMEA: 'IMEA'
};

// Country membership by region
export const REGION_COUNTRIES = {
  ASPAC: [
    // East Asia
    'China', 'Japan', 'South Korea', 'North Korea', 'Mongolia', 'Taiwan', 'Hong Kong', 'Macau',
    
    // Southeast Asia
    'Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'Myanmar', 'Malaysia', 'Singapore',
    'Cambodia', 'Laos', 'Brunei', 'Timor-Leste',
    
    // South Asia (excluding India - India is in IMEA)
    'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Bhutan', 'Maldives', 'Afghanistan',
    
    // Oceania
    'Australia', 'New Zealand', 'Papua New Guinea', 'Fiji', 'Solomon Islands', 'Vanuatu',
    'Samoa', 'Tonga', 'Kiribati', 'Micronesia', 'Palau', 'Marshall Islands', 'Nauru', 'Tuvalu'
  ],
  
  AMERICAS: [
    // North America
    'United States', 'Canada', 'Mexico',
    
    // Central America
    'Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama',
    
    // Caribbean
    'Cuba', 'Jamaica', 'Haiti', 'Dominican Republic', 'Bahamas', 'Trinidad and Tobago',
    'Barbados', 'Grenada', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Antigua and Barbuda',
    'Dominica', 'Saint Kitts and Nevis',
    
    // South America
    'Brazil', 'Argentina', 'Colombia', 'Venezuela', 'Chile', 'Ecuador', 'Peru', 'Bolivia',
    'Paraguay', 'Uruguay', 'Guyana', 'Suriname', 'French Guiana'
  ],
  
  EMEC: [
    // Western Europe
    'United Kingdom', 'Ireland', 'France', 'Germany', 'Netherlands', 'Belgium', 'Luxembourg',
    'Switzerland', 'Austria', 'Liechtenstein', 'Monaco', 'Andorra',
    
    // Southern Europe
    'Spain', 'Portugal', 'Italy', 'Greece', 'Malta', 'Cyprus', 'San Marino', 'Vatican City',
    
    // Northern Europe
    'Norway', 'Sweden', 'Denmark', 'Finland', 'Iceland',
    
    // Eastern Europe (excluding Russia)
    'Poland', 'Czech Republic', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria',
    'Ukraine', 'Belarus', 'Moldova', 'Lithuania', 'Latvia', 'Estonia',
    'Serbia', 'Croatia', 'Bosnia and Herzegovina', 'Montenegro', 'North Macedonia',
    'Albania', 'Kosovo', 'Slovenia',
    
    // Caucasus
    'Armenia', 'Azerbaijan', 'Georgia',
    
    // Central Asia (former Soviet "Stan" countries, excluding Russia)
    'Kazakhstan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Uzbekistan',
    
    // Turkey and Iran
    'Turkey', 'Iran'
  ],
  
  IMEA: [
    // India (special member)
    'India',
    
    // Middle East (up to but not including Turkey and Iran)
    'Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'Yemen',
    'Iraq', 'Syria', 'Lebanon', 'Jordan', 'Israel', 'Palestine',
    
    // Africa - North
    'Egypt', 'Libya', 'Tunisia', 'Algeria', 'Morocco', 'Sudan', 'South Sudan',
    
    // Africa - West
    'Nigeria', 'Ghana', 'Ivory Coast', 'Senegal', 'Mali', 'Burkina Faso', 'Niger', 'Guinea',
    'Benin', 'Togo', 'Sierra Leone', 'Liberia', 'Mauritania', 'Gambia', 'Guinea-Bissau',
    'Cape Verde',
    
    // Africa - East
    'Kenya', 'Ethiopia', 'Tanzania', 'Uganda', 'Somalia', 'Eritrea', 'Djibouti', 'Rwanda',
    'Burundi',
    
    // Africa - Central
    'Democratic Republic of the Congo', 'Republic of the Congo', 'Central African Republic',
    'Chad', 'Cameroon', 'Gabon', 'Equatorial Guinea', 'São Tomé and Príncipe',
    
    // Africa - South
    'South Africa', 'Zimbabwe', 'Zambia', 'Botswana', 'Namibia', 'Mozambique', 'Angola',
    'Malawi', 'Lesotho', 'Eswatini', 'Madagascar', 'Mauritius', 'Comoros', 'Seychelles'
  ]
};

// Build reverse lookup: country -> region_code
const countryToRegionMap = {};
Object.entries(REGION_COUNTRIES).forEach(([regionCode, countries]) => {
  countries.forEach(country => {
    const normalizedCountry = country.toLowerCase();
    if (countryToRegionMap[normalizedCountry]) {
      console.error(`OVERLAP DETECTED: ${country} is in both ${countryToRegionMap[normalizedCountry]} and ${regionCode}`);
    }
    countryToRegionMap[normalizedCountry] = regionCode;
  });
});

/**
 * Get all countries belonging to a region
 * @param {string} regionCode - ASPAC, AMERICAS, EMEC, or IMEA
 * @returns {string[]} Array of country names
 */
export function getCountriesByRegion(regionCode) {
  if (!REGION_CODES[regionCode]) {
    throw new Error(`Invalid region code: ${regionCode}. Must be one of: ${Object.keys(REGION_CODES).join(', ')}`);
  }
  return REGION_COUNTRIES[regionCode] || [];
}

/**
 * Get the region code for a country
 * @param {string} countryName - Country name
 * @returns {string|null} Region code (ASPAC, AMERICAS, EMEC, IMEA) or null if not found
 */
export function getRegionByCountry(countryName) {
  if (!countryName) return null;
  
  const normalized = countryName.toLowerCase().trim();
  
  // Reject Russia explicitly
  if (normalized === 'russia' || normalized === 'russian federation') {
    throw new Error('Russia is not assigned to any region (excluded by policy)');
  }
  
  return countryToRegionMap[normalized] || null;
}

/**
 * Validate that a country is not Russia and belongs to exactly one region
 * @param {string} countryName - Country name
 * @returns {{valid: boolean, error?: string, regionCode?: string}}
 */
export function validateCountry(countryName) {
  if (!countryName) {
    return { valid: false, error: 'Country name is required' };
  }
  
  const normalized = countryName.toLowerCase().trim();
  
  // Check for Russia
  if (normalized === 'russia' || normalized === 'russian federation') {
    return { valid: false, error: 'Russia is excluded from all regions' };
  }
  
  // Check if country exists in taxonomy
  const regionCode = countryToRegionMap[normalized];
  if (!regionCode) {
    return { valid: false, error: `Country "${countryName}" not found in taxonomy` };
  }
  
  return { valid: true, regionCode };
}

/**
 * Get all region codes
 * @returns {string[]} Array of region codes
 */
export function getAllRegionCodes() {
  return Object.values(REGION_CODES);
}

/**
 * Get region display name (same as code for now, but allows for future customization)
 * @param {string} regionCode - Region code
 * @returns {string} Display name
 */
export function getRegionDisplayName(regionCode) {
  const displayNames = {
    ASPAC: 'ASPAC & China',
    AMERICAS: 'Americas',
    EMEC: 'EMEC',
    IMEA: 'IMEA',
    Global: 'Global',
  };
  return displayNames[regionCode] || regionCode;
}