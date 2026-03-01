# Singularity Ingestion Pipeline

A high-performance data ingestion pipeline built with Bun for syncing local files to Cloudflare R2 storage. Designed for speed, reliability, and zero-copy streaming, this pipeline efficiently handles hundreds of files with intelligent deduplication and retry logic.

## 🚀 Features

- **⚡ Blazing Fast**: Built on Bun's zero-copy streaming for maximum throughput
- **🔄 Recursive Directory Scanning**: Automatically syncs all files in subdirectories
- **🎯 Smart Deduplication**: Bulk-fetches existing R2 objects to skip re-uploads
- **🔁 Intelligent Retry Logic**: Exponential backoff for transient failures
- **   Configurable Concurrency**: Optimized pool-based parallelism (default: 30 concurrent uploads)
- **📝 Auto Content-Type Detection**: Automatic MIME type assignment based on file extensions
- **📊 Real-time Progress**: Detailed logging with upload/skip/failure counts
- **🛡️ Production Ready**: Exit codes for CI/CD integration

## 📋 Prerequisites

- [Bun](https://bun.sh) v1.0 or higher
- Cloudflare R2 account with API credentials
- Node.js v18+ (for compatibility)

## 🔧 Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd singularity-ingestion-pipeline
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Configure environment variables**:
   
   Create a `.env` file in the project root:
   ```env
   R2_ACCESS_KEY_ID=your_access_key_id_here
   R2_SECRET_ACCESS_KEY=your_secret_access_key_here
   ```

4. **Update R2 configuration** (optional):
   
   Edit `index.ts` to match your R2 bucket settings:
   ```typescript
   const r2 = new S3Client({
     accessKeyId: process.env.R2_ACCESS_KEY_ID!,
     secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
     bucket: "your-bucket-name",
     endpoint: "https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com",
   });
   ```

## 🎯 Usage

### Basic Sync

Sync all files from the `docs/` directory to R2:

```bash
bun run index.ts
```

### Expected Output

```
🔍 Scanning ./docs (including all subdirectories)…
📦 Found 15 local files (including subdirectories)
☁️  Fetching existing R2 keys under "docs"…
   3 objects already in bucket
⏭️  Skipped (exists): docs/README.md
✅ Uploaded: docs/api/endpoints.md
✅ Uploaded: docs/guides/getting-started.md
✅ Uploaded: docs/guides/advanced/configuration.md
...

─────────────────────────────────
🎉 Sync complete!
   ✅ Uploaded : 12
   ⏭️  Skipped  : 3
   ❌ Failed   : 0
─────────────────────────────────
```

## 📁 Project Structure

```
singularity-ingestion-pipeline/
├── docs/                          # Files to be synced to R2
│   ├── api/                       # API documentation
│   │   └── endpoints.md
│   ├── guides/                    # User guides
│   │   ├── getting-started.md
│   │   └── advanced/
│   │       └── configuration.md
│   └── README.md
├── index.ts                       # Main pipeline script
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
└── README.md                      # This file
```

## ⚙️ Configuration

### Performance Tuning

Adjust these constants in `index.ts` based on your needs:

```typescript
const CONCURRENCY = 30;       // Parallel upload limit
const MAX_RETRIES = 3;        // Retry attempts per file
const RETRY_BASE_MS = 500;    // Base delay for exponential backoff
```

**Recommended Settings by File Size:**

| File Size    | Concurrency | Use Case              |
|--------------|-------------|-----------------------|
| < 100 KB     | 50          | Small docs/configs    |
| 100 KB - 1 MB| 30          | Medium docs/images    |
| 1 MB - 10 MB | 10          | Large images/PDFs     |
| > 10 MB      | 5           | Videos/archives       |

### Supported File Types

The pipeline automatically detects and sets content types for:

- **Markdown**: `.md`, `.markdown` → `text/markdown; charset=utf-8`
- **Text**: `.txt` → `text/plain; charset=utf-8`
- **HTML**: `.html` → `text/html; charset=utf-8`
- **JSON**: `.json` → `application/json`
- **Images**: `.jpg`, `.jpeg`, `.png`, `.svg`
- **PDF**: `.pdf` → `application/pdf`
- **Default**: `application/octet-stream` (for unrecognized types)

Extend the `getContentType()` function to support additional formats.

## 🔄 How It Works

1. **Recursive Scan**: Reads all files in `docs/` and subdirectories
2. **Bulk Fetch**: Fetches all existing R2 object keys in one request
3. **Smart Skip**: Compares local files against R2 to avoid re-uploads
4. **Pooled Upload**: Processes files with bounded concurrency
5. **Retry Logic**: Retries failed uploads with exponential backoff
6. **Report Results**: Displays detailed statistics on completion

## 🛠️ Advanced Usage

### Custom Directory and Prefix

Modify the last line in `index.ts`:

```typescript
// Sync a different directory to a different R2 prefix
await syncDirectoryToR2("./my-assets", "assets");
```

### Multiple bucket permissions**: Apply least-privilege access to your R2 bucket
5. **Enable encryption**: Use R2's encryption at rest features

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Open a Pull Request

## 📚 Additional Resources

- [Bun Documentation](https://bun.sh/docs)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [S3-Compatible API Reference](https://docs.aws.amazon.com/AmazonS3/latest/API/)
- [Getting Started Guide](./docs/guides/getting-started.md)
- [Advanced Configuration](./docs/guides/advanced/configuration.md)

## 📝 License

This project is created using Bun v1.3.10. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## 🙏 Acknowledgments

- Built with [Bun](https://bun.sh) for maximum performance
- Powered by [Cloudflare R2](https://www.cloudflare.com/products/r2/) for scalable object storage
- Inspired by modern DevOps practices for efficient data pipelines

---

**Made by the Singularity team**