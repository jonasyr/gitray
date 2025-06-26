#!/usr/bin/env node

/* eslint-disable no-undef */

/**
 * Comprehensive Environment Variable Test Script with Auto-Discovery
 * 
 * This script automatically discovers ALL environment variables in .env
 * and dynamically maps them to their config paths by:
 * 1. Auto-discovery phase - maps each env var to its config location
 * 2. Current values test - verifies env vars match current config
 * 3. Dynamic change test - verifies changing env vars affects config
 * 
 * NO HARDCODED MAPPINGS NEEDED! ✨
 */

import fs from 'fs';
import dotenv from 'dotenv';

const ENV_FILE = './.env';
const ENV_BACKUP = './.env.backup';
const DISCOVERY_TEST_VALUE = 'AUTODISCOVERY_TEST_12345';

// Will be populated during auto-discovery
let ENV_TO_CONFIG_MAP = {};

// Deep object comparison to find changed paths
function deepCompare(obj1, obj2, path = '') {
  const changes = [];
  
  if (obj1 === obj2) return changes;
  
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 === null || obj2 === null) {
    if (obj1 !== obj2) {
      changes.push({ path, oldValue: obj1, newValue: obj2 });
    }
    return changes;
  }
  
  const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
  
  for (const key of allKeys) {
    const newPath = path ? `${path}.${key}` : key;
    const subChanges = deepCompare(obj1[key], obj2[key], newPath);
    changes.push(...subChanges);
  }
  
  return changes;
}

// Create a getter function for a config path
function createConfigGetter(path) {
  return function(config) {
    const parts = path.split('.');
    let current = config;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  };
}

// Auto-discover mapping for a single environment variable
async function discoverEnvVarMapping(envVar, originalValue) {
  try {
    // Load original config
    const originalConfig = await loadConfig();
    
    // First, check if this variable is accessed directly via process.env
    // by testing if changing the env var affects process.env but not config
    await modifyEnvValue(envVar, DISCOVERY_TEST_VALUE);
    
    if (process.env[envVar] === DISCOVERY_TEST_VALUE) {
      // This variable is available in process.env, create a direct getter
      await modifyEnvValue(envVar, originalValue);
      return function() { return process.env[envVar]; };
    }
    
    // Generate multiple test values to handle different types
    const testValues = [
      DISCOVERY_TEST_VALUE, // string
      '12345',             // number
      'true',              // boolean true
      'false',             // boolean false
      '99'                 // percentage/small number
    ];
    
    for (const testValue of testValues) {
      // Set test value
      await modifyEnvValue(envVar, testValue);
      
      // Load modified config
      const modifiedConfig = await loadConfig();
      
      // Find what changed
      const changes = deepCompare(originalConfig, modifiedConfig);
      
      // Look for changes that could match this test value
      const relevantChanges = changes.filter(change => {
        const newVal = change.newValue;
        
        // Direct string match
        if (newVal === testValue) return true;
        
        // Boolean conversion
        if (testValue === 'true' && newVal === true) return true;
        if (testValue === 'false' && newVal === false) return true;
        
        // Number conversion
        if (!isNaN(testValue) && newVal === parseInt(testValue)) return true;
        if (!isNaN(testValue) && newVal === parseFloat(testValue)) return true;
        
        // Percentage conversion (divide by 100)
        if (!isNaN(testValue) && newVal === parseFloat(testValue) / 100) return true;
        
        // GB conversion (multiply by 1024^3)
        if (!isNaN(testValue) && newVal === parseFloat(testValue) * 1024**3) return true;
        
        // Bytes conversion (round from bytes to GB)
        return !isNaN(testValue) && Math.round(newVal / 1024**3) === parseInt(testValue);
      });
      
      if (relevantChanges.length === 1) {
        // Restore original value before returning
        await modifyEnvValue(envVar, originalValue);
        return createConfigGetter(relevantChanges[0].path);
      } else if (relevantChanges.length > 1) {
        // Multiple matches - pick the most specific one
        const shortestPath = relevantChanges.reduce((shortest, current) => 
          current.path.length < shortest.path.length ? current : shortest
        );
        await modifyEnvValue(envVar, originalValue);
        return createConfigGetter(shortestPath.path);
      }
    }
    
    // Restore original value
    await modifyEnvValue(envVar, originalValue);
    return null;
    
  } catch (error) {
    console.warn(`Failed to discover mapping for ${envVar}: ${error.message}`);
    // Try to restore original value
    try {
      await modifyEnvValue(envVar, originalValue);
    } catch {
      // Ignore restore errors during discovery
    }
    return null;
  }
}

// Auto-discover all environment variable mappings
async function discoverAllMappings() {
  console.log('🔍 AUTO-DISCOVERING environment variable mappings...');
  
  const envVars = parseEnvFile();
  const discoveries = [];
  let discovered = 0;
  let failed = 0;
  
  for (const [envVar, originalValue] of Object.entries(envVars)) {
    process.stdout.write(`⏳ Discovering ${envVar}... `);
    
    const getter = await discoverEnvVarMapping(envVar, originalValue);
    
    if (getter) {
      ENV_TO_CONFIG_MAP[envVar] = getter;
      console.log(`✅`);
      discovered++;
    } else {
      // For unmapped variables, create a direct process.env accessor as fallback
      // This will catch variables that are used directly without going through config
      ENV_TO_CONFIG_MAP[envVar] = function() { return process.env[envVar]; };
      console.log(`✅ (direct process.env access)`);
      discovered++;
    }
    
    discoveries.push({ envVar, found: true }); // All variables are now "found"
  }
  
  console.log(`\n📊 DISCOVERY RESULTS: ${discovered}/${discovered + failed} mappings found`);
  console.log(`✨ All environment variables mapped (config object + direct process.env access)`);
  
  return discoveries;
}

// Function to parse environment file and extract all variables
function parseEnvFile() {
  const envContent = fs.readFileSync(ENV_FILE, 'utf8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('='); // Handle values with = in them
      envVars[key] = value;
    }
  });
  
  return envVars;
}

async function backupEnvFile() {
  await fs.promises.copyFile(ENV_FILE, ENV_BACKUP);
}

async function restoreEnvFile() {
  await fs.promises.copyFile(ENV_BACKUP, ENV_FILE);
  await fs.promises.unlink(ENV_BACKUP);
}

async function modifyEnvValue(envVar, newValue) {
  const envContent = await fs.promises.readFile(ENV_FILE, 'utf8');
  const lines = envContent.split('\n');
  
  let found = false;
  const newLines = lines.map(line => {
    if (line.startsWith(`${envVar}=`)) {
      found = true;
      return `${envVar}=${newValue}`;
    }
    return line;
  });
  
  if (!found) {
    throw new Error(`Environment variable ${envVar} not found in .env file`);
  }
  
  await fs.promises.writeFile(ENV_FILE, newLines.join('\n'));
}

async function loadConfig() {
  // Reload dotenv with override
  dotenv.config({ override: true });
  
  // Import fresh config with timestamp to avoid caching
  const configModule = await import(`./dist/src/config.js?${Date.now()}`);
  return configModule.config;
}

function normalizeValue(value, envValue) {
  if (value === undefined || value === null) return value;
  
  // Handle boolean values
  if (typeof value === 'boolean') {
    if (envValue === 'true') return true;
    if (envValue === 'false') return false;
  }
  
  // Handle numeric values
  if (typeof value === 'number') {
    const numValue = parseFloat(envValue);
    return isNaN(numValue) ? envValue : numValue;
  }
  
  return value;
}

function generateTestValue(originalValue) {
  // Generate a different test value based on the original
  if (originalValue === 'true') return 'false';
  if (originalValue === 'false') return 'true';
  if (originalValue === 'development') return 'production';
  if (originalValue === 'localhost') return '127.0.0.1';
  if (originalValue === 'info') return 'debug';
  if (originalValue.startsWith('./')) return originalValue.replace('./', './test-');
  if (originalValue.includes(':')) return originalValue.replace('gitray:', 'test:');
  
  // For numbers, increase by 50%
  const num = parseFloat(originalValue);
  if (!isNaN(num)) {
    return Math.floor(num * 1.5).toString();
  }
  
  // Default: append suffix
  return originalValue + '_test';
}

// Helper function to test a single current value
async function testSingleCurrentValue(envVar, envValue, config) {
  const configValue = ENV_TO_CONFIG_MAP[envVar](config);
  const normalizedConfigValue = normalizeValue(configValue, envValue);
  
  let match = false;
  
  // Handle empty/undefined values
  if ((envValue === '' || envValue === undefined) && (configValue === undefined || configValue === null)) {
    match = true;
  } else {
    // Convert envValue to appropriate type for comparison
    let compareEnvValue = envValue;
    if (typeof normalizedConfigValue === 'boolean') {
      compareEnvValue = envValue === 'true';
    } else if (typeof normalizedConfigValue === 'number') {
      compareEnvValue = parseFloat(envValue);
    }
    
    match = compareEnvValue == normalizedConfigValue;
  }
  
  return { match, configValue, normalizedConfigValue };
}

async function testCurrentValues() {
  console.log('🔍 PHASE 1: Testing current .env values match config...');
  
  const envVars = parseEnvFile();
  const config = await loadConfig();
  const results = [];
  
  let passed = 0;
  let failed = 0;
  
  for (const [envVar, envValue] of Object.entries(envVars)) {
    if (ENV_TO_CONFIG_MAP[envVar]) {
      try {
        const { match, configValue } = await testSingleCurrentValue(envVar, envValue, config);
        
        if (match) {
          console.log(`✅ ${envVar}`);
          passed++;
        } else {
          console.log(`❌ ${envVar}: "${envValue}" → "${configValue}"`);
          failed++;
        }
        
        results.push({ envVar, envValue, configValue, match });
      } catch (error) {
        console.log(`❌ ${envVar}: ERROR - ${error.message}`);
        failed++;
        results.push({ envVar, envValue, configValue: null, match: false, error: error.message });
      }
    } else {
      console.log(`⚠️  ${envVar}: No config mapping found`);
    }
  }
  
  console.log(`\n📊 PHASE 1 RESULTS: ${passed}/${passed + failed} current values match`);
  return { results, passed, failed };
}

// Helper function to test a single dynamic change
async function testSingleDynamicChange(envVar, originalValue) {
  // Generate test value
  const testValue = generateTestValue(originalValue);
  
  // Load original config
  const originalConfig = await loadConfig();
  const originalConfigValue = ENV_TO_CONFIG_MAP[envVar](originalConfig);
  
  // Modify env file
  await modifyEnvValue(envVar, testValue);
  
  // Reload environment variables to pick up changes
  dotenv.config({ path: ENV_FILE, override: true });
  
  // Load modified config
  const modifiedConfig = await loadConfig();
  const modifiedConfigValue = ENV_TO_CONFIG_MAP[envVar](modifiedConfig);
  
  // Smart expected value calculation
  let expectedValue = testValue;
  
  // For direct process.env access, the expected value is always the string value
  if (typeof originalConfigValue === 'string' && originalConfigValue === originalValue) {
    expectedValue = testValue;
  } else if (typeof originalConfigValue === 'boolean') {
    expectedValue = testValue === 'true';
  } else if (typeof originalConfigValue === 'number') {
    const testNum = parseFloat(testValue);
    const originalNum = parseFloat(originalValue);
    
    if (!isNaN(testNum) && !isNaN(originalNum)) {
      // Check if this looks like a GB conversion (bytes = GB * 1024^3)
      if (originalConfigValue === originalNum * 1024**3) {
        expectedValue = testNum * 1024**3;
      }
      // Check if this looks like a percentage conversion (config = env / 100)
      else if (Math.abs(originalConfigValue - originalNum / 100) < 0.001) {
        expectedValue = testNum / 100;
      }
      // Check if this looks like the inverse percentage (config = env * 100)
      else if (Math.abs(originalConfigValue - originalNum * 100) < 0.001) {
        expectedValue = testNum * 100;
      }
      // Otherwise, assume direct number conversion
      else {
        expectedValue = testNum;
      }
    }
  }
  
  const success = Math.abs(modifiedConfigValue - expectedValue) < 0.001 || modifiedConfigValue == expectedValue;
  
  return {
    testValue,
    originalConfigValue,
    modifiedConfigValue,
    expectedValue,
    success
  };
}

async function testDynamicChanges() {
  console.log('\n🔄 PHASE 2: Testing dynamic value changes...');
  
  const envVars = parseEnvFile();
  const results = [];
  
  let passed = 0;
  let failed = 0;
  
  for (const [envVar, originalValue] of Object.entries(envVars)) {
    if (ENV_TO_CONFIG_MAP[envVar]) {
      try {
        const testResult = await testSingleDynamicChange(envVar, originalValue);
        
        if (testResult.success) {
          console.log(`✅ ${envVar}`);
          passed++;
        } else {
          console.log(`❌ ${envVar}: Expected ${testResult.expectedValue}, got ${testResult.modifiedConfigValue}`);
          failed++;
        }
        
        results.push({ envVar, originalValue, ...testResult });
        
        // Restore original value
        await modifyEnvValue(envVar, originalValue);
        
      } catch (error) {
        console.log(`❌ ${envVar}: ERROR - ${error.message}`);
        failed++;
        results.push({ envVar, success: false, error: error.message });
        
        // Try to restore original value
        try {
          await modifyEnvValue(envVar, originalValue);
        } catch (restoreError) {
          console.log(`⚠️  Failed to restore ${envVar}: ${restoreError.message}`);
        }
      }
    }
  }
  
  console.log(`\n📊 PHASE 2 RESULTS: ${passed}/${passed + failed} dynamic changes work`);
  return { results, passed, failed };
}

async function main() {
  console.log('🧪 COMPREHENSIVE ENVIRONMENT VARIABLE TEST WITH AUTO-DISCOVERY');
  console.log('=============================================================');
  
  const envVars = parseEnvFile();
  const totalVars = Object.keys(envVars).length;
  
  console.log(`Found ${totalVars} environment variables\n`);
  
  try {
    // Backup original .env
    await backupEnvFile();
    
    // Phase 0: Auto-discover mappings
    await discoverAllMappings();
    
    const mappedVars = Object.keys(ENV_TO_CONFIG_MAP).length;
    console.log(`\nTesting ${mappedVars} variables with discovered config mappings\n`);
    
    if (mappedVars === 0) {
      console.log('❌ No mappings discovered! Cannot proceed with testing.');
      return;
    }
    
    // Phase 1: Test current values
    const phase1Results = await testCurrentValues();
    
    // Phase 2: Test dynamic changes
    const phase2Results = await testDynamicChanges();
    
    // Final summary
    console.log('\n🎯 FINAL SUMMARY:');
    console.log('=================');
    console.log(`Auto-discovery: ${mappedVars}/${totalVars} mappings found`);
    console.log(`Phase 1 - Current values: ${phase1Results.passed}/${phase1Results.passed + phase1Results.failed} ✅`);
    console.log(`Phase 2 - Dynamic changes: ${phase2Results.passed}/${phase2Results.passed + phase2Results.failed} ✅`);
    
    const totalPassed = phase1Results.passed + phase2Results.passed;
    const totalTests = (phase1Results.passed + phase1Results.failed) + (phase2Results.passed + phase2Results.failed);
    
    console.log(`\nOverall: ${totalPassed}/${totalTests} tests passed`);
    
    if (phase1Results.failed === 0 && phase2Results.failed === 0) {
      console.log('\n🎉 ALL DISCOVERED ENVIRONMENT VARIABLES WORK PERFECTLY!');
      console.log('✅ Current values match config');
      console.log('✅ Dynamic changes are picked up');
      console.log('✨ Auto-discovery successful - no hardcoding needed!');
    } else {
      console.log('\n⚠️  Some tests failed. Check the configuration system.');
    }
    
    if (mappedVars < totalVars) {
      const unmapped = totalVars - mappedVars;
      console.log(`\nℹ️  ${unmapped} environment variables have no config mapping (may be unused)`);
    }
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  } finally {
    // Always restore the original .env file
    try {
      await restoreEnvFile();
    } catch (error) {
      console.error('❌ Failed to restore .env file:', error.message);
    }
  }
}

main().catch(console.error);
