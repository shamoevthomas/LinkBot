# Pin to bookworm (Debian 12), not trixie (13). Playwright's --with-deps
# script targets Ubuntu and pulls in legacy font packages (ttf-unifont,
# ttf-ubuntu-font-family) that exist in bookworm but were removed in trixie.
FROM python:3.11-slim-bookworm

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright Chromium — needed for reply_to_comment which can no longer hit
# /voyager/api/feed/comments. Only the Chromium browser is installed, not
# Firefox/WebKit, to keep the image smaller. --with-deps installs the apt
# packages Chromium needs (fonts, libnss3, libatk1.0, etc.).
RUN playwright install --with-deps chromium

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
