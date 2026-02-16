# Adventure Racing Server

The backend application for the Adventure Racing project, built with Express and Node.js. It handles file uploads (IGC, KML, KMZ), processes geospatial data, and manages storage using MinIO (S3) and SQLite.

## Tech Stack

- **Node.js & Express:** Web server framework
- **TypeScript:** Language
- **SQLite (better-sqlite3):** Metadata database
- **MinIO (S3):** Object storage for raw and processed files
- **Multer:** File upload handling
- **@aws-sdk/client-s3:** S3 client for MinIO communication

## Prerequisites

Before running the server, ensure you have:
1. Node.js (v18+ recommended)
2. MinIO running and configured (see `../minio-setup.md`)

## Configuration

The server configuration is managed via environment variables. Ensure a `.env` file exists in the root of the monorepo with the following variables:

```env
PORT=3001
DATABASE_PATH=./data/adventure-racing.db

# MinIO / S3 Configuration
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=adventure-racing
S3_REGION=us-east-1
```

## Development

The project is set up as a monorepo. It is recommended to run commands from the root directory, but you can also run them from within the `server` directory.

### Running the Dev Server

From the project root:
```bash
npm run dev:server
# or
npm run dev # runs both client and server
```

From the `server` directory:
```bash
npm run dev
```

The server will be available at `http://localhost:3001`.

### Building for Production

From the project root:
```bash
npm run build -w server
```

From the `server` directory:
```bash
npm run build
```

### Starting the Production Server

From the `server` directory:
```bash
npm start
```

## API Endpoints

### Upload
- `POST /api/upload`: Upload scene files (IGC, KML, KMZ).
  - Body (multipart/form-data):
    - `sceneName`: string
    - `files`: file[]

### Scenes
- `GET /api/scenes`: List all scenes.
- `GET /api/scenes/:id`: Get details for a specific scene.
- `DELETE /api/scenes/:id`: Delete a scene.
- `GET /api/scenes/:id/tracks/:tracklogId`: Get compressed track data for visualization.

### Tracklogs
- `GET /api/tracklogs`: List all processed tracklogs.
- `GET /api/tracklogs/:id`: Get details for a specific tracklog.

## Database

The application uses SQLite for storing metadata about scenes and tracklogs. The database file is automatically created at startup at the path specified by `DATABASE_PATH` (default: `./data/adventure-racing.db`). No manual migration steps are required for development.
