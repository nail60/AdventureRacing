# Adventure Racing Client

The frontend application for the Adventure Racing project, built with React, Vite, and CesiumJS. It provides a 3D visualization of race tracks and scenes.

## Tech Stack

- **React:** UI Framework
- **Vite:** Build tool and development server
- **CesiumJS:** 3D Geospatial visualization
- **Resium:** React components for Cesium
- **Axios:** HTTP client for API requests

## Prerequisites

Before running the client, ensure you have:
1. Node.js (v18+ recommended)
2. A Cesium Ion Token (Get one for free at [https://ion.cesium.com](https://ion.cesium.com))
3. The server running (for API functionality)

## Configuration

The client requires a Cesium Ion token to render the globe and terrain. Create a `.env` file in the root of the monorepo (or ensure the root `.env` is loaded) with the following variable:

```env
VITE_CESIUM_ION_TOKEN=your_cesium_ion_token_here
```

## Development

The project is set up as a monorepo. It is recommended to run commands from the root directory, but you can also run them from within the `client` directory.

### Running the Dev Server

From the project root:
```bash
npm run dev:client
# or
npm run dev # runs both client and server
```

From the `client` directory:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

### Building for Production

From the project root:
```bash
npm run build -w client
```

From the `client` directory:
```bash
npm run build
```

The build artifacts will be output to the `dist` directory.

### Preview Production Build

From the `client` directory:
```bash
npm run preview
```

## Project Structure

- `src/api`: API client functions for communicating with the server.
- `src/components`: Reusable React components.
- `src/pages`: Top-level page components (HomePage, SceneViewerPage).
- `src/hooks`: Custom React hooks.
- `src/utils`: Utility functions.
