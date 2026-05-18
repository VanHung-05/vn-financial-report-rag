.PHONY: setup up down status logs reindex help

help:
	@./scripts/dev.sh help

setup:
	@./scripts/dev.sh setup

up:
	@./scripts/dev.sh up

down:
	@./scripts/dev.sh down

status:
	@./scripts/dev.sh status

logs:
	@./scripts/dev.sh logs all

reindex:
	@./scripts/dev.sh reindex
