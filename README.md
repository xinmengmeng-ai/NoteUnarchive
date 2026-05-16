# NoteUnarchive

[中文](README.zh-CN.md) | English

NoteUnarchive is a local-first desktop tool for exporting notes from locally stored note application data into open formats.

It does not require cloud API access, account passwords, or remote synchronization during export. Only notes already available in the local client cache can be exported.

## Supported Sources

| Source | Local data | Status |
| --- | --- | --- |
| Youdao Note | SQLite database and cached note files | v1.0 |

## Roadmap

These sources are planned for future releases and are not supported in v1.0:

- Evernote / Yinxiang Note
- Kingsoft Docs

## Export Formats

- Markdown: note content with local asset references
- JSON: structured note data for further processing
- HTML: standalone documents viewable in a browser

## Requirements

- Windows 10/11 x64
- Node.js 18+

## Development

Install dependencies:

```bash
npm install
```

Rebuild native dependencies for Electron:

```bash
npm run rebuild
```

Run the app:

```bash
npm start
```

Run tests:

```bash
npm test
```

Build Windows artifacts:

```bash
npm run build
```

Build output is written to `dist/`.

## Project Structure

```text
src/
  main/        Electron main process, IPC, source adapters, converters, exporter
  renderer/    HTML renderer and UI assets
build/         Packaging assets
scripts/       Development and packaging scripts
tests/         Jest tests and fixtures
```

## Notes

- The app reads local data only and does not upload note content.
- Export quality depends on the completeness of the local note cache.
- Some rich text styles may be normalized to Markdown-compatible output.

## License

MIT
