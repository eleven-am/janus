JANUS_IMAGE := zot.maix.ovh/janus

VERSION := $(shell git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
GIT_SHA := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

PLATFORMS := linux/amd64,linux/arm64

.PHONY: build dev test clean release-patch release-minor release-major help

.DEFAULT_GOAL := help

build:
	@echo "Building janus ($(VERSION))..."
	docker buildx build \
		--platform $(PLATFORMS) \
		-t $(JANUS_IMAGE):$(VERSION) \
		-t $(JANUS_IMAGE):$(GIT_SHA) \
		-t $(JANUS_IMAGE):latest \
		--push \
		-f Dockerfile \
		.

dev:
	bun run dev

test:
	bun test

release-patch:
	@current=$(VERSION); \
	if [ "$$current" = "v0.0.0" ]; then \
		new="v0.0.1"; \
	else \
		new=$$(echo $$current | awk -F. '{$$NF = $$NF + 1;} 1' | sed 's/ /./g'); \
	fi; \
	echo "Releasing $$current -> $$new"; \
	git tag $$new && git push origin $$new

release-minor:
	@current=$(VERSION); \
	if [ "$$current" = "v0.0.0" ]; then \
		new="v0.1.0"; \
	else \
		new=$$(echo $$current | awk -F. '{$$(NF-1) = $$(NF-1) + 1; $$NF = 0;} 1' | sed 's/ /./g'); \
	fi; \
	echo "Releasing $$current -> $$new"; \
	git tag $$new && git push origin $$new

release-major:
	@current=$(VERSION); \
	if [ "$$current" = "v0.0.0" ]; then \
		new="v1.0.0"; \
	else \
		new=$$(echo $$current | awk -F. '{split($$1,a,"v"); printf "v%d.0.0", a[2]+1}'); \
	fi; \
	echo "Releasing $$current -> $$new"; \
	git tag $$new && git push origin $$new

clean:
	docker rmi -f $(JANUS_IMAGE):$(VERSION) $(JANUS_IMAGE):latest 2>/dev/null || true
	rm -rf .output

help:
	@echo "Janus Makefile"
	@echo ""
	@echo "  Docker Build (multi-arch, pushes to registry):"
	@echo "    make build           - Build and push to zot"
	@echo ""
	@echo "  Release (git tag + push):"
	@echo "    make release-patch   - Bump patch version (v0.0.X)"
	@echo "    make release-minor   - Bump minor version (v0.X.0)"
	@echo "    make release-major   - Bump major version (vX.0.0)"
	@echo ""
	@echo "  Development:"
	@echo "    make dev             - Start dev server"
	@echo "    make test            - Run tests"
	@echo ""
	@echo "  Other:"
	@echo "    make clean           - Remove images and build artifacts"
	@echo ""
	@echo "  Current: VERSION=$(VERSION) GIT_SHA=$(GIT_SHA)"
