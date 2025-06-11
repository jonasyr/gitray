#!/bin/bash

# Jest to Vitest Migration Script
# This script automates the conversion of Jest syntax to Vitest syntax

set -euo pipefail

echo "🚀 Starting Jest to Vitest migration..."

# Function to convert a single file
convert_file() {
    local file="$1"
    echo "Converting $file..."
    
    # Convert jest imports to vitest imports
    sed -i.bak 's/import.*jest.*from.*['\''"]jest['\''"];*//' "$file"
    
    # Add vitest imports at the top if not already present
    if ! grep -q "from 'vitest'" "$file"; then
        # Find first import line and add vitest import after it
        sed -i.bak '1i\
import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from '\''vitest'\'';' "$file"
    fi
    
    # Replace Jest globals with Vitest imports
    sed -i.bak 's/jest\.fn()/vi.fn()/g' "$file"
    sed -i.bak 's/jest\.mock(/vi.mock(/g' "$file"
    sed -i.bak 's/jest\.spyOn(/vi.spyOn(/g' "$file"
    sed -i.bak 's/jest\.clearAllMocks(/vi.clearAllMocks(/g' "$file"
    sed -i.bak 's/jest\.resetAllMocks(/vi.resetAllMocks(/g' "$file"
    sed -i.bak 's/jest\.restoreAllMocks(/vi.restoreAllMocks(/g' "$file"
    sed -i.bak 's/jest\.resetModules(/vi.resetModules(/g' "$file"
    sed -i.bak 's/jest\.doMock(/vi.doMock(/g' "$file"
    sed -i.bak 's/jest\.requireMock(/vi.mocked(/g' "$file"
    sed -i.bak 's/jest\.requireActual(/await vi.importActual(/g' "$file"
    sed -i.bak 's/jest\.useFakeTimers(/vi.useFakeTimers(/g' "$file"
    sed -i.bak 's/jest\.useRealTimers(/vi.useRealTimers(/g' "$file"
    sed -i.bak 's/jest\.runAllTimers(/vi.runAllTimers(/g' "$file"
    sed -i.bak 's/jest\.advanceTimersByTime(/vi.advanceTimersByTime(/g' "$file"
    
    # Replace Jest types
    sed -i.bak 's/jest\.Mock/MockInstance/g' "$file"
    sed -i.bak 's/jest\.MockedFunction/MockInstance/g' "$file"
    sed -i.bak 's/jest\.SpyInstance/MockInstance/g' "$file"
    
    # Handle mock implementations
    sed -i.bak 's/\.mockReturnValue(/.mockReturnValue(/g' "$file"
    sed -i.bak 's/\.mockResolvedValue(/.mockResolvedValue(/g' "$file"
    sed -i.bak 's/\.mockRejectedValue(/.mockRejectedValue(/g' "$file"
    sed -i.bak 's/\.mockImplementation(/.mockImplementation(/g' "$file"
    
    # Remove backup files
    rm -f "$file.bak"
    
    echo "✅ Converted $file"
}

# Convert backend tests
echo "📦 Converting backend tests..."
find apps/backend/__tests__ -name "*.test.ts" -type f | while read -r file; do
    convert_file "$file"
done

# Convert frontend tests  
echo "🎨 Converting frontend tests..."
find apps/frontend/__tests__ -name "*.test.tsx" -o -name "*.test.ts" -type f | while read -r file; do
    convert_file "$file"
done

echo "🧹 Cleaning up Jest configuration files..."

# Remove Jest config files
rm -f jest.config.cjs
rm -f apps/backend/jest.config.cjs
rm -f apps/frontend/jest.config.cjs

# Remove Jest setup files
rm -f apps/frontend/jest.setup.ts
rm -f apps/frontend/jest.setup.react19.ts

# Remove Jest mock files that are no longer needed
rm -rf apps/frontend/__mocks__

echo "📦 Updating package.json files..."

# Function to update package.json
update_package_json() {
    local file="$1"
    if [ -f "$file" ]; then
        echo "Updating $file..."
        # Remove Jest dependencies (this is just informational since we provided new package.json files)
        echo "  - Remember to install new dependencies with: pnpm install"
    fi
}

update_package_json "package.json"
update_package_json "apps/backend/package.json" 
update_package_json "apps/frontend/package.json"

echo "✅ Migration complete!"
echo ""
echo "📋 Next steps:"
echo "1. Replace package.json files with the updated versions provided"
echo "2. Run: pnpm install"
echo "3. Run: pnpm test to verify all tests pass"
echo "4. Run: pnpm test:watch to test the new watch mode"
echo ""
echo "🎉 Enjoy your faster test experience with Vitest!"