# Vercel Python runtime entry point.
# Vercel looks for an ASGI/WSGI callable named `app` in api/index.py.
# We simply re-export the FastAPI application object from the main module.
from app.main import app  # noqa: F401
