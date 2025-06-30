# N-WAVE Backend

The backend server for **N-WAVE: Nextflow Workflow Authoring and Visualization Environment**. This provides the API layer for the web interface, handling workflow execution, workflow metadata, and file metadata (not file contents).

## Features

- **Workflow Execution**: Execute Nextflow workflows with real-time progress tracking
- **Workflow Metadata Management**: Store and retrieve workflow definitions and settings
- **File Metadata Management**: Store and retrieve file names and metadata (actual files are stored in the browser, not on the backend)
- **RESTful API**: Clean API endpoints for frontend integration
- **CORS Support**: Configured for cross-origin requests from the frontend

## Prerequisites

- Node.js (v18 or higher)
- MongoDB (v5 or higher)
- pnpm (recommended) or npm

## Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/dariodaddamio/N-WAVE.git
   cd n-wave/backend
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Environment Configuration**

   ```bash
   cp env.example .env
   ```

   Edit `.env` and configure:

   - `MONGODB_URI`: Your MongoDB connection string
   - `PORT`: Server port (default: 5001)
   - `NODE_ENV`: Environment (development/production)
   - `CORS_ORIGIN`: Frontend URL for CORS

4. **Start MongoDB**
   Ensure MongoDB is running on your system or use a cloud service.

5. **Run the development server**

   ```bash
   pnpm dev
   ```

   The server will start on `http://localhost:5001`

## API Endpoints

### Files (Metadata Only)

- `GET /api/files` - List all file metadata
- `POST /api/files/upload` - Register a new file's metadata
- `GET /api/files/:id` - Get file metadata details
- `DELETE /api/files/:id` - Delete file metadata

### Workflows

- `GET /api/workflows` - List all workflows
- `POST /api/workflows` - Create a new workflow
- `GET /api/workflows/:id` - Get workflow details
- `PUT /api/workflows/:id` - Update a workflow
- `DELETE /api/workflows/:id` - Delete a workflow

### Execution

- `POST /api/execute` - Execute a workflow

## Development

### Project Structure

```
src/
├── config/        # Database and server configuration
├── controllers/   # Request handlers and business logic
├── models/        # MongoDB schemas and models
├── routes/        # API route definitions
├── middleware/    # (Optional) Express middleware (auth, logging, etc.)
├── services/      # (Optional) Business logic/services
├── utils/         # (Optional) Utility/helper functions
├── validators/    # (Optional) Request validation logic
├── jobs/          # (Optional) Background jobs or scheduled tasks
├── types/         # (Optional) TypeScript type definitions
├── tests/         # (Optional) Backend tests
└── server.ts      # Main server entry point
```

> **Note:** The structure is modular and can be extended as the project grows. Add new folders (e.g., `middleware/`, `services/`, `utils/`, `validators/`, `jobs/`, `types/`, `tests/`) as needed to keep code organized and maintainable.

### Scripts

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Compile TypeScript to JavaScript
- `pnpm start` - Start production server

## Contributing

### Adding New Features

1. **API Endpoints**: Add new routes in `src/routes/`
2. **Business Logic**: Implement controllers in `src/controllers/`
3. **Data Models**: Define schemas in `src/models/`
4. **Configuration**: Update config files as needed

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for public functions
- Use proper error handling and validation

### Testing

- Test API endpoints manually during development
- Ensure proper error responses
- Validate input data and file uploads

## Feature Requests & Contribution Direction

N-WAVE is designed to bring the full power of Nextflow to an intuitive web interface, making complex scientific workflows accessible to all researchers.

### High-Impact Feature Areas

- **Expanded Node & Operator Support**: Add more built-in nodes/operators for common and advanced Nextflow processes (beyond FastQC and Trimmomatic), enabling a broader range of bioinformatics and data science workflows.
- **User Experience & Usability**: Prioritize features that make it easy to build, visualize, and run complicated scientific workflows—focus on drag-and-drop, real-time validation, and clear error feedback.
- **Workflow Import & Visualization**: Enable users to import existing Nextflow scripts and have them automatically mapped out as visual workflows in N-WAVE.
- **Cloud & Storage Integration**: Add support for cloud storage backends (e.g., S3 buckets) and other scalable storage technologies for large datasets, or some pipeline connecting these data warehouses for a more direct use in the workflow.
- **Workflow Sharing & Collaboration**: Support sharing, versioning, and collaborative editing of workflows, including a public or private workflow library.
- **Security & Compliance**: Plan for user authentication, access control, and data privacy/compliance features as the platform matures.
- **Deployment & Scalability**: Explore deployment options (monorepo, split frontend/backend, cloud platforms like Vercel) to ensure N-WAVE can scale with user needs.

## License

This project is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0). See the [LICENSE](LICENSE) file for details.

## Support

For questions or issues:

1. Check existing issues in the repository
2. Create a new issue with detailed description
3. Join our community discussions

---

**N-WAVE** - Making Nextflow workflows accessible to everyone.
