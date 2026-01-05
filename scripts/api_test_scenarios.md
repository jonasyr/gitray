<!-- markdownlint-disable -->

# Comprehensive API Testing Scenarios

## Route 1: `/api/repositories/heatmap` (REFACTORED)

### Valid Scenarios

1. **No filters** - Baseline test
   - Expected: Full heatmap data with all commits
   - Validates: Basic functionality works after refactor

2. **Date filter - fromDate only**
   - Input: `fromDate=2024-01-01`
   - Expected: Data from 2024 onwards
   - Validates: Single date filter parameter extraction

3. **Date filter - toDate only**
   - Input: `toDate=2024-12-31`
   - Expected: Data up to end of 2024
   - Validates: Single date filter parameter extraction

4. **Date range - fromDate + toDate**
   - Input: `fromDate=2024-01-01&toDate=2024-12-31`
   - Expected: Data within 2024
   - Validates: Multiple filter parameters, buildCommitFilters logic

5. **Author filter - single author**
   - Input: `author=jonas`
   - Expected: Data for specific author
   - Validates: Author parameter extraction

6. **Authors filter - multiple authors**
   - Input: `authors=jonas,contributor2`
   - Expected: Data for multiple authors
   - Validates: Authors array parsing (split by comma)

7. **Combined filters**
   - Input: `fromDate=2024-01-01&toDate=2024-12-31&author=jonas`
   - Expected: Data matching all filters
   - Validates: Complete filter pipeline

### Cache Behavior

1. **First call** - Should be cache MISS
2. **Second call (same params)** - Should be cache HIT
3. **Different params** - Should be cache MISS

### Error Scenarios

1. **Missing repoUrl** - HTTP 400
2. **Invalid repoUrl format** - HTTP 400
3. **Invalid date format** - HTTP 400
4. **Invalid URL scheme** - HTTP 400

### Response Validation

- Contains `data` array
- Contains `timePeriod` field
- Data points have required fields: date, commits, authors
- HTTP 200 status

---

## Route 2: `/api/repositories/contributors` (REFACTORED)

### Valid Scenarios

1. **No filters** - All contributors
   - Expected: Array of contributors with stats
   - Validates: Basic functionality

2. **Date filter - fromDate**
   - Input: `fromDate=2024-01-01`
   - Expected: Contributors from 2024 onwards

3. **Date filter - toDate**
   - Input: `toDate=2024-12-31`
   - Expected: Contributors up to 2024

4. **Date range**
   - Input: `fromDate=2024-01-01&toDate=2024-12-31`
   - Expected: Contributors within 2024

5. **Author filter**
   - Input: `author=jonas`
   - Expected: Single contributor data

6. **Combined filters**
   - Input: `fromDate=2024-01-01&toDate=2024-12-31&author=jonas`

### Cache Behavior

- Same as heatmap

### Error Scenarios

- Same as heatmap

### Response Validation

- Returns array of contributor objects
- Each contributor has: name, email, commits, additions, deletions
- Sorted by commit count descending
- HTTP 200 status

---

## Route 3: `/api/repositories/churn` (REFACTORED)

### Valid Scenarios

1. **No filters** - All churn data
   - Expected: Complete churn analysis
   - Validates: Basic functionality

2. **Date filter - fromDate**
   - Input: `fromDate=2024-01-01`
   - Expected: Churn from 2024 onwards
   - Validates: fromDate → since mapping in buildChurnFilters

3. **Date filter - toDate**
   - Input: `toDate=2024-12-31`
   - Expected: Churn up to 2024
   - Validates: toDate → until mapping

4. **Date range**
   - Input: `fromDate=2024-01-01&toDate=2024-12-31`
   - Expected: Churn within 2024

5. **minChanges filter**
   - Input: `minChanges=10`
   - Expected: Only files with 10+ changes
   - Validates: Integer parsing

6. **extensions filter - single**
   - Input: `extensions=ts`
   - Expected: Only TypeScript files

7. **extensions filter - multiple**
   - Input: `extensions=ts,tsx,js`
   - Expected: Multiple file types
   - Validates: Split and trim logic

8. **Combined filters**
   - Input: `fromDate=2024-01-01&minChanges=5&extensions=ts,tsx`
   - Expected: All filters applied

### Cache Behavior

- Same pattern as other routes

### Error Scenarios

- Same as heatmap
- Invalid minChanges (non-numeric) - HTTP 400

### Response Validation

- Contains `files` array
- Contains `summary` object
- Files have: path, additions, deletions, changes
- HTTP 200 status

---

## Route 4: `/api/repositories/full-data` (NOT REFACTORED)

### Valid Scenarios

1. **No filters, default pagination**
   - Expected: First 100 commits + heatmap
   - Validates: No regression in non-refactored code

2. **Custom pagination - page 1**
   - Input: `page=1&limit=10`
   - Expected: First 10 commits

3. **Custom pagination - page 2**
   - Input: `page=2&limit=10`
   - Expected: Commits 11-20

4. **Date filters**
   - Input: `fromDate=2024-01-01&toDate=2024-12-31`
   - Expected: Filtered heatmap (commits unfiltered due to pagination)

5. **Combined filters + pagination**
   - Input: `fromDate=2024-01-01&page=1&limit=5`

### Cache Behavior

- Two cache operations (commits + heatmapData)
- Sequential fetching (not parallel)
- Both should cache independently

### Error Scenarios

- Same as heatmap

### Response Validation

- Contains `commits` array
- Contains `heatmapData` object
- heatmapData has `data` and `timePeriod`
- Commits have proper structure
- Pagination metadata present
- HTTP 200 status

---

## Route 5: `/api/repositories/commits` (NOT REFACTORED)

### Valid Scenarios

1. **Default pagination**
   - Expected: First 100 commits

2. **Custom pagination**
   - Input: `page=1&limit=20`
   - Expected: First 20 commits

3. **Page 2**
   - Input: `page=2&limit=20`
   - Expected: Commits 21-40

### Cache Behavior

- Standard cache hit/miss pattern

### Error Scenarios

- Same as heatmap

### Response Validation

- Returns array of commit objects
- Each commit has: hash, message, author, date, stats
- Proper pagination applied
- HTTP 200 status

---

## Route 6: `/api/repositories/summary` (NOT REFACTORED)

### Valid Scenarios

1. **Basic request**
   - Expected: Repository summary with all stats

### Cache Behavior

- Single cache operation
- Should cache entire summary

### Error Scenarios

- Same as heatmap

### Response Validation

- Contains `repository` object (name, url, defaultBranch)
- Contains `statistics` object (commits, contributors, files, etc.)
- Contains `timeline` data
- HTTP 200 status

---

## Cross-Route Testing

### Cache Consistency

1. Call heatmap → cache miss
2. Call contributors → separate cache miss
3. Call heatmap again → cache hit
4. Call contributors again → cache hit

### Filter Consistency

1. Same date filters across routes should use same data subset
2. Author filters should match commit authors

### Performance

1. First call (cache miss) - slower
2. Second call (cache hit) - fast (<50ms)
3. Different params - cache miss

---

## Error Handling Consistency

All routes should handle these consistently:

1. Missing repoUrl → HTTP 400, specific error message
2. Invalid repoUrl → HTTP 400, validation error
3. Invalid date format → HTTP 400, validation error
4. Server errors → HTTP 500, proper error structure
5. Timeout scenarios → HTTP 504
