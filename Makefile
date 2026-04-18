.PHONY: up down logs migrate build shell-backend shell-db

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

build:
	docker compose build

migrate:
	cd Web/backend && npm run db:migrate

shell-backend:
	docker compose exec backend sh

shell-db:
	docker compose exec postgres psql -U mms -d mms_db

test-backend:
	cd Web/backend && npm test

test-frontend:
	cd Web/frontend && npm test

dev-backend:
	cd Web/backend && npm run start:dev

dev-frontend:
	cd Web/frontend && npm run dev
