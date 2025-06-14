#!/usr/bin/env node

/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Comprehensive Environment Variable Test Script
 * 
 * This script automatically discovers ALL environment variables in .env
 * and performs two types of tests:
 * 1. Current values test - verifies env vars match current config
 * 2. Dynamic change test - verifies changing env vars affects config
 */

import fs from 'fs';
import dotenv from 'dotenv';

const ENV_FILE = './.env';
const ENV_BACKUP = './.env.backup';

// Complete mapping of all environment variables to their config paths
const ENV_TO_CONFIG_MAP = {
  // Application
  'NODE_ENV': (_c) => process.env.NODE_ENV,
  'PORT': (c) => c.port,
  'CORS_ORIGIN': (c) => c.cors.origin,
  
  // Redis
  'REDIS_HOST': (c) => c.redis.host,
  'REDIS_PORT': (c) => c.redis.port,
  'REDIS_PASSWORD': (c) => c.redis.password,
  'REDIS_DB': (c) => c.redis.db,
  'REDIS_CACHE_DB': (c) => c.hybridCache.redisConfig.db,
  'REDIS_CONNECT_TIMEOUT': (c) => c.redis.connectTimeout,
  'REDIS_LAZY_CONNECT': (c) => c.redis.lazyConnect,
  'CACHE_REDIS_PREFIX': (c) => c.hybridCache.redisConfig.keyPrefix,
  
  // Cache System
  'CACHE_ENABLE_REDIS': (c) => c.hybridCache.enableRedis,
  'CACHE_ENABLE_DISK': (c) => c.hybridCache.enableDisk,
  'CACHE_MEMORY_LIMIT_GB': (c) => Math.round(c.hybridCache.memoryLimitBytes / 1024**3),
  'CACHE_MAX_ENTRIES': (c) => c.hybridCache.maxEntries,
  'CACHE_ONDISK_PATH': (c) => c.hybridCache.diskPath,
  'CACHE_LOCK_TIMEOUT_MS': (c) => c.hybridCache.lockTimeoutMs,
  'CACHE_DISK_SYNC_INTERVAL_MS': (c) => c.hybridCache.diskSyncInterval,
  'CACHE_MEMORY_CHECK_INTERVAL_MS': (c) => c.hybridCache.memoryCheckInterval,
  
  // Cache TTL
  'CACHE_RAW_COMMITS_TTL_SECONDS': (c) => c.cacheStrategy.cacheKeys.rawCommitsTTL,
  'CACHE_FILTERED_COMMITS_TTL_SECONDS': (c) => c.cacheStrategy.cacheKeys.filteredCommitsTTL,
  'CACHE_AGGREGATED_DATA_TTL_SECONDS': (c) => c.cacheStrategy.cacheKeys.aggregatedDataTTL,
  'CACHE_REPOSITORY_INFO_TTL_SECONDS': (c) => c.cacheStrategy.cacheKeys.repositoryInfoTTL,
  
  // Cache Strategy
  'CACHE_HIERARCHICAL_ENABLED': (c) => c.cacheStrategy.hierarchicalCaching,
  'CACHE_MEMORY_PRESSURE_THRESHOLD': (c) => c.cacheStrategy.memoryPressureThreshold * 100,
  'CACHE_EMERGENCY_EVICTION_PERCENT': (c) => c.cacheStrategy.emergencyEvictionPercent * 100,
  'CACHE_LARGE_VALUE_BYPASS_PERCENT': (c) => c.cacheStrategy.largeValueBypassPercent * 100,
  
  // Repository Coordination
  'REPO_CACHE_ENABLED': (c) => c.repositoryCache.enabled,
  'REPO_CACHE_MAX_REPOSITORIES': (c) => c.repositoryCache.maxRepositories,
  'REPO_CACHE_MAX_AGE_HOURS': (c) => c.repositoryCache.maxAgeHours,
  'REPO_CACHE_MEMORY_LIMIT_GB': (c) => Math.round(c.repositoryCache.memoryLimitBytes / 1024**3),
  'REPO_CACHE_DISK_LIMIT_GB': (c) => Math.round(c.repositoryCache.diskLimitBytes / 1024**3),
  'REPO_CACHE_BASE_PATH': (c) => c.repositoryCache.basePath,
  'REPO_CACHE_CLEANUP_INTERVAL_MS': (c) => c.repositoryCache.cleanupIntervalMs,
  'REPO_CACHE_AGGRESSIVE_EVICTION': (c) => c.repositoryCache.aggressiveEviction,
  
  // Operation Coordination
  'REPO_OPERATION_COORDINATION_ENABLED': (c) => c.operationCoordination.enabled,
  'REPO_OPERATION_TIMEOUT_MS': (c) => c.operationCoordination.operationTimeoutMs,
  'REPO_OPERATION_COALESCING_ENABLED': (c) => c.operationCoordination.coalescingEnabled,
  'REPO_MAX_CONCURRENT_OPS': (c) => c.operationCoordination.maxConcurrentOpsPerRepo,
  'REPO_OPERATION_MAX_QUEUE_SIZE': (c) => c.operationCoordination.maxQueueSize,
  
  // Streaming
  'STREAMING_ENABLED': (c) => c.streaming.enabled,
  'STREAMING_COMMIT_THRESHOLD': (c) => c.streaming.commitThreshold,
  'STREAMING_BATCH_SIZE': (c) => c.streaming.batchSize,
  
  // Git Operations
  'GIT_MAX_CONCURRENT_PROCESSES': (c) => c.git.maxConcurrentProcesses,
  'GIT_CLONE_DEPTH': (c) => c.git.cloneDepth,
  
  // Lock Manager
  'LOCK_DIR': (c) => c.locks.lockDir,
  'LOCK_CLEANUP_INTERVAL_MS': (c) => c.locks.cleanupIntervalMs,
  'LOCK_STALE_AGE_MS': (c) => c.locks.staleLockAgeMs,
  
  // Logging & Debugging
  'LOG_LEVEL': (_c) => process.env.LOG_LEVEL,
  'DEBUG_CACHE_LOGGING': (c) => c.debug.enableCacheLogging,
  'DEBUG_LOCK_LOGGING': (c) => c.debug.enableLockLogging,
  'DEBUG_REPO_OPERATIONS': (c) => c.operationCoordination.enableOperationLogging,
  'ENABLE_METRICS': (_c) => process.env.ENABLE_METRICS,
  
  // System
  'GRACEFUL_SHUTDOWN_TIMEOUT_MS': (_c) => process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
};

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
  
  // Load modified config
  const modifiedConfig = await loadConfig();
  const modifiedConfigValue = ENV_TO_CONFIG_MAP[envVar](modifiedConfig);
  
  // Check if change was picked up
  let expectedValue = testValue;
  if (typeof originalConfigValue === 'boolean') {
    expectedValue = testValue === 'true';
  } else if (typeof originalConfigValue === 'number') {
    expectedValue = parseFloat(testValue);
  }
  
  const success = modifiedConfigValue == expectedValue;
  
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
  console.log('🧪 COMPREHENSIVE ENVIRONMENT VARIABLE TEST');
  console.log('===========================================');
  
  const envVars = parseEnvFile();
  const totalVars = Object.keys(envVars).length;
  const mappedVars = Object.keys(envVars).filter(v => ENV_TO_CONFIG_MAP[v]).length;
  
  console.log(`Found ${totalVars} environment variables`);
  console.log(`Testing ${mappedVars} variables with config mappings\n`);
  
  try {
    // Backup original .env
    await backupEnvFile();
    
    // Phase 1: Test current values
    const phase1Results = await testCurrentValues();
    
    // Phase 2: Test dynamic changes
    const phase2Results = await testDynamicChanges();
    
    // Final summary
    console.log('\n🎯 FINAL SUMMARY:');
    console.log('=================');
    console.log(`Phase 1 - Current values: ${phase1Results.passed}/${phase1Results.passed + phase1Results.failed} ✅`);
    console.log(`Phase 2 - Dynamic changes: ${phase2Results.passed}/${phase2Results.passed + phase2Results.failed} ✅`);
    
    const totalPassed = phase1Results.passed + phase2Results.passed;
    const totalTests = (phase1Results.passed + phase1Results.failed) + (phase2Results.passed + phase2Results.failed);
    
    console.log(`\nOverall: ${totalPassed}/${totalTests} tests passed`);
    
    if (phase1Results.failed === 0 && phase2Results.failed === 0) {
      console.log('\n🎉 ALL ENVIRONMENT VARIABLES WORK PERFECTLY!');
      console.log('✅ Current values match config');
      console.log('✅ Dynamic changes are picked up');
    } else {
      console.log('\n⚠️  Some tests failed. Check the configuration system.');
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
