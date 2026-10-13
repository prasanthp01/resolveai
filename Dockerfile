FROM node:22-alpine AS frontend
WORKDIR /web
COPY web/package*.json ./
RUN npm ci --ignore-scripts
COPY web/ ./
COPY architecture /architecture
RUN npm run build
FROM python:3.12-alpine AS runtime
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
COPY web/public ./web/public
COPY --from=frontend /web/dist ./web/dist
RUN addgroup -S resolveai && adduser -S -G resolveai -u 10001 resolveai
USER 10001
EXPOSE 8000
CMD [".venv/bin/uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--no-access-log"]
