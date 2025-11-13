# Coding Style Guide

## Language
- **TypeScript** (strict mode enabled)
- Target: ES2022
- Module: ESNext

## Naming Conventions

### Files
- `kebab-case.ts` for modules
- `*.test.ts` for test files
- `*.types.ts` for type definitions

### Functions
- `camelCase` for functions and methods
- Descriptive verb-noun combinations
- Example: `fetchDriveChanges`, `upsertVectorToQdrant`

### Classes/Interfaces
- `PascalCase` for class and interface names
- Prefix interfaces with `I` only if necessary for disambiguation
- Example: `DriveFileMetadata`, `QdrantClient`

### Constants
- `UPPER_SNAKE_CASE` for true constants
- Example: `MAX_BATCH_SIZE`, `DEFAULT_CHUNK_SIZE`

### Variables
- `camelCase` for variables
- Descriptive names over abbreviations
- Example: `startPageToken`, `embeddingBatchSize`

## Code Organization

### Module Structure
```typescript
// 1. Imports (external first, then internal)
// 2. Type definitions
// 3. Constants
// 4. Helper functions
// 5. Main exported functions/classes
```

### Function Size
- Max 50 lines per function
- Extract complex logic into helper functions
- One level of abstraction per function

## TypeScript Best Practices
- Avoid `any` - use `unknown` or specific types
- Use `const` by default, `let` when mutation needed
- Prefer functional patterns over imperative
- Use async/await over raw Promises
- Type all function parameters and returns explicitly

## Error Handling
- Use custom Error classes for domain errors
- Always include context in error messages
- Log errors with structured data
- Never swallow errors silently

## Comments
- JSDoc for public APIs
- Inline comments for complex logic only
- Prefer self-documenting code over comments
- English only

## Formatting
- 2 spaces indentation
- Semicolons required
- Single quotes for strings
- Trailing commas in multiline objects/arrays
- Max line length: 100 characters

## Testing
- Co-locate test files with source
- Use `describe` and `it` for test organization
- One assertion concept per test
- Mock external dependencies
- Aim for 80%+ code coverage
