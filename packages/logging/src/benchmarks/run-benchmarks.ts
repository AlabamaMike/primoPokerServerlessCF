import { LoggerBenchmark } from './logger-benchmark';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface BenchmarkReport {
  timestamp: string;
  environment: {
    node: string;
    platform: string;
    arch: string;
    cpus: number;
    isCI: boolean;
  };
  results: any[];
  baselines?: Record<string, number>;
}

async function runBenchmarks() {
  console.log('🚀 Starting Logger Performance Benchmarks\n');
  console.log(`Environment: Node ${process.version} on ${process.platform} ${process.arch}`);
  console.log(`CPUs: ${os.cpus().length} cores\n`);
  
  const benchmark = new LoggerBenchmark();
  const results = await benchmark.runAll();
  
  benchmark.printSummary();
  
  // Generate report
  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      isCI: process.env.CI === 'true'
    },
    results: results
  };
  
  // Save results to file
  const outputDir = path.join(__dirname, '..', '..', 'benchmark-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = path.join(outputDir, `benchmark-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
  
  console.log(`\n📊 Results saved to: ${outputFile}`);
  
  // Check against baselines if they exist
  const baselineFile = path.join(outputDir, 'baseline.json');
  if (fs.existsSync(baselineFile)) {
    const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    console.log('\n=== Performance vs Baseline ===\n');
    
    for (const result of results) {
      const baselineOps = baseline.baselines?.[result.name];
      if (baselineOps) {
        const diff = ((result.ops - baselineOps) / baselineOps) * 100;
        const status = diff >= -5 ? '✅' : '⚠️';
        console.log(`${status} ${result.name}: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`);
      }
    }
  } else {
    // Create baseline
    const baselines: Record<string, number> = {};
    for (const result of results) {
      baselines[result.name] = result.ops;
    }
    
    const baselineReport: BenchmarkReport = {
      ...report,
      baselines
    };
    
    fs.writeFileSync(baselineFile, JSON.stringify(baselineReport, null, 2));
    console.log(`\n📏 Baseline created: ${baselineFile}`);
  }
}

// Run benchmarks
runBenchmarks().catch(console.error);