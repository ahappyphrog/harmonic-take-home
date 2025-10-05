# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important: Do Not Run the Project

**NEVER run `npm run dev`, `docker compose up`, or any commands that start the backend or frontend servers.** Both the backend and frontend are already running in separate terminal sessions. Running them again will cause port conflicts and errors.

## Project Overview

This is a fullstack application with a Python FastAPI backend and React TypeScript frontend, built as a take-home assignment. The application manages companies and company collections with a focus on displaying and filtering company data.

## Architecture

### Backend (FastAPI + PostgreSQL)
- **Tech Stack**: FastAPI, SQLAlchemy, PostgreSQL, Docker
- **Location**: `/backend/`
- **Database Models** (in `backend/db/database.py`):
  - `Company`: Company records with auto-generated names
  - `CompanyCollection`: Named lists/collections of companies
  - `CompanyCollectionAssociation`: Many-to-many relationship between companies and collections
  - `Settings`: Tracks database seeding status
- **API Routes**:
  - `backend/routes/companies.py`: Company endpoints with pagination and "liked" status
  - `backend/routes/collections.py`: Collection metadata and collection-specific company listings
- **Database Seeding**: Happens automatically on first startup (see `main.py:lifespan`), creates 10K companies and 3 pre-populated collections. Note: A database trigger intentionally throttles inserts by 100ms to simulate slow operations.
- **Schema Management**: Tables are created dynamically on server startup via `Base.metadata.create_all()` in the lifespan event

### Frontend (React + TypeScript)
- **Tech Stack**: React 18, TypeScript, Vite, Material-UI, TailwindCSS
- **Location**: `/frontend/`
- **Structure**:
  - `src/App.tsx`: Main app component with collection sidebar and company table
  - `src/components/CompanyTable.tsx`: Data grid for displaying companies
  - `src/utils/jam-api.ts`: API client functions for backend communication
  - `src/utils/useApi.ts`: Custom React hook for API calls with loading/error states
- **Styling**: Hybrid approach using both Material-UI components and TailwindCSS utilities

## Development Commands

### Backend
From the `/backend` directory:

```bash
# Install dependencies (requires Poetry)
poetry install

# Start the backend (spins up FastAPI + PostgreSQL in Docker)
docker compose up

# Reset database (when you need to re-seed or clear data)
docker compose down
docker volume rm backend_postgres_data
docker compose build --no-cache
docker compose up

# Access the database directly
docker ps  # Get the postgres container name
docker exec -it <container_name> /bin/bash
psql -U postgres harmonicjam

# Lint code
poetry run ruff check .
```

- Backend runs at: http://localhost:8000
- API docs (Swagger): http://localhost:8000/docs

### Frontend
From the `/frontend` directory:

```bash
# Install dependencies (requires Node v18+ or v20+)
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Preview production build
npm preview
```

- Frontend runs at: http://localhost:5173

## Key Implementation Details

- **CORS**: Backend is configured to accept requests from `http://localhost:5173` only
- **Pagination**: Both `/companies` and `/collections/{id}` endpoints support `offset` and `limit` query parameters
- **Liked Companies**: The "Liked Companies List" collection is special - companies in this list have their `liked` field set to `true` in API responses
- **Database URL**: Configured via `DATABASE_URL` environment variable (set in docker-compose.yml)
- **Company Names**: Auto-generated using the `randomname` library during seeding

## Testing Database Changes

To modify tables or schemas:
1. Edit models in `backend/db/database.py`
2. Perform a hard reset of the Docker container (see commands above) to recreate tables with new schema
3. Data will be re-seeded automatically on startup

## Design Decision Guidelines

When implementing features, prioritize these principles that align with Harmonic's evaluation criteria:

### End User Experience
- Focus on intuitive, responsive UI/UX
- Provide clear feedback for loading states, errors, and success conditions
- Consider performance implications, especially with large datasets (10K+ companies)
- Ensure accessible and usable interfaces

### Code Maintainability
- Write clean, readable code with clear naming conventions
- Follow established patterns in the codebase (e.g., Pydantic models, React hooks)
- Add comments for complex logic or non-obvious decisions
- Keep components and functions focused on single responsibilities
- Use TypeScript types effectively to catch errors early

### Thoughtful Decision-Making
- Consider trade-offs between performance, complexity, and user experience
- Document why specific approaches were chosen, especially when alternatives exist
- Be prepared to explain architectural decisions (e.g., client-side vs server-side pagination)
- Think about scalability and edge cases

### Stack Alignment
- Backend: Leverage FastAPI features (dependency injection, Pydantic validation, async where beneficial)
- Frontend: Use React best practices (hooks, component composition, proper state management)
- Database: Write efficient SQLAlchemy queries, consider N+1 problems
- Follow existing code style (Ruff for Python, ESLint for TypeScript)
