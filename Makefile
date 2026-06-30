# Talenta Attendance — task runner
# Usage: `make` (or `make help`) to list targets.

SHELL := /bin/bash
LOG   := ./storage/schedule.log
PID   := ./storage/schedule.pid

.DEFAULT_GOAL := help

## help: Show this help
.PHONY: help
help:
	@echo "Talenta Attendance — available commands:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  make /'

## install: Install Bun (if missing) and project dependencies
.PHONY: install
install:
	@command -v bun >/dev/null 2>&1 || { \
		echo "Bun not found — installing..."; \
		curl -fsSL https://bun.sh/install | bash; \
		echo ">> Restart your shell (or 'source ~/.zshrc') so 'bun' is on PATH, then re-run."; \
		exit 1; \
	}
	bun install

## run: Start the interactive menu (Clockin / Clockout / Auto) in the foreground
.PHONY: run
run:
	bun start

## clockin: One-shot clock in (still shows menu — pick "Clockin")
.PHONY: clockin
clockin:
	bun start

## clockout: One-shot clock out (still shows menu — pick "Clockout")
.PHONY: clockout
clockout:
	bun start

## cycle: Clock in, wait 10s, then clock out — non-interactive (override delay: make cycle DELAY=30)
.PHONY: cycle
cycle:
	DELAY=$${DELAY:-10} bun ./src/clock-cycle.ts

## schedule: Foreground scheduler — set CLOCKIN_TIME and CLOCKOUT_TIME, e.g.:
##           make schedule CLOCKIN_TIME=09:00 CLOCKOUT_TIME=18:00
.PHONY: schedule
schedule:
	@if [ -z "$(CLOCKIN_TIME)" ] || [ -z "$(CLOCKOUT_TIME)" ]; then \
		echo "Set CLOCKIN_TIME and CLOCKOUT_TIME, e.g. make schedule CLOCKIN_TIME=09:00 CLOCKOUT_TIME=18:00"; \
		exit 1; \
	fi
	@echo ">> Foreground scheduler — Ctrl-C to stop."
	@echo ">> caffeinate prevents idle sleep only; closing the lid on battery still sleeps."
	CLOCKIN_TIME=$(CLOCKIN_TIME) CLOCKOUT_TIME=$(CLOCKOUT_TIME) caffeinate -is bun ./src/schedule.ts

## schedule-bg: Background scheduler — set CLOCKIN_TIME and CLOCKOUT_TIME, e.g.:
##              make schedule-bg CLOCKIN_TIME=09:00 CLOCKOUT_TIME=18:00
.PHONY: schedule-bg
schedule-bg:
	@if [ -z "$(CLOCKIN_TIME)" ] || [ -z "$(CLOCKOUT_TIME)" ]; then \
		echo "Set CLOCKIN_TIME and CLOCKOUT_TIME, e.g. make schedule-bg CLOCKIN_TIME=09:00 CLOCKOUT_TIME=18:00"; \
		exit 1; \
	fi
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then \
		echo "Scheduler already running (PID $$(cat $(PID))). Run 'make stop' first."; \
		exit 1; \
	fi
	@mkdir -p storage
	@echo ">> Starting background scheduler — clockin $(CLOCKIN_TIME), clockout $(CLOCKOUT_TIME)"
	CLOCKIN_TIME=$(CLOCKIN_TIME) CLOCKOUT_TIME=$(CLOCKOUT_TIME) caffeinate -is bun ./src/schedule.ts > $(LOG) 2>&1 & echo $$! > $(PID)
	@echo ">> PID $$(cat $(PID)) — logs: $(LOG)"
	@echo ">> 'make logs' to follow, 'make status' to check, 'make stop' to stop."

## status: Show whether the background scheduler is running
.PHONY: status
status:
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then \
		echo "Scheduler RUNNING (PID $$(cat $(PID)))"; \
	else \
		echo "Scheduler not running"; \
	fi

## logs: Tail the background scheduler log
.PHONY: logs
logs:
	@touch $(LOG); tail -f $(LOG)

## stop: Stop the background scheduler
.PHONY: stop
stop:
	@if [ -f $(PID) ]; then \
		kill $$(cat $(PID)) 2>/dev/null && echo "Stopped PID $$(cat $(PID))"; \
		rm -f $(PID); \
	else \
		echo "No PID file — nothing to stop"; \
	fi

## test: Run unit tests
.PHONY: test
test:
	bun test

## clean: Remove installed dependencies and runtime files
.PHONY: clean
clean:
	rm -rf node_modules $(PID) $(LOG)
