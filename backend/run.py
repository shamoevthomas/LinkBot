import os
import uvicorn

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

if __name__ == "__main__":
    reload = os.environ.get("ENV") != "production"
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=reload)
