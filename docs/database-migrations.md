# Database Migrations Guide

This project uses Prisma Migrate for database schema management. 

## Development Process

1. **Modify Schema**: Edit `packages/db/prisma/schema.prisma`.
2. **Create Migration**: Run `pnpm db:migrate:dev`. This will create a new migration folder in `packages/db/prisma/migrations`.
3. **Commit**: Commit the schema file and the new migration folder.

## Production Process

1. **Apply Migrations**: During deployment, the CI/CD pipeline should run `pnpm db:migrate:deploy`.
2. **Never push directly**: Do not use `db:push` in production as it can lead to data loss and drifted schemas.

## Rollback Strategy

1. **Identify failed migration**: Check `prisma migrate status`.
2. **Manual Intervention**: If a migration fails halfway, manually fix the database state to match the last successful migration.
3. **Re-run**: After fixing, run `prisma migrate deploy` again.

## Best Practices

- Always name your migrations descriptively.
- Review the generated SQL before committing if the migration is complex.
- Test migrations on a staging environment that mirrors production data (anonymized).
