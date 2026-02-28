# Adventure Racing Application

A full-stack application for visualizing and analyzing adventure racing data in 3D. It allows users to upload race tracks (IGC, KML, KMZ), processes them, and displays them on a CesiumJS globe.

## Architecture Overview

The project is structured as a monorepo with the following components:

- **Client (`/client`):** A React application using Vite and CesiumJS for 3D visualization.
- **Server (`/server`):** A Node.js/Express backend that handles file uploads, parsing, and data storage.
- **Shared (`/shared`):** Shared TypeScript types and utilities used by both client and server.
- **Database:** SQLite is used for metadata storage (`adventure-racing.db`).
- **Object Storage:** MinIO (S3 compatible) is used for storing raw track files and processed data.

## Prerequisites

- **Node.js:** v18 or higher recommended.
- **npm:** Package manager.
- **Docker:** Required for running the MinIO object storage service.

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd adventure-racing
```

### 2. Install Dependencies

Install dependencies for all workspaces from the root directory:

```bash
npm install
```

### 3. Environment Configuration

Copy the example environment file to create your local configuration:

```bash
cp .env.example .env
```

Open the `.env` file and configure the following:

- **MinIO Settings:** The defaults are set up for a local Docker instance (see below).
- **Cesium Ion Token:** You need a free token from [Cesium Ion](https://ion.cesium.com) for the 3D globe to work. Set `VITE_CESIUM_ION_TOKEN`.

### 4. Set up MinIO (Object Storage)

The application requires an S3-compatible storage backend. We use MinIO for local development.

Please follow the detailed instructions in [minio-setup.md](./minio-setup.md) to start the MinIO container and create the required bucket.

### 5. Run the Application

Start both the client and server in development mode concurrently:

```bash
npm run dev
```

- **Client:** Open [http://localhost:5173](http://localhost:5173) in your browser.
- **Server:** The API runs at [http://localhost:3001](http://localhost:3001).

## Documentation

- [Client Documentation](./client/README.md) - Frontend setup and details.
- [Server Documentation](./server/README.md) - Backend setup, API endpoints, and database.
- [MinIO Setup](./minio-setup.md) - Instructions for setting up local object storage.

## Scripts

- `npm run dev`: Start both client and server in watch mode.
- `npm run build`: Build all workspaces (shared, client, server).
- `npm run dev:client`: Start only the client.
- `npm run dev:server`: Start only the server.
