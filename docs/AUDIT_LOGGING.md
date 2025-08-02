# RNG Audit Logging System

## Overview

The Primo Poker platform implements comprehensive audit logging for all Random Number Generation (RNG) operations to ensure game integrity and regulatory compliance. All audit logs are stored in Cloudflare R2 for durability and cost-effectiveness.

## Architecture

### Storage Structure

Audit logs are stored in the `primo-poker-rng-audit` R2 bucket with the following structure:

```
primo-poker-rng-audit/
├── audit-logs/
│   ├── {tableId}/
│   │   ├── {timestamp}-{operation}.json
│   │   └── ...
├── rng-backup/
│   ├── {tableId}/
│   │   └── {timestamp}.json
├── batch-audit/
│   └── {date}/
│       └── {hour}/
│           └── batch-{timestamp}.json
└── security-alert/
    └── {tableId}/
        └── {alertId}.json
```

### Audit Log Entry Structure

Each audit log entry contains:

```typescript
interface AuditLogEntry {
  id: string;                    // Unique identifier
  timestamp: string;             // ISO 8601 timestamp
  tableId: string;               // Table identifier
  gameId: string;                // Game identifier
  operation: string;             // Operation type (shuffle, deal, etc.)
  entropyUsed: string;           // SHA-256 hash of entropy
  inputHash: string;             // Hash of input data
  outputHash: string;            // Hash of output data
  verificationHash: string;      // Hash for verification
  serverSeed: string;            // Server seed hash
  clientSeeds: string[];         // Client seed hashes
  metadata: {
    algorithmVersion: string;
    securityLevel: string;
    performanceMetrics: {
      duration: number;
      cpuTime: number;
    };
  };
}
```

## Security Features

### 1. Cryptographic Hashing
- All sensitive data (cards, seeds) are hashed using SHA-256 before storage
- Original values are never stored in audit logs
- Hashes allow verification without exposing game data

### 2. Tamper Detection
- Each log entry includes a verification hash
- Chain of hashes ensures temporal integrity
- Any modification invalidates subsequent entries

### 3. Access Control
- R2 bucket access restricted by IAM policies
- Audit logs are write-once, read-many
- Separate permissions for writing vs. reading

### 4. Automatic Alerts
Security alerts are generated for:
- Invalid verification attempts
- Suspicious access patterns
- Failed integrity checks
- Unusual RNG requests

## Compliance Features

### Data Retention
- Audit logs: 90 days (configurable)
- Security alerts: 180 days
- Backup snapshots: 30 days

### Regulatory Requirements
The system meets requirements for:
- Gaming commission audits
- Fair play verification
- Dispute resolution
- Security incident investigation

## Implementation Details

### Writing Audit Logs

```typescript
// Audit log is automatically created for each RNG operation
const auditLog = await this.createAuditLog(
  'shuffle',
  request.tableId,
  request.gameId,
  shuffleResult.shuffleProof.entropyUsed,
  await CryptoHelpers.sha256Hex(JSON.stringify(deck)),
  shuffleResult.shuffleProof.shuffledHash,
  verificationHash,
  await CryptoHelpers.sha256Hex(serverSeed),
  hashedClientSeeds
);
```

### Batch Processing
- Logs are batched every hour for efficiency
- Reduces R2 API calls and costs
- Maintains real-time availability

### Backup Strategy
- Automatic backups triggered on:
  - Storage threshold (1000 entries)
  - Time interval (hourly)
  - Manual trigger

## Monitoring and Alerts

### CloudWatch Integration
- Log volume metrics
- Error rate monitoring
- Performance tracking
- Cost analysis

### Alert Conditions
1. **High Error Rate**: > 1% failed operations
2. **Performance Degradation**: > 500ms operation time
3. **Storage Issues**: Failed R2 writes
4. **Security Events**: Invalid access attempts

## Cost Optimization

### Storage Costs
- R2 Storage: $0.015 per GB-month
- No egress fees for audit retrieval
- Lifecycle policies for automatic cleanup

### Optimization Strategies
1. Compress logs before storage
2. Batch writes to reduce API calls
3. Use lifecycle rules for old data
4. Archive compliance data to cold storage

## Verification Tools

### Audit Log Verification
```bash
# Verify audit log integrity
npm run verify-audit --table-id=<tableId> --date=<date>

# Export audit logs for external review
npm run export-audit --start-date=<date> --end-date=<date>
```

### Compliance Reports
```bash
# Generate compliance report
npm run compliance-report --month=<YYYY-MM>

# RNG fairness analysis
npm run rng-analysis --table-id=<tableId>
```

## Setup Instructions

### 1. Create R2 Buckets

Run the GitHub Actions workflow:
```bash
# Via GitHub CLI
gh workflow run create-r2-buckets.yml -f environment=production

# Or use the GitHub UI:
# Actions → Create R2 Buckets → Run workflow
```

### 2. Enable Audit Logging

The AUDIT_BUCKET is configured in `wrangler.toml`:
```toml
[[r2_buckets]]
binding = "AUDIT_BUCKET"
bucket_name = "primo-poker-rng-audit"
preview_bucket_name = "primo-poker-rng-audit-preview"
```

### 3. Deploy Application

Deploy with audit logging enabled:
```bash
npm run deploy
```

### 4. Verify Setup

Check audit logging is working:
```bash
# Test RNG operation
curl -X POST https://primo-poker-server.alabamamike.workers.dev/api/rng/shuffle \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"tableId": "test-table", "gameId": "test-game"}'

# Verify audit log was created (check R2 bucket in Cloudflare dashboard)
```

## Troubleshooting

### Common Issues

1. **"AUDIT_BUCKET not found" error**
   - Ensure R2 bucket is created
   - Check bucket name matches configuration
   - Verify API token has R2 permissions

2. **Audit logs not appearing**
   - Check SecureRNGDurableObject logs
   - Verify R2 write permissions
   - Check for batching delay (hourly)

3. **Performance impact**
   - Enable batch mode for high-volume tables
   - Adjust batch size and interval
   - Monitor R2 API rate limits

### Debug Mode

Enable debug logging:
```typescript
// In SecureRNGDurableObject
this.debugMode = true; // Logs detailed audit operations
```

## Future Enhancements

1. **Real-time Streaming**: Stream audit logs to analytics platform
2. **ML Anomaly Detection**: Identify unusual patterns automatically
3. **Blockchain Integration**: Immutable audit trail on-chain
4. **Advanced Analytics**: Player behavior and game fairness metrics