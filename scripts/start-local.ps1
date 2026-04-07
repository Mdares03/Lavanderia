param(
  [switch]$Migrate
)

if ($Migrate) {
  npm run prisma:migrate
}

npm run prisma:generate
npm run prisma:seed
npm run dev
