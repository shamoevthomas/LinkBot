"""
linkedin-api
"""

import importlib.metadata

from .linkedin import Linkedin

try:
    __version__ = importlib.metadata.version("open-linkedin-api")
except importlib.metadata.PackageNotFoundError:
    __version__ = "0.0.0"

__all__ = ["Linkedin", "__version__"]
