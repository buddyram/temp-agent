FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# install CPU-only torch first (smaller, no CUDA)
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu torch==2.3.0+cpu \
 && pip install numpy pandas pyarrow requests matplotlib

COPY ml/ ./ml/
COPY outputs/weather.json ./outputs/weather.json

ENV PORT=8080 \
    WEATHER_URL=https://raw.githubusercontent.com/buddyram/temp-agent/main/outputs/weather.json

EXPOSE 8080
CMD ["python", "ml/serve.py"]
