from __future__ import annotations

import http.client
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Iterator
from typing import Callable

PUBLIC_ADDRESS = "https://data.zenbujapanese.com"
USER_AGENT = "zenbu-language-data-check"
TIMEOUT_SECONDS = 60
CHUNK = 1024 * 1024
NOT_FOUND = 404


class DownloadError(Exception):
    pass


class PublicAddress:
    def __init__(self, base: str, urlopen: Callable = urllib.request.urlopen):
        self.base, self.urlopen = base.rstrip("/"), urlopen

    def url(self, key: str) -> str:
        return f"{self.base}/{urllib.parse.quote(key)}"

    def _open(self, key: str):
        request = urllib.request.Request(self.url(key), headers={"User-Agent": USER_AGENT})
        try:
            return self.urlopen(request, timeout=TIMEOUT_SECONDS)
        except urllib.error.HTTPError as error:
            if error.code == NOT_FOUND:
                raise FileNotFoundError(f"{key} answered {NOT_FOUND}") from None
            raise DownloadError(f"{key} answered HTTP {error.code}") from None
        except OSError as error:
            raise DownloadError(f"{key} couldn't be downloaded: {error}") from None

    def get(self, key: str) -> tuple[bytes, str] | None:
        try:
            with self._open(key) as response:
                return response.read(), response.headers.get("ETag", "")
        except FileNotFoundError:
            return None
        except (OSError, http.client.HTTPException) as error:
            raise DownloadError(f"{key} couldn't be downloaded: {error}") from None

    def chunks(self, key: str) -> Iterator[bytes]:
        try:
            with self._open(key) as response:
                while chunk := response.read(CHUNK):
                    yield chunk
        except FileNotFoundError:
            raise
        except (OSError, http.client.HTTPException) as error:
            raise DownloadError(f"{key} stopped downloading: {error}") from None
