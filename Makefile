.PHONY: setup up down restart status logs reindex seed reset help

help:
	@./scripts/dev.sh help

setup:
	@./scripts/dev.sh setup

up:
	@./scripts/dev.sh up

down:
	@./scripts/dev.sh down

restart:
	@./scripts/dev.sh restart

status:
	@./scripts/dev.sh status

logs:
	@./scripts/dev.sh logs all

reindex:
	@./scripts/dev.sh reindex

seed:
	@./scripts/dev.sh seed $(ARGS)

reset:
	@./scripts/dev.sh reset
