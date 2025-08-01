#!/usr/bin/env node

/**
 * Quick Test Validation for Phase 3B.2
 * 
 * Validates test setup and runs basic test validation
 */

const fs = require('fs')
const path = require('path')

class TestValidator {
  constructor() {
    this.issues = []
    this.warnings = []
    this.passed = []
  }

  log(message, type = 'info') {
    const prefix = {
      info: '📋',
      pass: '✅',
      warn: '⚠️', 
      fail: '❌'
    }[type] || '📋'
    
    console.log(`${prefix} ${message}`)
  }

  validateTestFiles() {
    this.log('Validating test file structure...', 'info')

    const requiredFiles = [
      'tests/unit/betting-engine.test.ts',
      'tests/unit/deck-manager.test.ts',
      'tests/integration/game-table.test.ts',
      'tests/jest.setup.phase-3b2.ts',
      'tests/jest.setup.phase-3b2.d.ts',
      'jest.config.phase-3b2.js',
      'test-enhanced-multiplayer.js',
      'run-phase-3b2-tests.js'
    ]

    requiredFiles.forEach(file => {
      if (fs.existsSync(file)) {
        this.passed.push(`Test file exists: ${file}`)
        this.log(`Found ${file}`, 'pass')
      } else {
        this.issues.push(`Missing test file: ${file}`)
        this.log(`Missing ${file}`, 'fail')
      }
    })
  }

  validatePackageJson() {
    this.log('Validating package.json test dependencies...', 'info')

    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
      
      const requiredDevDeps = [
        '@jest/globals',
        'jest',
        'ts-jest',
        '@types/jest'
      ]

      requiredDevDeps.forEach(dep => {
        if (packageJson.devDependencies && packageJson.devDependencies[dep]) {
          this.passed.push(`Dev dependency found: ${dep}`)
          this.log(`Dev dependency OK: ${dep}`, 'pass')
        } else {
          this.warnings.push(`Missing dev dependency: ${dep}`)
          this.log(`Missing dev dependency: ${dep}`, 'warn')
        }
      })

      // Check if test scripts are defined
      if (packageJson.scripts) {
        const testScripts = ['test', 'test:unit', 'test:integration', 'test:e2e']
        testScripts.forEach(script => {
          if (packageJson.scripts[script]) {
            this.passed.push(`Test script found: ${script}`)
            this.log(`Test script OK: ${script}`, 'pass')
          } else {
            this.warnings.push(`Missing test script: ${script}`)
            this.log(`Missing test script: ${script}`, 'warn')
          }
        })
      }

    } catch (error) {
      this.issues.push(`Could not read package.json: ${error.message}`)
      this.log(`Package.json error: ${error.message}`, 'fail')
    }
  }

  validateJestConfig() {
    this.log('Validating Jest configuration...', 'info')

    try {
      const jestConfig = require('./jest.config.phase-3b2.js')
      
      const requiredKeys = ['preset', 'testEnvironment', 'setupFilesAfterEnv', 'collectCoverageFrom', 'coverageThreshold']
      
      requiredKeys.forEach(key => {
        if (jestConfig[key]) {
          this.passed.push(`Jest config has: ${key}`)
          this.log(`Jest config OK: ${key}`, 'pass')
        } else {
          this.issues.push(`Jest config missing: ${key}`)
          this.log(`Jest config missing: ${key}`, 'fail')
        }
      })

      // Validate coverage thresholds
      if (jestConfig.coverageThreshold && jestConfig.coverageThreshold.global) {
        const thresholds = jestConfig.coverageThreshold.global
        const requiredThresholds = ['branches', 'functions', 'lines', 'statements']
        
        requiredThresholds.forEach(metric => {
          if (typeof thresholds[metric] === 'number') {
            this.passed.push(`Coverage threshold for ${metric}: ${thresholds[metric]}%`)
            this.log(`Coverage threshold OK: ${metric} = ${thresholds[metric]}%`, 'pass')
          } else {
            this.warnings.push(`Missing coverage threshold: ${metric}`)
            this.log(`Missing coverage threshold: ${metric}`, 'warn')
          }
        })
      }

    } catch (error) {
      this.issues.push(`Could not load Jest config: ${error.message}`)
      this.log(`Jest config error: ${error.message}`, 'fail')
    }
  }

  validateTestContent() {
    this.log('Validating test content...', 'info')

    const testFiles = [
      'tests/unit/betting-engine.test.ts',
      'tests/unit/deck-manager.test.ts'
    ]

    testFiles.forEach(file => {
      if (fs.existsSync(file)) {
        try {
          const content = fs.readFileSync(file, 'utf8')
          
          // Check for basic test structure
          if (content.includes('describe(') && content.includes('it(') && content.includes('expect(')) {
            this.passed.push(`Test structure valid: ${file}`)
            this.log(`Test structure OK: ${file}`, 'pass')
          } else {
            this.issues.push(`Invalid test structure: ${file}`)
            this.log(`Invalid test structure: ${file}`, 'fail')
          }

          // Check for imports
          if (content.includes('import')) {
            this.passed.push(`Has imports: ${file}`)
            this.log(`Imports OK: ${file}`, 'pass')
          } else {
            this.warnings.push(`No imports found: ${file}`)
            this.log(`No imports found: ${file}`, 'warn')
          }

          // Count test cases
          const testCases = (content.match(/it\(/g) || []).length
          if (testCases > 0) {
            this.passed.push(`${testCases} test cases in ${file}`)
            this.log(`${testCases} test cases in ${file}`, 'pass')
          }

        } catch (error) {
          this.issues.push(`Could not read test file ${file}: ${error.message}`)
          this.log(`Error reading ${file}: ${error.message}`, 'fail')
        }
      }
    })
  }

  validateTypeScript() {
    this.log('Validating TypeScript configuration...', 'info')

    const tsFiles = ['tsconfig.json', 'tests/tsconfig.json']
    
    tsFiles.forEach(file => {
      if (fs.existsSync(file)) {
        try {
          const tsConfig = JSON.parse(fs.readFileSync(file, 'utf8'))
          
          if (tsConfig.compilerOptions) {
            this.passed.push(`TypeScript config valid: ${file}`)
            this.log(`TypeScript config OK: ${file}`, 'pass')
            
            // Check for Jest types
            if (tsConfig.compilerOptions.types && tsConfig.compilerOptions.types.includes('jest')) {
              this.passed.push(`Jest types configured: ${file}`)
              this.log(`Jest types OK: ${file}`, 'pass')
            }
          }
        } catch (error) {
          this.warnings.push(`Could not parse TypeScript config ${file}: ${error.message}`)
          this.log(`TypeScript config warning ${file}: ${error.message}`, 'warn')
        }
      }
    })
  }

  generateReport() {
    this.log('\n📊 Test Setup Validation Report', 'info')
    this.log('===============================')
    
    this.log(`✅ Passed: ${this.passed.length}`, 'pass')
    this.log(`⚠️  Warnings: ${this.warnings.length}`, 'warn')
    this.log(`❌ Issues: ${this.issues.length}`, 'fail')

    if (this.issues.length > 0) {
      this.log('\n❌ Critical Issues:', 'fail')
      this.issues.forEach(issue => this.log(`  - ${issue}`, 'fail'))
    }

    if (this.warnings.length > 0) {
      this.log('\n⚠️  Warnings:', 'warn')
      this.warnings.forEach(warning => this.log(`  - ${warning}`, 'warn'))
    }

    const isReady = this.issues.length === 0
    this.log(`\n🎯 Test Setup Status: ${isReady ? 'READY' : 'NEEDS FIXES'}`, isReady ? 'pass' : 'fail')

    if (isReady) {
      this.log('\n🚀 Ready to run comprehensive tests!', 'pass')
      this.log('Run: node run-phase-3b2-tests.js', 'info')
    } else {
      this.log('\n🔧 Please fix the issues above before running tests', 'fail')
    }

    return {
      passed: this.passed.length,
      warnings: this.warnings.length,
      issues: this.issues.length,
      isReady
    }
  }

  async validate() {
    this.log('🔍 Validating Phase 3B.2 Test Setup', 'info')
    this.log('===================================')

    this.validateTestFiles()
    this.validatePackageJson()
    this.validateJestConfig()
    this.validateTestContent()
    this.validateTypeScript()

    return this.generateReport()
  }
}

// Run validation if this file is executed directly
if (require.main === module) {
  const validator = new TestValidator()
  validator.validate()
    .then(report => {
      process.exit(report.isReady ? 0 : 1)
    })
    .catch(error => {
      console.error('Validation failed:', error)
      process.exit(1)
    })
}

module.exports = { TestValidator }
