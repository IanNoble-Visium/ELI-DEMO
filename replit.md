# ELI Ingestion API - Node.js + Express

## Overview

The ELI (Ethical Layered Intelligence) Ingestion API is a standalone REST service designed to ingest IREX (Intelligent Real-time Event eXchange) events and snapshots. The system processes incoming event data, stores it across multiple databases, uploads images to cloud storage, and triggers AI analytics pipelines. It serves as the primary data ingestion point for a comprehensive surveillance and analytics platform.

The API supports both legacy two-step ingestion (separate event and snapshot uploads) and modern webhook-based ingestion (single payload with embedded images). All processed data flows through PostgreSQL for structured storage, Neo4j for graph relationships, and Cloudinary for image hosting, with AI processing handled asynchronously via Google Pub/Sub.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Application Framework
- **Node.js + Express**: RESTful API server with JSON payload handling
- **Configuration Management**: Environment-based config with dotenv support
- **Logging**: Structured logging via Pino with development-friendly pretty printing
- **Mock Mode**: Built-in development mode that stubs external services for offline testing

### Data Storage Architecture
- **PostgreSQL**: Primary relational database for events, snapshots, AI detections, baselines, and webhook request logs
- **Neo4j**: Graph database for modeling relationships between events, channels, detections, and entities
- **Dual-write Pattern**: Data is written to both PostgreSQL (source of truth) and Neo4j (relationships) to support different query patterns

### API Design Patterns
- **Legacy Ingestion**: Two-step process (`/ingest/event` → `/ingest/snapshot`) matching external system specifications
- **Modern Webhook**: Single-payload ingestion (`/webhook/irex`) with embedded base64 images and nested channel data
- **Array Support**: Batch processing capability for multiple events in a single webhook call
- **Validation**: Zod schemas for strict input validation with detailed error responses

### Image Processing Pipeline
- **Data URI Support**: Handles both raw base64 and data URI formats (`data:image/png;base64,`)
- **Cloudinary Integration**: Automatic upload to cloud storage with organized folder structure
- **Graceful Degradation**: Image upload failures don't block event processing

### AI Analytics Integration
- **Pub/Sub Decoupling**: Events trigger AI jobs via Google Cloud Pub/Sub for async processing
- **Separate AI Worker**: Dedicated Cloud Run service handles compute-intensive AI tasks
- **Detection Storage**: AI results stored back to PostgreSQL with graph linking in Neo4j
- **Baseline Analytics**: Automatic anomaly detection based on rolling statistical baselines

### Authentication & Debug Features
- **Token-based Debug Access**: Optional debug dashboard with configurable token authentication
- **CORS Support**: Configurable cross-origin access for frontend integrations
- **Health Monitoring**: Comprehensive health checks and request logging

### Error Handling & Resilience
- **Graceful Failures**: Missing configurations don't crash the service; components degrade gracefully
- **Comprehensive Logging**: Request/response logging with error tracking for debugging
- **Input Validation**: Strict schema validation with detailed error messages for API consumers

## External Dependencies

### Databases
- **PostgreSQL**: Primary data store (required for live mode)
  - Expects schema with events, snapshots, ai_detections, ai_baselines, ai_anomalies, webhook_requests tables
  - Connection via DATABASE_URL environment variable
  - SSL support for managed database services

- **Neo4j**: Graph database for relationship modeling (required for live mode)
  - Supports both self-hosted and Aura cloud instances
  - Configured via NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE

### Cloud Services
- **Cloudinary**: Image hosting and management (required for live mode)
  - Handles image uploads with automatic optimization
  - Configured via CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
  - Organized uploads in configurable folder structure

- **Google Cloud Platform**: AI and messaging infrastructure
  - **Pub/Sub**: Asynchronous job queuing for AI processing
  - **Vertex AI**: Machine learning models for object detection and content analysis
  - **Cloud Run**: Serverless deployment target

### Development & Testing
- **Jest**: Testing framework with mock and live integration test support
- **Supertest**: HTTP testing for API endpoints
- **Nodemon**: Development server with hot reloading
- **Pino Pretty**: Development logging formatter

### Node.js Dependencies
- **Express 5.x**: Web framework with enhanced JSON handling
- **Zod**: Schema validation and type safety
- **Neo4j Driver**: Official Neo4j client library
- **pg**: PostgreSQL client with connection pooling
- **@google-cloud/pubsub**: Google Cloud messaging client
- **@google-cloud/vertexai**: AI platform integration for the worker service