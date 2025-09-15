#!/bin/bash

# Convert all text files to Unix line endings (LF)
# This script will convert CRLF to LF in all relevant text files

set -e

echo "🔄 Converting all files to Unix line endings (LF)..."

# Function to convert a file to Unix line endings
convert_file() {
    local file="$1"
    if [[ -f "$file" ]]; then
        # Check if file has CRLF endings
        if grep -q $'\r' "$file" 2>/dev/null; then
            echo "  Converting: $file"
            # Use sed to remove carriage returns
            sed -i 's/\r$//' "$file"
        fi
    fi
}

# Find and convert all text files
echo "📁 Scanning for files to convert..."

# Convert specific file types
find . -type f \( \
    -name "*.ts" -o \
    -name "*.tsx" -o \
    -name "*.js" -o \
    -name "*.jsx" -o \
    -name "*.json" -o \
    -name "*.md" -o \
    -name "*.yml" -o \
    -name "*.yaml" -o \
    -name "*.toml" -o \
    -name "*.ini" -o \
    -name "*.xml" -o \
    -name "*.conf" -o \
    -name "*.config" -o \
    -name "*.env" -o \
    -name "*.sh" -o \
    -name "*.bash" -o \
    -name "*.zsh" -o \
    -name "*.fish" -o \
    -name "*.ps1" -o \
    -name "*.bat" -o \
    -name "*.cmd" -o \
    -name "*.sql" -o \
    -name "*.graphql" -o \
    -name "*.gql" -o \
    -name "*.proto" -o \
    -name "*.tf" -o \
    -name "*.hcl" -o \
    -name "*.html" -o \
    -name "*.htm" -o \
    -name "*.css" -o \
    -name "*.scss" -o \
    -name "*.sass" -o \
    -name "*.less" -o \
    -name "*.vue" -o \
    -name "*.svelte" -o \
    -name "*.py" -o \
    -name "*.java" -o \
    -name "*.c" -o \
    -name "*.cpp" -o \
    -name "*.cs" -o \
    -name "*.go" -o \
    -name "*.rs" -o \
    -name "*.php" -o \
    -name "*.rb" -o \
    -name "*.swift" -o \
    -name "*.kt" -o \
    -name "*.scala" -o \
    -name "*.clj" -o \
    -name "*.hs" -o \
    -name "*.ml" -o \
    -name "*.r" -o \
    -name "*.m" -o \
    -name "*.dart" -o \
    -name "*.elm" -o \
    -name "Dockerfile*" -o \
    -name "*.dockerfile" -o \
    -name ".gitignore" -o \
    -name ".gitattributes" -o \
    -name ".editorconfig" \
\) -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -not -path "./dist/*" \
  -not -path "./coverage/*" \
  -not -path "./.next/*" \
  -not -path "./.vite/*" \
  -not -path "./build/*" | while read -r file; do
    convert_file "$file"
done

echo "✅ Line ending conversion complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Stage changes: git add ."
echo "  3. Commit: git commit -m 'fix: normalize all files to Unix line endings (LF)'"
echo ""
echo "🔧 The .gitattributes file will ensure future commits use Unix line endings."