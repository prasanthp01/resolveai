FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS frontend
WORKDIR /web
COPY web/package*.json ./
RUN npm ci --ignore-scripts
COPY web/ ./
COPY architecture /architecture
COPY demo /demo
ARG VITE_APP_BASE=/projects/resolveai/app/
ENV VITE_APP_BASE=$VITE_APP_BASE
RUN npm run build
FROM python:3.12.15-alpine3.24@sha256:1b668429b3511ab407d8e00648891631b0b1a4d7e15e3ca70f38ab5b91ad4ab4 AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_NO_CACHE=1
RUN apk upgrade --no-cache && pip install --no-cache-dir uv==0.12.15
WORKDIR /srv/resolveai
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY demo ./demo
COPY architecture ./architecture
COPY contracts ./contracts
COPY web/public ./web/public
COPY --from=frontend /web/dist ./web/dist
RUN addgroup -S resolveai && adduser -S -G resolveai -u 10001 resolveai
USER 10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD .venv/bin/python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/ready',timeout=3)"
CMD [".venv/bin/uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--no-access-log"]
