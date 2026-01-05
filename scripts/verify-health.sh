#!/bin/bash

# GitRay - Comprehensive Verification Script
# Tests all critical commands after migration or major changes

set -e  # Exit on error

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_test() {
    echo -e "${YELLOW}Testing: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ PASSED: $1${NC}"
    ((PASSED++))
}

print_failure() {
    echo -e "${RED}❌ FAILED: $1${NC}"
    ((FAILED++))
}

print_warning() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
    ((WARNINGS++))
}

# Test function wrapper
run_test() {
    local test_name="$1"
    local command="$2"
    local expect_success="${3:-true}"
    
    print_test "$test_name"
    
    if eval "$command" > /tmp/gitray_test_output.log 2>&1; then
        if [ "$expect_success" = "true" ]; then
            print_success "$test_name"
        else
            print_warning "$test_name (expected to fail but passed)"
        fi
    else
        if [ "$expect_success" = "true" ]; then
            print_failure "$test_name"
            echo "Command output:"
            tail -20 /tmp/gitray_test_output.log
        else
            print_success "$test_name (expected to fail)"
        fi
    fi
}

# Main test suite
main() {
    print_header "GitRay Verification Script"
    
    echo "Starting comprehensive verification..."
    echo "Date: $(date)"
    echo ""
    
    # Check dependencies
    print_header "1. Dependency Check"
    
    for cmd in pnpm node docker git; do
        if command -v $cmd &> /dev/null; then
            print_success "$cmd is installed"
        else
            print_failure "$cmd is NOT installed"
        fi
    done
    
    # Check for legacy references
    print_header "2. Migration Verification"
    
    print_test "Checking for legacy 'frontendOld' references"
    if ! grep -r "frontendOld" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude="*.log" . 2>/dev/null; then
        print_success "No legacy references found"
    else
        print_warning "Found references to 'frontendOld'"
    fi
    
    # Build tests
    print_header "3. Build Commands"
    
    run_test "Build shared-types" "pnpm run build:shared-types"
    run_test "Build backend" "pnpm --filter backend build"
    run_test "Build frontend" "pnpm --filter frontend build"
    
    # Lint tests
    print_header "4. Code Quality"
    
    run_test "ESLint check" "pnpm run lint"
    run_test "Markdown lint" "pnpm run lint:md"
    run_test "TypeScript check (frontend)" "pnpm --filter frontend run type-check"
    
    # Test suite
    print_header "5. Test Suite"
    
    run_test "Backend tests" "pnpm run test:backend"
    run_test "Frontend tests" "pnpm run test:frontend"
    
    # Cleanup tests
    print_header "6. Cleanup Commands"
    
    run_test "Clean cache" "pnpm run clean:cache"
    
    # Shell script verification
    print_header "7. Shell Scripts"
    
    for script in scripts/*.sh; do
        if [ -x "$script" ]; then
            print_success "$(basename $script) is executable"
        else
            print_warning "$(basename $script) is NOT executable"
        fi
    done
    
    # Summary
    print_header "VERIFICATION SUMMARY"
    
    echo -e "Total Passed:   ${GREEN}$PASSED${NC}"
    echo -e "Total Failed:   ${RED}$FAILED${NC}"
    echo -e "Total Warnings: ${YELLOW}$WARNINGS${NC}"
    echo ""
    
    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ All critical tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed. Please review the output above.${NC}"
        exit 1
    fi
}

# Cleanup
cleanup() {
    rm -f /tmp/gitray_test_output.log
}

trap cleanup EXIT

# Run main
main "$@"
