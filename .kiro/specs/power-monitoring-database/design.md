# Design Document

## Overview

This design implements a SQLite database with time series functionality using Prisma ORM to store power monitoring data from multiple stations. The system will replace file-based logging with a structured database approach, enabling efficient querying, historical analysis, and data management for power consumption monitoring.

The solution integrates with the existing Node.js monitoring system that collects real-time data from stations via WebSocket connections. The database will store structured time series data with proper indexing for optimal query performance.

## Architecture

### Database Layer
- **SQLite Database**: Single-file database for simplicity and portability
- **Prisma ORM**: Type-safe database client with migration support
- **Time Series Schema**: Optimized for temporal data storage and querying

### Integration Layer
- **Data Adapter**: Transforms monitoring data into database records
- **Migration Service**: Handles existing log file data import
- **Query Service**: Provides structured data access methods

### Application Integration
- **Monitor Integration**: Extends existing StationMonitor class
- **Batch Processing**: Handles bulk data operations efficiently
- **Error Handling**: Graceful failure handling with retry mechanisms

## Components and Interfaces

### Database Schema

```prisma
// Station model for reference data
model Station {
  id          String   @id @default(cuid())
  name        String   @unique
  uuid        String   @unique
  ipAddress   String
  scene       String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relationship to power readings
  powerReadings PowerReading[]
  
  @@map("stations")
}

// Main time series data model
model PowerReading {
  id          String   @id @default(cuid())
  stationId   String
  timestamp   DateTime
  
  // Active Power readings (Watts)
  activePower1  Float?
  activePower2  Float?
  activePower3  Float?
  activePower4  Float?
  activePower5  Float?
  activePower6  Float?
  
  // MUX Power Meter readings (kWh)
  muxPower1     Float?  // TV5
  muxPower2     Float?  // MCOT
  muxPower3     Float?  // PRD
  muxPower4     Float?  // TPBS
  
  createdAt   DateTime @default(now())
  
  // Relationships
  station     Station  @relation(fields: [stationId], references: [id])
  
  // Indexes for time series queries
  @@index([stationId, timestamp])
  @@index([timestamp])
  @@map("power_readings")
}

// Metadata for tracking data sources and quality
model DataSource {
  id          String   @id @default(cuid())
  source      String   // "websocket", "log_migration", "manual"
  description String?
  createdAt   DateTime @default(now())
  
  @@map("data_sources")
}
```

### Core Services

#### DatabaseService
```typescript
interface DatabaseService {
  // Connection management
  connect(): Promise<void>
  disconnect(): Promise<void>
  
  // Station management
  createStation(data: StationData): Promise<Station>
  getStation(identifier: string): Promise<Station | null>
  
  // Power reading operations
  createPowerReading(data: PowerReadingData): Promise<PowerReading>
  createBatchPowerReadings(data: PowerReadingData[]): Promise<number>
  
  // Query operations
  getPowerReadings(filters: QueryFilters): Promise<PowerReading[]>
  getLatestReading(stationId: string): Promise<PowerReading | null>
  getReadingsByTimeRange(stationId: string, start: Date, end: Date): Promise<PowerReading[]>
}
```

#### MigrationService
```typescript
interface MigrationService {
  // Log file processing
  parseLogFile(filePath: string): Promise<LogEntry[]>
  migrateLogData(entries: LogEntry[]): Promise<MigrationResult>
  
  // Data validation
  validateLogEntry(entry: LogEntry): boolean
  transformLogEntry(entry: LogEntry): PowerReadingData
}
```

#### MonitoringIntegration
```typescript
interface MonitoringIntegration {
  // Real-time data handling
  onDataReceived(stationName: string, data: MonitorData): Promise<void>
  
  // Batch operations
  flushPendingData(): Promise<void>
  
  // Error handling
  handleDatabaseError(error: Error): void
}
```

## Data Models

### PowerReadingData
```typescript
interface PowerReadingData {
  stationId: string
  timestamp: Date
  activePower1?: number
  activePower2?: number
  activePower3?: number
  activePower4?: number
  activePower5?: number
  activePower6?: number
  muxPower1?: number
  muxPower2?: number
  muxPower3?: number
  muxPower4?: number
}
```

### QueryFilters
```typescript
interface QueryFilters {
  stationId?: string
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
  orderBy?: 'timestamp' | 'createdAt'
  orderDirection?: 'asc' | 'desc'
}
```

### LogEntry
```typescript
interface LogEntry {
  station: string
  timestamp: Date
  readings: {
    [key: string]: number
  }
}
```

## Error Handling

### Database Connection Errors
- Implement connection retry logic with exponential backoff
- Graceful degradation to file logging if database unavailable
- Connection health monitoring and automatic reconnection

### Data Validation Errors
- Schema validation for incoming data
- Type checking and range validation for power readings
- Duplicate detection and handling strategies

### Migration Errors
- Partial migration recovery mechanisms
- Error logging and reporting for failed entries
- Data integrity verification after migration

### Performance Considerations
- Batch insert operations for high-throughput scenarios
- Connection pooling for concurrent operations
- Query optimization with proper indexing

## Testing Strategy

### Unit Testing
- Database service method testing with in-memory SQLite
- Data transformation and validation logic testing
- Error handling scenario testing

### Integration Testing
- End-to-end data flow testing from WebSocket to database
- Migration service testing with sample log files
- Query performance testing with large datasets

### Performance Testing
- Load testing with high-frequency data insertion
- Query performance benchmarking
- Memory usage monitoring during batch operations

### Data Integrity Testing
- Migration accuracy verification
- Concurrent write operation testing
- Database corruption recovery testing

## Deployment Considerations

### Database File Management
- SQLite file location and permissions configuration
- Backup and restore procedures
- Database file size monitoring and rotation

### Migration Strategy
- Prisma migration deployment process
- Schema version compatibility checking
- Rollback procedures for failed migrations

### Monitoring and Maintenance
- Database performance metrics collection
- Automated backup scheduling
- Data retention and archival policies

### Security Considerations
- Database file access permissions
- SQL injection prevention through Prisma
- Data encryption at rest (if required)

## Performance Optimizations

### Indexing Strategy
- Composite index on (stationId, timestamp) for common queries
- Timestamp index for time-range queries
- Consider partial indexes for non-null power readings

### Batch Processing
- Bulk insert operations for migration and high-throughput scenarios
- Transaction management for data consistency
- Memory-efficient streaming for large datasets

### Query Optimization
- Prepared statements through Prisma
- Result pagination for large datasets
- Caching strategies for frequently accessed data

### Storage Optimization
- Data type optimization (Float vs Decimal considerations)
- Nullable fields for optional power readings
- Periodic data cleanup and archival strategies