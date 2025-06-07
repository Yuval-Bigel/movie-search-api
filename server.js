const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Genre code mapping (from filter.json schema)
const GENRE_CODE_TO_NAME = {
  1: 'Action',
  2: 'Adventure', 
  3: 'Animation',
  4: 'Biography',
  5: 'Comedy',
  6: 'Crime',
  7: 'Documentary',
  8: 'Drama',
  9: 'Family',
  10: 'Fantasy',
  11: 'Film-Noir',
  12: 'History',
  13: 'Horror',
  14: 'Music',
  15: 'Mystery',
  16: 'Romance',
  17: 'Sci-Fi',
  18: 'Sport',
  19: 'Thriller',
  20: 'War',
  21: 'Western'
};

// Valid filter fields (based on MovieFilter schema)
const VALID_FILTER_FIELDS = new Set([
  'title_ft', 'plot_ft', 'keywords_ft', 'id', 'director', 'cast', 'genre', 'subgenres',
  'release_year', 'createdAt', 'releaseDate', 'runtime_min', 'language_code', 'country_code',
  'color_mode', 'imdb_rating', 'rt_score', 'metascore', 'budget_usd', 'revenue_usd',
  'profit_margin_pct', 'award_wins', 'award_noms', 'franchise_flag'
]);

// Valid operators
const VALID_OPERATORS = new Set([
  'EQUAL', 'NOT', 'GT', 'GTE', 'LT', 'LTE', 'RANGE', 'IN', 'INCLUDES'
]);

// Valid sort fields
const VALID_SORT_FIELDS = new Set([
  'TITLE', 'RELEASEYEAR', 'RTSCORE', 'METASCORE', 'REVENUE'
]);

// Valid sort directions
const VALID_SORT_DIRECTIONS = new Set(['ASC', 'DESC']);

// Valid color modes
const VALID_COLOR_MODES = new Set(['COLOR', 'BW']);

// Valid Movie fields for projection (based on Movie type)
const VALID_MOVIE_FIELDS = new Set([
  'id', 'title', 'synopsis', 'genre', 'subgenres', 'director', 'cast', 
  'creationYear', 'createdAt', 'releaseDate', 'runtimeMinutes', 'language', 'country', 
  'colorMode', 'imdbRating', 'rtScore', 'metascore', 'budget', 'revenue', 
  'profitMargin', 'awardWins', 'awardNominations', 'franchise', 'posterUrl'
]);

// Default projection (all fields included, posterUrl always included unless explicitly set to "n")
const DEFAULT_PROJECTION = {
  id: 'y', title: 'y', synopsis: 'y', genre: 'y', subgenres: 'y', 
  director: 'y', cast: 'y', creationYear: 'y', createdAt: 'y', releaseDate: 'y',
  runtimeMinutes: 'y', language: 'y', country: 'y', colorMode: 'y', 
  imdbRating: 'y', rtScore: 'y', metascore: 'y', budget: 'y', 
  revenue: 'y', profitMargin: 'y', awardWins: 'y', awardNominations: 'y', 
  franchise: 'y', posterUrl: 'y'
};

// Field mapping from MovieFilter schema to actual movie data fields
const FIELD_MAPPING = {
  // Full-text search fields
  'title_ft': 'title',
  'plot_ft': 'synopsis',
  'keywords_ft': 'synopsis', // Using synopsis as keywords equivalent
  
  // Direct mappings
  'id': 'id',
  'director': 'director',
  'cast': 'cast',
  'genre': 'genre',
  'subgenres': 'subgenres',
  'release_year': 'creationYear',
  'createdAt': 'createdAt',
  'releaseDate': 'releaseDate',
  'runtime_min': 'runtimeMinutes',
  'language_code': 'language',
  'country_code': 'country',
  'color_mode': 'colorMode',
  'imdb_rating': 'imdbRating',
  'rt_score': 'rtScore',
  'metascore': 'metascore',
  'budget_usd': 'budget',
  'revenue_usd': 'revenue',
  'profit_margin_pct': 'profitMargin',
  'award_wins': 'awardWins',
  'award_noms': 'awardNominations',
  'franchise_flag': 'franchise'
};

// Validation functions
function validateFieldValue(field, value, operator) {
  // Genre validation - only accept numeric codes for genre field
  if (field === 'genre') {
    if (operator === 'IN') {
      if (!Array.isArray(value)) {
        throw new Error(`${field} field with IN operator must have array value, got: ${typeof value}`);
      }
      // Only allow numeric genre codes for genre field
      for (const v of value) {
        const genreCode = parseInt(v);
        if (isNaN(genreCode) || !GENRE_CODE_TO_NAME[genreCode]) {
          throw new Error(`Invalid genre code: ${v}. Must be a valid genre code (1-21)`);
        }
      }
    } else {
      const genreCode = parseInt(value);
      if (isNaN(genreCode) || !GENRE_CODE_TO_NAME[genreCode]) {
        throw new Error(`Invalid genre code: ${value}. Must be a valid genre code (1-21)`);
      }
    }
    return;
  }

  // Subgenres validation - accept string values
  if (field === 'subgenres') {
    if (operator === 'IN') {
      if (!Array.isArray(value)) {
        throw new Error(`${field} field with IN operator must have array value, got: ${typeof value}`);
      }
      // Allow string genre names for subgenres
      for (const v of value) {
        if (typeof v !== 'string' || v.trim().length === 0) {
          throw new Error(`Invalid subgenre value: ${v}. Must be a non-empty string`);
        }
      }
    } else {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Invalid subgenre value: ${value}. Must be a non-empty string`);
      }
    }
    return;
  }

  // Color mode validation
  if (field === 'color_mode') {
    if (operator === 'IN') {
      if (!Array.isArray(value)) {
        throw new Error(`Color mode field with IN operator must have array value`);
      }
      for (const v of value) {
        if (!VALID_COLOR_MODES.has(v)) {
          throw new Error(`Invalid color mode: ${v}. Must be COLOR or BW`);
        }
      }
    } else {
      if (!VALID_COLOR_MODES.has(value)) {
        throw new Error(`Invalid color mode: ${value}. Must be COLOR or BW`);
      }
    }
    return;
  }

  // Boolean field validation
  if (field === 'franchise_flag') {
    if (operator === 'IN') {
      if (!Array.isArray(value)) {
        throw new Error(`Boolean field with IN operator must have array value`);
      }
      for (const v of value) {
        if (typeof v !== 'boolean' && v !== 'true' && v !== 'false') {
          throw new Error(`Invalid boolean value: ${v}. Must be true or false`);
        }
      }
    } else {
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        throw new Error(`Invalid boolean value: ${value}. Must be true or false`);
      }
    }
    return;
  }

  // Numeric field validation
  const numericFields = ['release_year', 'runtime_min', 'imdb_rating', 'rt_score', 'metascore', 'budget_usd', 'revenue_usd', 'profit_margin_pct', 'award_wins', 'award_noms'];
  if (numericFields.includes(field)) {
    if (operator === 'RANGE') {
      if (!Array.isArray(value) || value.length !== 2) {
        throw new Error(`RANGE operator requires array with exactly 2 values`);
      }
      for (const v of value) {
        if (isNaN(Number(v))) {
          throw new Error(`Invalid numeric value in range: ${v}`);
        }
      }
    } else if (operator === 'IN') {
      if (!Array.isArray(value)) {
        throw new Error(`IN operator requires array value`);
      }
      for (const v of value) {
        if (isNaN(Number(v))) {
          throw new Error(`Invalid numeric value: ${v}`);
        }
      }
    } else {
      if (isNaN(Number(value))) {
        throw new Error(`Invalid numeric value: ${value}`);
      }
    }
    return;
  }

  // Date field validation
  if (field === 'createdAt' || field === 'releaseDate') {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (operator === 'IN') {
      if (!Array.isArray(value)) {
        throw new Error(`Date field with IN operator must have array value`);
      }
      for (const v of value) {
        if (!dateRegex.test(v)) {
          throw new Error(`Invalid date format: ${v}. Must be YYYY-MM-DD`);
        }
      }
    } else if (operator === 'RANGE') {
      if (!Array.isArray(value) || value.length !== 2) {
        throw new Error(`RANGE operator requires array with exactly 2 values`);
      }
      for (const v of value) {
        if (!dateRegex.test(v)) {
          throw new Error(`Invalid date format: ${v}. Must be YYYY-MM-DD`);
        }
      }
    } else {
      if (!dateRegex.test(value)) {
        throw new Error(`Invalid date format: ${value}. Must be YYYY-MM-DD`);
      }
    }
    return;
  }

  // String fields - basic validation
  if (typeof value !== 'string' && !Array.isArray(value)) {
    throw new Error(`Invalid value type for field ${field}: ${typeof value}`);
  }
}

function validateConditionString(conditionStr) {
  if (typeof conditionStr !== 'string') {
    throw new Error(`Condition must be a string, got: ${typeof conditionStr}`);
  }

  const patterns = [
    { regex: /^(\w+)\s+EQUAL\s+\{(.+)\}$/, operator: 'EQUAL' },
    { regex: /^(\w+)\s+NOT\s+\{(.+)\}$/, operator: 'NOT' },
    { regex: /^(\w+)\s+GT\s+\{(.+)\}$/, operator: 'GT' },
    { regex: /^(\w+)\s+GTE\s+\{(.+)\}$/, operator: 'GTE' },
    { regex: /^(\w+)\s+LT\s+\{(.+)\}$/, operator: 'LT' },
    { regex: /^(\w+)\s+LTE\s+\{(.+)\}$/, operator: 'LTE' },
    { regex: /^(\w+)\s+RANGE\s+\[(.+)\s*,\s*(.+)\]$/, operator: 'RANGE' },
    { regex: /^(\w+)\s+IN\s+\[(.+)\]$/, operator: 'IN' },
    { regex: /^(\w+)\s+INCLUDES\s+\{(.+)\}$/, operator: 'INCLUDES' }
  ];

  let matched = false;
  for (const pattern of patterns) {
    const match = conditionStr.match(pattern.regex);
    if (match) {
      matched = true;
      const field = match[1];
      const operator = pattern.operator;

      // Validate field name
      if (!VALID_FILTER_FIELDS.has(field)) {
        throw new Error(`Invalid field name: ${field}. Valid fields: ${Array.from(VALID_FILTER_FIELDS).join(', ')}`);
      }

      // Validate operator
      if (!VALID_OPERATORS.has(operator)) {
        throw new Error(`Invalid operator: ${operator}. Valid operators: ${Array.from(VALID_OPERATORS).join(', ')}`);
      }

      // Validate value based on operator
      if (operator === 'RANGE') {
        const values = [match[2].trim(), match[3].trim()];
        validateFieldValue(field, values, operator);
      } else if (operator === 'IN') {
        const values = match[2].split(',').map(v => v.trim());
        validateFieldValue(field, values, operator);
      } else {
        validateFieldValue(field, match[2], operator);
      }
      break;
    }
  }

  if (!matched) {
    throw new Error(`Invalid condition format: ${conditionStr}. Must match pattern: field OPERATOR {value} or field RANGE [low, high] or field IN [val1, val2]`);
  }
}

function validateMultiMatch(multiMatch) {
  if (!multiMatch || typeof multiMatch !== 'object') {
    return; // Optional field
  }

  // Validate required fields
  if (!multiMatch.fields || !Array.isArray(multiMatch.fields)) {
    throw new Error(`multiMatch.fields must be an array`);
  }

  if (!multiMatch.query || typeof multiMatch.query !== 'string') {
    throw new Error(`multiMatch.query must be a non-empty string`);
  }

  // Validate field names
  for (const field of multiMatch.fields) {
    if (!VALID_FILTER_FIELDS.has(field)) {
      throw new Error(`Invalid multiMatch field: ${field}. Valid fields: ${Array.from(VALID_FILTER_FIELDS).join(', ')}`);
    }
  }

  // Validate optional fields
  if (multiMatch.operator && !['AND', 'OR'].includes(multiMatch.operator)) {
    throw new Error(`Invalid multiMatch operator: ${multiMatch.operator}. Must be AND or OR`);
  }

  if (multiMatch.fuzziness !== undefined) {
    const fuzz = Number(multiMatch.fuzziness);
    if (isNaN(fuzz) || fuzz < 0 || fuzz > 2) {
      throw new Error(`Invalid fuzziness: ${multiMatch.fuzziness}. Must be 0, 1, or 2`);
    }
  }

  // Check for unexpected properties
  const validProps = new Set(['fields', 'query', 'operator', 'fuzziness']);
  for (const prop in multiMatch) {
    if (!validProps.has(prop)) {
      throw new Error(`Unexpected property in multiMatch: ${prop}`);
    }
  }
}

function validateSort(sort) {
  if (!sort || typeof sort !== 'object') {
    return; // Optional field
  }

  if (!sort.field || !VALID_SORT_FIELDS.has(sort.field)) {
    throw new Error(`Invalid sort field: ${sort.field}. Valid fields: ${Array.from(VALID_SORT_FIELDS).join(', ')}`);
  }

  if (sort.direction && !VALID_SORT_DIRECTIONS.has(sort.direction)) {
    throw new Error(`Invalid sort direction: ${sort.direction}. Must be ASC or DESC`);
  }

  // Check for unexpected properties
  const validProps = new Set(['field', 'direction']);
  for (const prop in sort) {
    if (!validProps.has(prop)) {
      throw new Error(`Unexpected property in sort: ${prop}`);
    }
  }
}

function validatePage(page) {
  if (!page || typeof page !== 'object') {
    return; // Optional field
  }

  if (page.size !== undefined) {
    const size = Number(page.size);
    if (isNaN(size) || size < 1 || size > 50) {
      throw new Error(`Invalid page size: ${page.size}. Must be 1-50`);
    }
  }

  if (page.offset !== undefined) {
    const offset = Number(page.offset);
    if (isNaN(offset) || offset < 0) {
      throw new Error(`Invalid page offset: ${page.offset}. Must be >= 0`);
    }
  }

  // Check for unexpected properties
  const validProps = new Set(['size', 'offset']);
  for (const prop in page) {
    if (!validProps.has(prop)) {
      throw new Error(`Unexpected property in page: ${prop}`);
    }
  }
}

function validateProjection(projection) {
  if (!projection || typeof projection !== 'object') {
    return; // Optional field
  }

  // Validate each field in projection
  for (const field in projection) {
    // Check if field is valid
    if (!VALID_MOVIE_FIELDS.has(field)) {
      throw new Error(`Invalid projection field: ${field}. Valid fields: ${Array.from(VALID_MOVIE_FIELDS).join(', ')}`);
    }

    // Check if value is valid
    const value = projection[field];
    if (value !== 'y' && value !== 'n') {
      throw new Error(`Invalid projection value for field ${field}: ${value}. Must be "y" or "n"`);
    }
  }
}

function validateFilter(filter) {
  if (!filter || typeof filter !== 'object') {
    throw new Error(`Filter must be an object`);
  }

  // Validate match array - now supports grouped conditions with AND/OR
  if (filter.match) {
    if (!Array.isArray(filter.match)) {
      throw new Error(`filter.match must be an array`);
    }
    
    // Check for cast field restriction across all conditions
    let hasCastFilter = false;
    let hasReleaseYearFilter = false;
    
    for (const item of filter.match) {
      if (typeof item === 'string') {
        // Simple condition string
        validateConditionString(item);
        
        if (item.includes('cast ')) {
          hasCastFilter = true;
        }
        if (item.includes('release_year ')) {
          hasReleaseYearFilter = true;
        }
      } else if (typeof item === 'object' && item.group && item.operator) {
        // Grouped conditions: { group: ["condition1", "condition2"], operator: "AND" }
        if (!Array.isArray(item.group)) {
          throw new Error(`Group must be an array of condition strings`);
        }
        if (!['AND', 'OR'].includes(item.operator)) {
          throw new Error(`Group operator must be AND or OR`);
        }
        
        for (const condition of item.group) {
          validateConditionString(condition);
          
          if (condition.includes('cast ')) {
            hasCastFilter = true;
          }
          if (condition.includes('release_year ')) {
            hasReleaseYearFilter = true;
          }
        }
      } else {
        throw new Error(`Match array items must be condition strings or group objects with {group: [...], operator: "AND|OR"}`);
      }
    }
    
    // Enforce cast field restriction
    if (hasCastFilter && !hasReleaseYearFilter) {
      throw new Error(`Cast field filtering requires a release_year filter to be present in the same query`);
    }
  }

  // Validate topLevelOperator (how to combine top-level items)
  if (filter.topLevelOperator && !['AND', 'OR'].includes(filter.topLevelOperator)) {
    throw new Error(`Invalid topLevelOperator: ${filter.topLevelOperator}. Must be AND or OR`);
  }
  
  // Validate multiMatch
  if (filter.multiMatch) {
    validateMultiMatch(filter.multiMatch);
  }

  // Check for unexpected properties
  const validProps = new Set(['match', 'topLevelOperator', 'multiMatch']);
  for (const prop in filter) {
    if (!validProps.has(prop)) {
      throw new Error(`Unexpected property in filter: ${prop}`);
    }
  }

  // At least one filter condition is required
  if ((!filter.match || filter.match.length === 0) && !filter.multiMatch) {
    throw new Error(`Filter must contain at least one condition in 'match' array or 'multiMatch' object`);
  }
}

// Rule validation functions
function validateRuleCompliance(query) {
  // Rule: Director names must be wrapped in double quotes inside the curly braces
  if (query.filter && query.filter.match) {
    for (const item of query.filter.match) {
      const conditions = typeof item === 'string' ? [item] : (item.group || []);
      for (const condition of conditions) {
        if (condition.includes('director EQUAL')) {
          const match = condition.match(/director\s+EQUAL\s+\{(.+)\}/);
          if (match) {
            const value = match[1];
            // Must be wrapped in double quotes
            if (!value.startsWith('"') || !value.endsWith('"')) {
              throw new Error('Invalid query');
            }
          }
        }
      }
    }
  }

  // Rule: Color mode values must be uppercase
  if (query.filter && query.filter.match) {
    for (const item of query.filter.match) {
      const conditions = typeof item === 'string' ? [item] : (item.group || []);
      for (const condition of conditions) {
        if (condition.includes('color_mode') || condition.includes('colorMode')) {
          const match = condition.match(/color_mode\s+\w+\s+\{(.+)\}/) || condition.match(/colorMode\s+\w+\s+\{(.+)\}/);
          if (match) {
            const value = match[1];
            if (value !== 'COLOR' && value !== 'BW') {
              throw new Error('Invalid query');
            }
          }
        }
      }
    }
  }

  // Rule: Language codes must be lowercase
  if (query.filter && query.filter.match) {
    for (const item of query.filter.match) {
      const conditions = typeof item === 'string' ? [item] : (item.group || []);
      for (const condition of conditions) {
        if (condition.includes('language_code')) {
          const match = condition.match(/language_code\s+\w+\s+\{(.+)\}/);
          if (match) {
            const value = match[1];
            // Must be lowercase (no uppercase letters)
            if (value !== value.toLowerCase()) {
              throw new Error('Invalid query');
            }
          }
        }
      }
    }
  }

  // Rule: When filtering by multiple genres using IN operator, genres must be in alphabetical order
  if (query.filter && query.filter.match) {
    for (const item of query.filter.match) {
      const conditions = typeof item === 'string' ? [item] : (item.group || []);
      for (const condition of conditions) {
        if (condition.includes('genre IN')) {
          const match = condition.match(/genre\s+IN\s+\[(.+)\]/);
          if (match) {
            const genresStr = match[1];
            const genres = genresStr.split(',').map(g => g.trim());
            const sortedGenres = [...genres].sort();
            if (JSON.stringify(genres) !== JSON.stringify(sortedGenres)) {
              throw new Error('Invalid query');
            }
          }
        }
      }
    }
  }

  // Rule: When filtering by title, partial matches require CONTAINS, exact matches must use EQUAL with full title in quotes
  if (query.filter && query.filter.match) {
    for (const item of query.filter.match) {
      const conditions = typeof item === 'string' ? [item] : (item.group || []);
      for (const condition of conditions) {
        if (condition.includes('title_ft EQUAL')) {
          const match = condition.match(/title_ft\s+EQUAL\s+\{(.+)\}/);
          if (match) {
            const value = match[1];
            // For exact matches with EQUAL, must be wrapped in quotes
            if (!value.startsWith('"') || !value.endsWith('"')) {
              throw new Error('Invalid query');
            }
          }
        }
      }
    }
  }

  // Rule: Subgenre filters are case-sensitive and must match exactly
  if (query.filter && query.filter.match) {
    for (const item of query.filter.match) {
      const conditions = typeof item === 'string' ? [item] : (item.group || []);
      for (const condition of conditions) {
        if (condition.includes('subgenres')) {
          const match = condition.match(/subgenres\s+\w+\s+\{(.+)\}/);
          if (match) {
            const value = match[1];
            // Check if it's a known subgenre with proper casing
            const validSubgenres = [
              'Comedy-Drama', 'Cyberpunk', 'Epic Fantasy', 'Gangster', 'Holocaust',
              'Mafia', 'Neo-noir', 'Prison', 'Psychological Drama', 'Psychological Thriller',
              'Space Opera', 'Superhero', 'Urban Drama'
            ];
            if (validSubgenres.includes(value)) {
              // Must match exactly (case-sensitive)
              const lowerValue = value.toLowerCase();
              const correctCase = validSubgenres.find(sg => sg.toLowerCase() === lowerValue);
              if (correctCase && value !== correctCase) {
                throw new Error('Invalid query');
              }
            }
          }
        }
      }
    }
  }

  // Rule: Runtime filters using "about" or "around" should use RANGE of ±15 minutes
  // This would be validated during query interpretation, but we can check for proper RANGE usage
  if (query.filter && query.filter.match) {
    for (const item of query.filter.match) {
      const conditions = typeof item === 'string' ? [item] : (item.group || []);
      for (const condition of conditions) {
        if (condition.includes('runtime_min RANGE')) {
          const match = condition.match(/runtime_min\s+RANGE\s+\[(.+),\s*(.+)\]/);
          if (match) {
            const low = parseInt(match[1]);
            const high = parseInt(match[2]);
            // For "about" queries, should be ±15 minutes
            if (Math.abs(high - low) !== 30) {
              // This is a soft rule - we won't enforce it strictly
              // but it's documented for the AI assistant
            }
          }
        }
      }
    }
  }
}

function validateSemanticRules(query, userQuery = '') {
  const lowerUserQuery = userQuery.toLowerCase();

  // Rule: When someone asks for "popular" movies without specifying metric, use revenue sorting
  if (lowerUserQuery.includes('popular') && !lowerUserQuery.includes('rating') && !lowerUserQuery.includes('score')) {
    if (query.sort && query.sort.field !== 'REVENUE') {
      throw new Error('Invalid query');
    }
  }

  // Rule: "recent" movies means last 3 years, "new" movies means current year only
  const currentYear = new Date().getFullYear();
  if (lowerUserQuery.includes('recent') && !lowerUserQuery.includes('new')) {
    // Should filter by release_year >= currentYear - 3
    if (query.filter && query.filter.match) {
      let hasRecentFilter = false;
      for (const item of query.filter.match) {
        const conditions = typeof item === 'string' ? [item] : (item.group || []);
        for (const condition of conditions) {
          if (condition.includes('release_year GTE') && condition.includes(`{${currentYear - 3}}`)) {
            hasRecentFilter = true;
          }
        }
      }
      if (!hasRecentFilter) {
        throw new Error('Invalid query');
      }
    }
  }

  if (lowerUserQuery.includes('new') && !lowerUserQuery.includes('recent')) {
    // Should filter by release_year = currentYear
    if (query.filter && query.filter.match) {
      let hasNewFilter = false;
      for (const item of query.filter.match) {
        const conditions = typeof item === 'string' ? [item] : (item.group || []);
        for (const condition of conditions) {
          if (condition.includes('release_year EQUAL') && condition.includes(`{${currentYear}}`)) {
            hasNewFilter = true;
          }
        }
      }
      if (!hasNewFilter) {
        throw new Error('Invalid query');
      }
    }
  }

  // Rule: "classic" means before 1980
  if (lowerUserQuery.includes('classic')) {
    if (query.filter && query.filter.match) {
      let hasClassicFilter = false;
      for (const item of query.filter.match) {
        const conditions = typeof item === 'string' ? [item] : (item.group || []);
        for (const condition of conditions) {
          if (condition.includes('release_year LT {1980}')) {
            hasClassicFilter = true;
          }
        }
      }
      if (!hasClassicFilter) {
        throw new Error('Invalid query');
      }
    }
  }

  // Rule: "short" = less than 90 minutes, "long" = more than 2 hours (120 minutes)
  if (lowerUserQuery.includes('short') && !lowerUserQuery.includes('long')) {
    if (query.filter && query.filter.match) {
      let hasShortFilter = false;
      for (const item of query.filter.match) {
        const conditions = typeof item === 'string' ? [item] : (item.group || []);
        for (const condition of conditions) {
          if (condition.includes('runtime_min LT {90}')) {
            hasShortFilter = true;
          }
        }
      }
      if (!hasShortFilter) {
        throw new Error('Invalid query');
      }
    }
  }

  if (lowerUserQuery.includes('long') && !lowerUserQuery.includes('short')) {
    if (query.filter && query.filter.match) {
      let hasLongFilter = false;
      for (const item of query.filter.match) {
        const conditions = typeof item === 'string' ? [item] : (item.group || []);
        for (const condition of conditions) {
          if (condition.includes('runtime_min GT {120}')) {
            hasLongFilter = true;
          }
        }
      }
      if (!hasLongFilter) {
        throw new Error('Invalid query');
      }
    }
  }

  // Rule: If request uses "best" or "top" but gives no sorting guidance, order by critics' aggregate score
  if ((lowerUserQuery.includes('best') || lowerUserQuery.includes('top')) && 
      !lowerUserQuery.includes('revenue') && !lowerUserQuery.includes('box office') && 
      !lowerUserQuery.includes('popular')) {
    if (!query.sort || (query.sort.field !== 'RTSCORE' && query.sort.field !== 'METASCORE')) {
      throw new Error('Invalid query');
    }
  }

  // Rule: For "family" queries, exclude horror, thriller, crime and require high critical approval
  if (lowerUserQuery.includes('family')) {
    if (query.filter && query.filter.match) {
      let hasGenreExclusion = false;
      let hasRatingRequirement = false;
      
      for (const item of query.filter.match) {
        const conditions = typeof item === 'string' ? [item] : (item.group || []);
        for (const condition of conditions) {
          // Should exclude horror (13), thriller (19), crime (6)
          if (condition.includes('genre NOT') && 
              (condition.includes('{13}') || condition.includes('{19}') || condition.includes('{6}'))) {
            hasGenreExclusion = true;
          }
          // Should require high ratings
          if ((condition.includes('rt_score GTE') || condition.includes('imdb_rating GTE')) &&
              (condition.includes('{7') || condition.includes('{8') || condition.includes('{9'))) {
            hasRatingRequirement = true;
          }
        }
      }
      
      if (!hasGenreExclusion || !hasRatingRequirement) {
        throw new Error('Invalid query');
      }
    }
  }

  // Rule: If asked about an animated movie, should only show animated movies
  if (lowerUserQuery.includes('animated') || lowerUserQuery.includes('animation')) {
    if (query.filter && query.filter.match) {
      let hasAnimationFilter = false;
      for (const item of query.filter.match) {
        const conditions = typeof item === 'string' ? [item] : (item.group || []);
        for (const condition of conditions) {
          // Should filter by animation genre (3)
          if (condition.includes('genre EQUAL {3}')) {
            hasAnimationFilter = true;
          }
        }
      }
      if (!hasAnimationFilter) {
        throw new Error('Invalid query');
      }
    }
  }

  // Rule: When a country is specified but no language is mentioned, assume the film should be in English
  const countryMentioned = lowerUserQuery.includes('american') || lowerUserQuery.includes('british') || 
                          lowerUserQuery.includes('french') || lowerUserQuery.includes('german') ||
                          lowerUserQuery.includes('japanese') || lowerUserQuery.includes('italian');
  const languageMentioned = lowerUserQuery.includes('language') || lowerUserQuery.includes('english') ||
                           lowerUserQuery.includes('french') || lowerUserQuery.includes('spanish') ||
                           lowerUserQuery.includes('german') || lowerUserQuery.includes('japanese');
  
  if (countryMentioned && !languageMentioned) {
    if (query.filter && query.filter.match) {
      let hasEnglishFilter = false;
      for (const item of query.filter.match) {
        const conditions = typeof item === 'string' ? [item] : (item.group || []);
        for (const condition of conditions) {
          if (condition.includes('language_code EQUAL {en}')) {
            hasEnglishFilter = true;
          }
        }
      }
      if (!hasEnglishFilter) {
        throw new Error('Invalid query');
      }
    }
  }

  // Rule: Provide financial details only when the user specifically asks about money
  const financialMentioned = lowerUserQuery.includes('budget') || lowerUserQuery.includes('revenue') ||
                            lowerUserQuery.includes('box office') || lowerUserQuery.includes('profit') ||
                            lowerUserQuery.includes('money') || lowerUserQuery.includes('earnings') ||
                            lowerUserQuery.includes('gross') || lowerUserQuery.includes('cost');
  
  if (!financialMentioned && query.projection) {
    // Should not include financial fields in projection unless specifically asked
    const financialFields = ['budget', 'revenue', 'profitMargin'];
    for (const field of financialFields) {
      if (query.projection[field] === 'y') {
        throw new Error('Invalid query');
      }
    }
  }

  // Rule: Omit plot summaries for films released in the last 5 years
  const recentReleaseFilter = query.filter && query.filter.match && 
    query.filter.match.some(item => {
      const conditions = typeof item === 'string' ? [item] : (item.group || []);
      return conditions.some(condition => 
        condition.includes('release_year GTE') && 
        condition.includes(`{${currentYear - 5}}`)
      );
    });

  if (recentReleaseFilter && query.projection && query.projection.synopsis === 'y') {
    throw new Error('Invalid query');
  }
}

function validateQuery(query, userQuery = '') {
  if (!query || typeof query !== 'object') {
    throw new Error(`Query must be a JSON object`);
  }

  // Check for unexpected top-level properties
  const validProps = new Set(['filter', 'sort', 'page', 'projection']);
  for (const prop in query) {
    if (!validProps.has(prop)) {
      throw new Error(`Unexpected property in query: ${prop}`);
    }
  }

  // Filter is required
  if (!query.filter) {
    throw new Error(`Query must contain a 'filter' object`);
  }

  validateFilter(query.filter);

  if (query.sort) {
    validateSort(query.sort);
  }

  if (query.page) {
    validatePage(query.page);
  }

  if (query.projection) {
    validateProjection(query.projection);
  }

  // Apply rule compliance validation
  validateRuleCompliance(query);
  
  // Apply semantic rule validation if user query is provided
  if (userQuery) {
    validateSemanticRules(query, userQuery);
  }
}

// Load movie database
let moviesData = [];
try {
  const data = fs.readFileSync('./film-db.json', 'utf8');
  moviesData = JSON.parse(data);
  console.log(`Loaded ${moviesData.length} movies from database`);
} catch (error) {
  console.error('Error loading movie database:', error);
}

// Helper function to map filter field to movie field
function mapFilterField(filterField) {
  return FIELD_MAPPING[filterField] || filterField;
}

// Helper function to convert genre code to name
function convertGenreValue(field, value) {
  // Handle genre field - convert numeric codes to genre names
  if (field === 'genre') {
    if (Array.isArray(value)) {
      // Handle arrays (for IN operator)
      return value.map(v => {
        const genreCode = parseInt(v);
        return GENRE_CODE_TO_NAME[genreCode] || v;
      });
    } else {
      // Handle single values
      const genreCode = parseInt(value);
      return GENRE_CODE_TO_NAME[genreCode] || value;
    }
  }
  
  // Handle title_ft field - strip quotes for exact matching
  if (field === 'title_ft' && typeof value === 'string') {
    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
  }
  
  return value;
}

// Helper function to parse filter conditions
function parseFilterCondition(condition) {
  const patterns = [
    { regex: /^(\w+)\s+EQUAL\s+\{(.+)\}$/, operator: 'EQUAL' },
    { regex: /^(\w+)\s+NOT\s+\{(.+)\}$/, operator: 'NOT' },
    { regex: /^(\w+)\s+GT\s+\{(.+)\}$/, operator: 'GT' },
    { regex: /^(\w+)\s+GTE\s+\{(.+)\}$/, operator: 'GTE' },
    { regex: /^(\w+)\s+LT\s+\{(.+)\}$/, operator: 'LT' },
    { regex: /^(\w+)\s+LTE\s+\{(.+)\}$/, operator: 'LTE' },
    { regex: /^(\w+)\s+RANGE\s+\[(.+)\s*,\s*(.+)\]$/, operator: 'RANGE' },
    { regex: /^(\w+)\s+IN\s+\[(.+)\]$/, operator: 'IN' },
    { regex: /^(\w+)\s+INCLUDES\s+\{(.+)\}$/, operator: 'INCLUDES' }
  ];

  for (const pattern of patterns) {
    const match = condition.match(pattern.regex);
    if (match) {
      const filterField = match[1];
      const movieField = mapFilterField(filterField);
      
      if (pattern.operator === 'RANGE') {
        const lowValue = convertGenreValue(filterField, match[2].trim());
        const highValue = convertGenreValue(filterField, match[3].trim());
        return {
          field: movieField,
          operator: pattern.operator,
          value: [lowValue, highValue],
          originalField: filterField
        };
      } else if (pattern.operator === 'IN') {
        const values = match[2].split(',').map(v => convertGenreValue(filterField, v.trim()));
        return {
          field: movieField,
          operator: pattern.operator,
          value: values,
          originalField: filterField
        };
      } else {
        const convertedValue = convertGenreValue(filterField, match[2]);
        return {
          field: movieField,
          operator: pattern.operator,
          value: convertedValue,
          originalField: filterField
        };
      }
    }
  }
  return null;
}

// Helper function to apply filter condition to a movie
function applyFilterCondition(movie, condition) {
  const { field, operator, value, originalField } = condition;
  const movieValue = movie[field];

  if (movieValue === undefined || movieValue === null) {
    return false;
  }

  // Handle date fields specially
  const isDateField = originalField === 'createdAt' || originalField === 'releaseDate';

  switch (operator) {
    case 'EQUAL':
      if (Array.isArray(movieValue)) {
        // For array fields like subgenres, check if any element matches
        return movieValue.some(item => String(item).toLowerCase() === String(value).toLowerCase());
      }
      return String(movieValue).toLowerCase() === String(value).toLowerCase();
    case 'NOT':
      if (Array.isArray(movieValue)) {
        // For array fields like subgenres, check that no element matches
        return !movieValue.some(item => String(item).toLowerCase() === String(value).toLowerCase());
      }
      return String(movieValue).toLowerCase() !== String(value).toLowerCase();
    case 'GT':
      if (isDateField) {
        return String(movieValue) > String(value);
      }
      return Number(movieValue) > Number(value);
    case 'GTE':
      if (isDateField) {
        return String(movieValue) >= String(value);
      }
      return Number(movieValue) >= Number(value);
    case 'LT':
      if (isDateField) {
        return String(movieValue) < String(value);
      }
      return Number(movieValue) < Number(value);
    case 'LTE':
      if (isDateField) {
        return String(movieValue) <= String(value);
      }
      return Number(movieValue) <= Number(value);
    case 'RANGE':
      if (isDateField) {
        return String(movieValue) >= String(value[0]) && String(movieValue) <= String(value[1]);
      }
      const numValue = Number(movieValue);
      return numValue >= Number(value[0]) && numValue <= Number(value[1]);
    case 'IN':
      if (Array.isArray(movieValue)) {
        // For array fields like subgenres, check if any movie value matches any search value
        return movieValue.some(item => 
          value.some(v => String(item).toLowerCase() === String(v).toLowerCase())
        );
      }
      return value.some(v => String(movieValue).toLowerCase() === String(v).toLowerCase());
    case 'INCLUDES':
      if (Array.isArray(movieValue)) {
        return movieValue.some(item => String(item).toLowerCase().includes(String(value).toLowerCase()));
      }
      return String(movieValue).toLowerCase().includes(String(value).toLowerCase());
    default:
      return false;
  }
}

// Helper function to apply multi-match search
function applyMultiMatch(movie, multiMatch) {
  if (!multiMatch || !multiMatch.fields || !multiMatch.query) {
    return true;
  }

  const { fields, query, operator = 'OR', fuzziness = 0 } = multiMatch;
  const searchQuery = query.toLowerCase();
  
  const matches = fields.map(filterField => {
    // Map filter field to movie field
    const movieField = mapFilterField(filterField);
    const fieldValue = movie[movieField];
    
    if (!fieldValue) return false;
    
    // Handle array fields (like subgenres)
    if (Array.isArray(fieldValue)) {
      return fieldValue.some(item => {
        const valueStr = String(item).toLowerCase();
        if (fuzziness === 0) {
          return valueStr.includes(searchQuery);
        } else {
          // Basic fuzzy matching - allow some character differences
          const words = searchQuery.split(' ');
          return words.some(word => valueStr.includes(word));
        }
      });
    }
    
    // Handle single value fields
    const valueStr = String(fieldValue).toLowerCase();
    
    // Simple fuzzy matching - check if query is contained in field value
    if (fuzziness === 0) {
      return valueStr.includes(searchQuery);
    } else {
      // Basic fuzzy matching - allow some character differences
      const words = searchQuery.split(' ');
      return words.some(word => valueStr.includes(word));
    }
  });

  return operator === 'OR' ? matches.some(m => m) : matches.every(m => m);
}

// Helper function to sort movies
function sortMovies(movies, sortInput) {
  if (!sortInput || !sortInput.field) {
    return movies;
  }

  const { field, direction = 'ASC' } = sortInput;
  
  return movies.sort((a, b) => {
    let aValue = a[field.toLowerCase()] || a[field];
    let bValue = b[field.toLowerCase()] || b[field];
    
    // Handle different field mappings
    if (field === 'RELEASEYEAR') {
      aValue = a.creationYear;
      bValue = b.creationYear;
    } else if (field === 'RTSCORE') {
      aValue = a.rtScore;
      bValue = b.rtScore;
    } else if (field === 'METASCORE') {
      aValue = a.metascore;
      bValue = b.metascore;
    } else if (field === 'REVENUE') {
      aValue = a.revenue;
      bValue = b.revenue;
    } else if (field === 'TITLE') {
      aValue = a.title;
      bValue = b.title;
    }

    if (aValue === null || aValue === undefined) aValue = '';
    if (bValue === null || bValue === undefined) bValue = '';

    let comparison = 0;
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else {
      comparison = Number(aValue) - Number(bValue);
    }

    return direction === 'DESC' ? -comparison : comparison;
  });
}

// Helper function to apply projection to movies
function applyProjection(movies, projection) {
  if (!projection) {
    return movies; // No projection specified, return all fields
  }

  return movies.map(movie => {
    const projectedMovie = {};
    
    // Always include posterUrl unless explicitly set to "n"
    if (!projection.hasOwnProperty('posterUrl') || projection.posterUrl === 'y') {
      projectedMovie.posterUrl = movie.posterUrl;
    }
    
    // Include only fields that are explicitly set to "y"
    for (const field in projection) {
      if (projection[field] === 'y' && movie.hasOwnProperty(field)) {
        projectedMovie[field] = movie[field];
      }
    }
    
    return projectedMovie;
  });
}

// API Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/search', (req, res) => {
  try {
    // Strict JSON validation
    let parsedBody;
    try {
      // Ensure the request body is valid JSON
      if (typeof req.body === 'string') {
        parsedBody = JSON.parse(req.body);
      } else {
        parsedBody = req.body;
      }
    } catch (parseError) {
      return res.status(400).json({ 
        error: 'Invalid query'
      });
    }

    // Extract userQuery for semantic validation (optional)
    const { userQuery, ...queryData } = parsedBody;

    // Strict query validation
    try {
      validateQuery(queryData, userQuery || '');
    } catch (validationError) {
      return res.status(400).json({ 
        error: 'Invalid query'
      });
    }

    const { filter, sort, page, projection } = queryData;
    let filteredMovies = [...moviesData];

    // Apply filters
    if (filter && filter.match && Array.isArray(filter.match)) {
      const topLevelOperator = filter.topLevelOperator || 'AND'; // Default to AND
      
      filteredMovies = filteredMovies.filter(movie => {
        // Process each item in the match array
        const results = filter.match.map(item => {
          if (typeof item === 'string') {
            // Simple condition string
            const condition = parseFilterCondition(item);
            return condition ? applyFilterCondition(movie, condition) : false;
          } else if (typeof item === 'object' && item.group && item.operator) {
            // Grouped conditions
            const groupResults = item.group.map(conditionStr => {
              const condition = parseFilterCondition(conditionStr);
              return condition ? applyFilterCondition(movie, condition) : false;
            });
            
            // Apply the group operator
            return item.operator === 'OR' 
              ? groupResults.some(result => result)  // Any condition in group must be true
              : groupResults.every(result => result); // All conditions in group must be true
          }
          return false;
        });
        
        // Apply top-level operator to combine results
        return topLevelOperator === 'OR'
          ? results.some(result => result)    // Any top-level item must be true
          : results.every(result => result);  // All top-level items must be true
      });
    }

    // Apply multi-match search
    if (filter && filter.multiMatch) {
      filteredMovies = filteredMovies.filter(movie => applyMultiMatch(movie, filter.multiMatch));
    }

    // Sort results
    if (sort) {
      filteredMovies = sortMovies(filteredMovies, sort);
    }

    // Apply pagination
    const totalCount = filteredMovies.length;
    let paginatedMovies = filteredMovies;
    
    if (page) {
      const { size = 10, offset = 0 } = page;
      const startIndex = offset;
      const endIndex = startIndex + Math.min(size, 50); // Max 50 per page
      paginatedMovies = filteredMovies.slice(startIndex, endIndex);
    }

    // Apply projection
    const projectedMovies = applyProjection(paginatedMovies, projection);

    res.json({
      movies: projectedMovies,
      totalCount,
      page: page || { size: totalCount, offset: 0 }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(400).json({ 
      error: 'Invalid query'
    });
  }
});

// Get all movies (for testing)
app.get('/api/movies', (req, res) => {
  res.json({
    movies: moviesData.slice(0, 20), // Return first 20 for testing
    totalCount: moviesData.length
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', moviesLoaded: moviesData.length });
});

app.listen(PORT, () => {
  console.log(`Movie Search API server running on http://localhost:${PORT}`);
  console.log(`Open your browser and go to http://localhost:${PORT} to use the web interface`);
});